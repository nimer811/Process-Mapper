import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { applyDesign, designToBe, type LlmGateway } from '@process-ai/agent';
import {
  and,
  asc,
  automationOpportunities,
  designChanges,
  eq,
  inArray,
  llmCalls,
  processVersions,
  validationEvents,
  type Db,
} from '@process-ai/db';
import { DesignDetail, ToBeInput } from '@process-ai/shared';
import { audit } from '../../lib/audit.js';
import { canViewVersion } from '../processes/visibility.js';
import { getProcess, getVersionGraph } from '../processes/service.js';
import { cloneVersion, loadVersionContext, openVersionExists } from '../governance/service.js';

const IdParams = z.object({ id: z.uuid() });

export const designRoutes: FastifyPluginAsyncZod<{ db: Db; llm: LlmGateway | null }> = async (
  app,
  { db, llm },
) => {
  /**
   * Designs a To-Be process from the current As-Is: the AI proposes typed changes implementing the
   * chosen opportunities and goals; code applies them to a new To-Be draft. The As-Is is untouched.
   */
  app.post(
    '/versions/:id/to-be',
    {
      schema: {
        params: IdParams,
        body: ToBeInput,
        response: {
          201: z.object({
            id: z.uuid(),
            versionNumber: z.number(),
            applied: z.number(),
            skipped: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const user = app.requireUser(request);
      const ctx = await loadVersionContext(db, user, request.params.id).catch(() => null);
      if (!ctx) throw app.httpErrors.notFound('Version not found');
      if (!(ctx.actor.isAdmin || ctx.actor.isOwner))
        throw app.httpErrors.forbidden('Only the process owner or an admin can design a To-Be');
      if (ctx.process.archivedAt) throw app.httpErrors.conflict('This process is archived');
      if (ctx.version.kind !== 'as_is' || ctx.process.currentVersionId !== ctx.version.id) {
        throw app.httpErrors.conflict(
          'To-Be designs start from the current (validated) As-Is version',
        );
      }
      if (await openVersionExists(db, ctx.process.id, 'to_be')) {
        throw app.httpErrors.conflict('A To-Be design is already in progress for this process');
      }
      if (!llm)
        throw app.httpErrors.serviceUnavailable('The AI model is not configured. Set LLM_API_KEY.');

      const asIs = (await getVersionGraph(db, user, ctx.version.id))!;
      const process = (await getProcess(db, user, ctx.process.id))!;
      const opps = request.body.opportunityIds.length
        ? await db
            .select()
            .from(automationOpportunities)
            .where(
              and(
                eq(automationOpportunities.versionId, ctx.version.id),
                inArray(automationOpportunities.id, request.body.opportunityIds),
              ),
            )
        : [];
      if (opps.length !== request.body.opportunityIds.length)
        throw app.httpErrors.badRequest('Unknown opportunity for this version');
      if (!opps.length && !request.body.goals?.trim())
        throw app.httpErrors.badRequest('Choose at least one opportunity or describe your goals');

      const labelled = opps.map((o, i) => ({ label: `O${i + 1}`, o }));
      const keyOf = new Map(asIs.steps.map((s) => [s.id, s.stepKey]));
      let design;
      try {
        design = await designToBe(
          llm,
          {
            processName: process.name,
            asIs,
            goals: request.body.goals ?? null,
            opportunities: labelled.map(({ label, o }) => ({
              label,
              title: o.title,
              description: o.description,
              stepKey: o.stepId ? (keyOf.get(o.stepId) ?? null) : null,
              expectedBenefit: o.expectedBenefit,
            })),
          },
          (r) =>
            void db
              .insert(llmCalls)
              .values({ ...r })
              .catch(() => {}),
        );
      } catch (err) {
        request.log.warn({ err }, 'To-Be design failed');
        throw app.httpErrors.badGateway('The AI could not produce a design. Please try again.');
      }

      const summary = [
        design.summary.trim(),
        design.expected_benefits.length
          ? `Expected benefits:\n${design.expected_benefits.map((b) => `• ${b}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const { version, applied } = await db.transaction(async (tx) => {
        const t = tx as unknown as Db;
        const version = await cloneVersion(t, ctx.version, {
          kind: 'to_be',
          changeSummary: `To-Be design based on As-Is v${ctx.version.versionNumber}`,
          userId: user.id,
          designGoals: request.body.goals?.trim() || null,
        });
        const applied = await applyDesign(
          t,
          {
            versionId: version.id,
            departmentId: ctx.process.departmentId,
            opportunityIds: new Map(labelled.map(({ label, o }) => [label, o.id])),
          },
          design.changes,
        );
        await tx
          .update(processVersions)
          .set({ designSummary: summary })
          .where(eq(processVersions.id, version.id));
        await tx.insert(validationEvents).values({
          versionId: version.id,
          action: 'reopened',
          actorUserId: user.id,
          comment: 'To-Be design created with AI',
        });
        return { version, applied };
      });
      if (applied.skipped.length)
        request.log.info({ skipped: applied.skipped }, 'Some design changes were skipped');
      await audit(db, request, {
        action: 'version.to_be_designed',
        entityType: 'process_version',
        entityId: version.id,
        after: {
          basedOn: ctx.version.id,
          opportunities: request.body.opportunityIds,
          applied: applied.applied,
          skipped: applied.skipped,
        },
      });
      return reply.status(201).send({
        id: version.id,
        versionNumber: version.versionNumber,
        applied: applied.applied,
        skipped: applied.skipped.length,
      });
    },
  );

  /** What a To-Be design changed relative to its As-Is, and why. */
  app.get(
    '/versions/:id/design',
    { schema: { params: IdParams, response: { 200: DesignDetail } } },
    async (request) => {
      const user = app.requireUser(request);
      const ctx = await loadVersionContext(db, user, request.params.id).catch(() => null);
      if (
        !ctx ||
        !canViewVersion(user, ctx.version, {
          ownerUserId: ctx.process.ownerUserId,
          processCreatedBy: ctx.process.createdBy,
        })
      ) {
        throw app.httpErrors.notFound('Version not found');
      }
      if (ctx.version.kind !== 'to_be') throw app.httpErrors.notFound('Not a To-Be design');
      const base = ctx.version.basedOnVersionId
        ? await db.query.processVersions.findFirst({
            where: eq(processVersions.id, ctx.version.basedOnVersionId),
          })
        : null;
      const rows = await db
        .select({
          change: designChanges,
          opp: { id: automationOpportunities.id, title: automationOpportunities.title },
        })
        .from(designChanges)
        .leftJoin(
          automationOpportunities,
          eq(automationOpportunities.id, designChanges.opportunityId),
        )
        .where(eq(designChanges.versionId, ctx.version.id))
        .orderBy(asc(designChanges.createdAt));
      return {
        basedOn: base
          ? { id: base.id, versionNumber: base.versionNumber, status: base.status }
          : null,
        goals: ctx.version.designGoals,
        summary: ctx.version.designSummary,
        changes: rows.map(({ change: c, opp }) => ({
          id: c.id,
          changeType: c.changeType,
          stepKey: c.stepKey,
          description: c.description,
          rationale: c.rationale,
          opportunity: opp?.id ? opp : null,
        })),
      };
    },
  );
};
