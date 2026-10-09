import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { asc, bestPractices, eq, type Db } from '@process-ai/db';
import { BestPractice, BestPracticeInput, OwnershipView } from '@process-ai/shared';
import { ownershipView } from '@process-ai/agent';
import { audit } from '../../lib/audit.js';
import { canViewVersion } from '../processes/visibility.js';
import { getVersionGraph } from '../processes/service.js';
import { listControls } from '../governance/controls.js';
import { loadVersionContext } from '../governance/service.js';

const IdParams = z.object({ id: z.uuid() });

const toPractice = (p: typeof bestPractices.$inferSelect): BestPractice => ({
  id: p.id,
  title: p.title,
  statement: p.statement,
  category: p.category,
  keywords: p.keywords,
  departmentId: p.departmentId,
  source: p.source,
  isActive: p.isActive,
});

export async function listPractices(db: Db) {
  return (
    await db
      .select()
      .from(bestPractices)
      .orderBy(asc(bestPractices.category), asc(bestPractices.title))
  ).map(toPractice);
}

/** The best-practice library (admins edit it) and each version's ownership view (RACI + checks). */
export const practiceRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  app.get(
    '/best-practices',
    { schema: { response: { 200: z.array(BestPractice) } } },
    async (request) => {
      app.requireUser(request);
      return listPractices(db);
    },
  );

  app.post(
    '/best-practices',
    { schema: { body: BestPracticeInput, response: { 201: BestPractice } } },
    async (request, reply) => {
      app.requireRole(request, 'admin');
      const [row] = await db
        .insert(bestPractices)
        .values({ ...request.body, keywords: request.body.keywords ?? [] })
        .returning();
      await audit(db, request, {
        action: 'practice.added',
        entityType: 'best_practice',
        entityId: row!.id,
        after: request.body,
      });
      return reply.status(201).send(toPractice(row!));
    },
  );

  app.patch(
    '/best-practices/:id',
    {
      schema: {
        params: IdParams,
        body: BestPracticeInput.partial(),
        response: { 200: BestPractice },
      },
    },
    async (request) => {
      app.requireRole(request, 'admin');
      const [row] = await db
        .update(bestPractices)
        .set(request.body)
        .where(eq(bestPractices.id, request.params.id))
        .returning();
      if (!row) throw app.httpErrors.notFound('Practice not found');
      await audit(db, request, {
        action: 'practice.updated',
        entityType: 'best_practice',
        entityId: row.id,
        after: request.body,
      });
      return toPractice(row);
    },
  );

  app.delete('/best-practices/:id', { schema: { params: IdParams } }, async (request, reply) => {
    app.requireRole(request, 'admin');
    const deleted = await db
      .delete(bestPractices)
      .where(eq(bestPractices.id, request.params.id))
      .returning();
    if (!deleted.length) throw app.httpErrors.notFound('Practice not found');
    await audit(db, request, {
      action: 'practice.deleted',
      entityType: 'best_practice',
      entityId: request.params.id,
    });
    return reply.status(204).send();
  });

  /** RACI per step and the automatic ownership and control checks (no AI; computed on read). */
  app.get(
    '/versions/:id/ownership',
    { schema: { params: IdParams, response: { 200: OwnershipView } } },
    async (request) => {
      const user = app.requireUser(request);
      const ctx = await loadVersionContext(db, user, request.params.id).catch(() => null);
      if (
        !ctx ||
        !canViewVersion(user, ctx.version, {
          ownerUserId: ctx.process.ownerUserId,
          processCreatedBy: ctx.process.createdBy,
        })
      )
        throw app.httpErrors.notFound('Version not found');
      const graph = (await getVersionGraph(db, user, ctx.version.id))!;
      return ownershipView({
        graph,
        controls: await listControls(db, ctx.version.id),
        practices: await listPractices(db),
      });
    },
  );
};
