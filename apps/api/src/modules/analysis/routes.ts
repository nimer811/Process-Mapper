import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { LlmGateway } from '@process-ai/agent';
import { automationOpportunities, eq, issues, type Db } from '@process-ai/db';
import { AnalyseInput, AnalyseResult, DecideInput, Findings, IssueInput } from '@process-ai/shared';
import { audit } from '../../lib/audit.js';
import { canViewVersion } from '../processes/visibility.js';
import { getVersionGraph } from '../processes/service.js';
import { loadVersionContext } from '../governance/service.js';
import { listFindings, runAnalysis } from './service.js';

const IdParams = z.object({ id: z.uuid() });

export const analysisRoutes: FastifyPluginAsyncZod<{ db: Db; llm: LlmGateway | null }> = async (
  app,
  { db, llm },
) => {
  /** Viewing follows version visibility; managing findings is for the process owner and admins. */
  const access = async (request: FastifyRequest, versionId: string) => {
    const user = app.requireUser(request);
    const ctx = await loadVersionContext(db, user, versionId).catch(() => null);
    if (
      !ctx ||
      !canViewVersion(user, ctx.version, {
        ownerUserId: ctx.process.ownerUserId,
        processCreatedBy: ctx.process.createdBy,
      })
    ) {
      throw app.httpErrors.notFound('Version not found');
    }
    const canManage = !ctx.process.archivedAt && (ctx.actor.isAdmin || ctx.actor.isOwner);
    return { user, ctx, canManage };
  };
  const requireManage = (canManage: boolean) => {
    if (!canManage)
      throw app.httpErrors.forbidden('Only the process owner or an admin can manage findings');
  };

  app.get(
    '/versions/:id/findings',
    { schema: { params: IdParams, response: { 200: Findings } } },
    async (request) => {
      const { canManage } = await access(request, request.params.id);
      return { ...(await listFindings(db, request.params.id)), canManage, aiAvailable: !!llm };
    },
  );

  app.post(
    '/versions/:id/analyse',
    { schema: { params: IdParams, body: AnalyseInput, response: { 200: AnalyseResult } } },
    async (request) => {
      const { user, canManage } = await access(request, request.params.id);
      requireManage(canManage);
      const graph = (await getVersionGraph(db, user, request.params.id))!;
      const { aiError } = await runAnalysis(db, llm, user, graph, request.body.ai);
      await audit(db, request, {
        action: 'version.analysed',
        entityType: 'process_version',
        entityId: graph.id,
        after: { ai: request.body.ai, aiError },
      });
      return { ...(await listFindings(db, graph.id)), canManage, aiAvailable: !!llm, aiError };
    },
  );

  app.post(
    '/versions/:id/issues',
    { schema: { params: IdParams, body: IssueInput } },
    async (request, reply) => {
      const { user, canManage, ctx } = await access(request, request.params.id);
      requireManage(canManage);
      const [row] = await db
        .insert(issues)
        .values({
          versionId: ctx.version.id,
          ...request.body,
          source: 'manual',
          status: 'accepted',
          createdBy: user.id,
          decidedBy: user.id,
          decidedAt: new Date(),
        })
        .returning();
      await audit(db, request, {
        action: 'issue.added',
        entityType: 'issue',
        entityId: row!.id,
        after: request.body,
      });
      return reply.status(201).send({ id: row!.id });
    },
  );

  /** Accept, dismiss, or re-open a finding. */
  const decide = async (
    request: FastifyRequest,
    entity: 'issue' | 'opportunity',
    row: { id: string; versionId: string } | undefined,
    body: z.infer<typeof DecideInput>,
  ) => {
    if (!row) throw app.httpErrors.notFound('Not found');
    const { user, canManage } = await access(request, row.versionId);
    requireManage(canManage);
    const proposed = body.status === 'proposed';
    const values = {
      status: body.status,
      decidedBy: proposed ? null : user.id,
      decidedAt: proposed ? null : new Date(),
      decisionNote: body.note ?? null,
    };
    if (entity === 'issue') await db.update(issues).set(values).where(eq(issues.id, row.id));
    else
      await db
        .update(automationOpportunities)
        .set(values)
        .where(eq(automationOpportunities.id, row.id));
    await audit(db, request, {
      action: `${entity}.${body.status}`,
      entityType: entity,
      entityId: row.id,
      after: body,
    });
  };

  app.patch(
    '/issues/:id',
    { schema: { params: IdParams, body: DecideInput } },
    async (request, reply) => {
      const row = await db.query.issues.findFirst({ where: eq(issues.id, request.params.id) });
      await decide(request, 'issue', row, request.body);
      return reply.status(204).send();
    },
  );

  app.patch(
    '/opportunities/:id',
    { schema: { params: IdParams, body: DecideInput } },
    async (request, reply) => {
      const row = await db.query.automationOpportunities.findFirst({
        where: eq(automationOpportunities.id, request.params.id),
      });
      await decide(request, 'opportunity', row, request.body);
      return reply.status(204).send();
    },
  );
};
