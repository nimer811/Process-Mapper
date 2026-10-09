import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq, processAlerts, validationEvents, type Db } from '@process-ai/db';
import { MarkReviewedInput, ResolveAlertInput, ReviewState } from '@process-ai/shared';
import { audit } from '../../lib/audit.js';
import { getProcess } from '../processes/service.js';
import { markReviewed, resolveAlert, reviewState } from './service.js';

const IdParams = z.object({ id: z.uuid() });

/** Periodic reviews and alerts when documents a process relies on change. */
export const reviewRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  const processFor = async (request: Parameters<typeof app.requireUser>[0], id: string) => {
    const user = app.requireUser(request);
    const p = await getProcess(db, user, id);
    if (!p) throw app.httpErrors.notFound('Process not found');
    return {
      user,
      p,
      canManage: !p.archivedAt && (user.roles.includes('admin') || p.owner?.id === user.id),
    };
  };

  app.get(
    '/processes/:id/review',
    { schema: { params: IdParams, response: { 200: ReviewState } } },
    async (request) => {
      const { p, canManage } = await processFor(request, request.params.id);
      return reviewState(db, p.id, canManage);
    },
  );

  /** "Still accurate, no changes": the review clock restarts and the history records it. */
  app.post(
    '/processes/:id/review',
    { schema: { params: IdParams, body: MarkReviewedInput, response: { 200: ReviewState } } },
    async (request) => {
      const { user, p, canManage } = await processFor(request, request.params.id);
      if (!canManage)
        throw app.httpErrors.forbidden('Only the process owner or an admin can review it');
      const v = await markReviewed(db, p.id, user.id);
      if (!v)
        throw app.httpErrors.conflict('Nothing to review yet: no validated or approved version');
      await db.insert(validationEvents).values({
        versionId: v.id,
        action: 'reviewed',
        actorUserId: user.id,
        comment: request.body.comment?.trim() || 'Reviewed — no changes needed',
      });
      await audit(db, request, {
        action: 'process.reviewed',
        entityType: 'process',
        entityId: p.id,
        after: request.body,
      });
      return reviewState(db, p.id, true);
    },
  );

  app.post(
    '/process-alerts/:id/resolve',
    { schema: { params: IdParams, body: ResolveAlertInput, response: { 200: ReviewState } } },
    async (request) => {
      const alert = await db.query.processAlerts.findFirst({
        where: eq(processAlerts.id, request.params.id),
      });
      if (!alert) throw app.httpErrors.notFound('Alert not found');
      const { user, p, canManage } = await processFor(request, alert.processId);
      if (!canManage)
        throw app.httpErrors.forbidden('Only the process owner or an admin can resolve this');
      await resolveAlert(db, alert.id, user.id, request.body.resolution);
      await audit(db, request, {
        action: 'alert.resolved',
        entityType: 'process_alert',
        entityId: alert.id,
        after: request.body,
      });
      return reviewState(db, p.id, true);
    },
  );
};
