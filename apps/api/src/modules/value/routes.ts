import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  and,
  automationOpportunities,
  eq,
  isNull,
  ne,
  processSteps,
  valueEstimates,
  type Db,
} from '@process-ai/db';
import { ValueFigureInput, ValueView } from '@process-ai/shared';
import { computeValue, estimateTimings, type LlmGateway } from '@process-ai/agent';
import { audit } from '../../lib/audit.js';
import { canViewVersion } from '../processes/visibility.js';
import { getVersionGraph } from '../processes/service.js';
import { loadVersionContext } from '../governance/service.js';

const IdParams = z.object({ id: z.uuid() });

/**
 * Timings, volume and value per version. Estimates are an analysis layer (like findings): they can
 * be added on any version, approved ones included, without changing the documented map.
 */
export const valueRoutes: FastifyPluginAsyncZod<{ db: Db; llm: LlmGateway | null }> = async (
  app,
  { db, llm },
) => {
  const ctxFor = async (request: FastifyRequest, versionId: string, manage = false) => {
    const user = app.requireUser(request);
    const ctx = await loadVersionContext(db, user, versionId).catch(() => null);
    if (
      !ctx ||
      !canViewVersion(user, ctx.version, {
        ownerUserId: ctx.process.ownerUserId,
        processCreatedBy: ctx.process.createdBy,
      })
    )
      throw app.httpErrors.notFound('Version not found');
    const canManage = !ctx.process.archivedAt && (ctx.actor.isAdmin || ctx.actor.isOwner);
    if (manage && !canManage)
      throw app.httpErrors.forbidden('Only the process owner or an admin can change timings');
    return { user, ctx, canManage };
  };

  const view = async (
    versionId: string,
    user: Parameters<typeof getVersionGraph>[1],
    canManage: boolean,
  ) => {
    const graph = (await getVersionGraph(db, user, versionId))!;
    const opportunities = await db
      .select({
        id: automationOpportunities.id,
        title: automationOpportunities.title,
        kind: automationOpportunities.kind,
        status: automationOpportunities.status,
        stepId: automationOpportunities.stepId,
      })
      .from(automationOpportunities)
      .where(
        and(
          eq(automationOpportunities.versionId, versionId),
          ne(automationOpportunities.status, 'dismissed'),
        ),
      );
    const estimates = await db
      .select()
      .from(valueEstimates)
      .where(eq(valueEstimates.versionId, versionId));
    return {
      graph,
      value: computeValue({
        graph,
        opportunities,
        estimates,
        canEdit: canManage,
        canEstimate: canManage && !!llm,
      }),
    };
  };

  app.get(
    '/versions/:id/value',
    { schema: { params: IdParams, response: { 200: ValueView } } },
    async (request) => {
      const { user, ctx, canManage } = await ctxFor(request, request.params.id);
      return (await view(ctx.version.id, user, canManage)).value;
    },
  );

  /** The owner's own figure for a step's effort/duration or the process volume (null clears it). */
  app.put(
    '/versions/:id/value/figures',
    { schema: { params: IdParams, body: ValueFigureInput, response: { 200: ValueView } } },
    async (request) => {
      const { user, ctx } = await ctxFor(request, request.params.id, true);
      const { stepId, ...figures } = request.body;
      if (stepId) {
        const step = await db.query.processSteps.findFirst({
          where: and(eq(processSteps.id, stepId), eq(processSteps.versionId, ctx.version.id)),
        });
        if (!step) throw app.httpErrors.badRequest('Step not in this version');
      }
      const where = and(
        eq(valueEstimates.versionId, ctx.version.id),
        stepId ? eq(valueEstimates.stepId, stepId) : isNull(valueEstimates.stepId),
        eq(valueEstimates.source, 'owner'),
      );
      const [current] = await db.select().from(valueEstimates).where(where);
      const next = {
        effortMinutes:
          figures.effortMinutes !== undefined
            ? figures.effortMinutes
            : (current?.effortMinutes ?? null),
        durationMinutes:
          figures.durationMinutes !== undefined
            ? figures.durationMinutes
            : (current?.durationMinutes ?? null),
        volumePerMonth:
          figures.volumePerMonth !== undefined
            ? figures.volumePerMonth
            : (current?.volumePerMonth ?? null),
      };
      const rounded = {
        effortMinutes: next.effortMinutes === null ? null : Math.round(next.effortMinutes),
        durationMinutes: next.durationMinutes === null ? null : Math.round(next.durationMinutes),
        volumePerMonth: next.volumePerMonth,
      };
      if (Object.values(rounded).every((v) => v === null)) {
        await db.delete(valueEstimates).where(where);
      } else if (current) {
        await db.update(valueEstimates).set(rounded).where(eq(valueEstimates.id, current.id));
      } else {
        await db.insert(valueEstimates).values({
          versionId: ctx.version.id,
          stepId: stepId ?? null,
          source: 'owner',
          ...rounded,
        });
      }
      await audit(db, request, {
        action: 'value.figure_set',
        entityType: 'process_version',
        entityId: ctx.version.id,
        after: request.body,
      });
      return (await view(ctx.version.id, user, true)).value;
    },
  );

  /** The AI estimates what is missing; earlier AI estimates are replaced, owner figures kept. */
  app.post(
    '/versions/:id/value/estimate',
    { schema: { params: IdParams, response: { 200: ValueView } } },
    async (request) => {
      if (!llm)
        throw app.httpErrors.serviceUnavailable('The AI is not configured. Set LLM_API_KEY.');
      const { user, ctx } = await ctxFor(request, request.params.id, true);
      await db
        .delete(valueEstimates)
        .where(and(eq(valueEstimates.versionId, ctx.version.id), eq(valueEstimates.source, 'ai')));
      const { graph, value } = await view(ctx.version.id, user, true);
      const est = await estimateTimings(llm, {
        processName: ctx.process.name,
        graph,
        current: value,
      });
      const rows = [
        ...est.steps.map((s) => ({
          versionId: ctx.version.id,
          stepId: s.stepId,
          source: 'ai' as const,
          effortMinutes: s.effortMinutes,
          durationMinutes: s.durationMinutes,
          reasoning: s.reasoning,
        })),
        ...(est.volume
          ? [
              {
                versionId: ctx.version.id,
                stepId: null,
                source: 'ai' as const,
                volumePerMonth: est.volume.value,
                reasoning: est.volume.reasoning,
              },
            ]
          : []),
      ];
      if (rows.length) await db.insert(valueEstimates).values(rows);
      await audit(db, request, {
        action: 'value.estimated',
        entityType: 'process_version',
        entityId: ctx.version.id,
        after: { steps: est.steps.length, volume: !!est.volume },
      });
      return (await view(ctx.version.id, user, true)).value;
    },
  );
};
