import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { asc, count, eq, interviewSessions, users, type Db } from '@process-ai/db';
import { AdminSettings, AiUsage, PersonRecord } from '@process-ai/shared';
import type { Config } from '../../config.js';
import { audit } from '../../lib/audit.js';
import { aiUsage, currentMonth } from './usage.js';
import { erasePerson, exportPerson, purgeExpiredTranscripts } from './privacy.js';

const IdParams = z.object({ id: z.uuid() });

/** Admin: AI usage and budget, people's data (export, erase) and transcript retention. */
export const adminRoutes: FastifyPluginAsyncZod<{ db: Db; config: Config }> = async (
  app,
  { db, config },
) => {
  app.get('/admin/settings', { schema: { response: { 200: AdminSettings } } }, async (request) => {
    app.requireRole(request, 'admin');
    return {
      authMode: config.AUTH_MODE,
      transcriptRetentionMonths: config.TRANSCRIPT_RETENTION_MONTHS,
      aiMonthlyTokenBudget: config.AI_MONTHLY_TOKEN_BUDGET,
    };
  });

  app.get(
    '/admin/ai-usage',
    {
      schema: {
        querystring: z.object({
          month: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .optional(),
        }),
        response: { 200: AiUsage },
      },
    },
    async (request) => {
      app.requireRole(request, 'admin');
      return aiUsage(db, config, request.query.month ?? currentMonth());
    },
  );

  app.get(
    '/admin/people',
    { schema: { response: { 200: z.array(PersonRecord) } } },
    async (request) => {
      app.requireRole(request, 'admin');
      const counts = await db
        .select({ userId: interviewSessions.userId, n: count() })
        .from(interviewSessions)
        .groupBy(interviewSessions.userId);
      const byUser = new Map(counts.map((c) => [c.userId, c.n]));
      return (await db.select().from(users).orderBy(asc(users.displayName))).map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        roles: u.roles,
        isActive: u.isActive,
        erasedAt: u.erasedAt?.toISOString() ?? null,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        interviews: byUser.get(u.id) ?? 0,
      }));
    },
  );

  /** Everything stored about a person (data-access request), as a JSON download. */
  app.get('/admin/people/:id/export', { schema: { params: IdParams } }, async (request, reply) => {
    app.requireRole(request, 'admin');
    const data = await exportPerson(db, request.params.id);
    if (!data) throw app.httpErrors.notFound('Person not found');
    await audit(db, request, {
      action: 'person.exported',
      entityType: 'user',
      entityId: request.params.id,
    });
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="person-${request.params.id}.json"`)
      .send(JSON.stringify(data, null, 2));
  });

  /** The person left: remove their interview words and anonymise the account. Cannot be undone. */
  app.post(
    '/admin/people/:id/erase',
    { schema: { params: IdParams, body: z.object({ confirm: z.literal('ERASE') }) } },
    async (request) => {
      const admin = app.requireRole(request, 'admin');
      if (admin.id === request.params.id)
        throw app.httpErrors.badRequest('You cannot erase your own account');
      const target = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
      if (!target) throw app.httpErrors.notFound('Person not found');
      if (target.erasedAt) throw app.httpErrors.conflict('Already erased');
      const result = await erasePerson(db, target.id);
      await audit(db, request, {
        action: 'person.erased',
        entityType: 'user',
        entityId: target.id,
        after: result,
      });
      return result;
    },
  );

  /** Runs the transcript retention policy now (it also runs daily). */
  app.post('/admin/retention/run', async (request) => {
    app.requireRole(request, 'admin');
    const purged = await purgeExpiredTranscripts(db, config.TRANSCRIPT_RETENTION_MONTHS);
    await audit(db, request, {
      action: 'retention.run',
      entityType: 'system',
      entityId: null,
      after: { purged },
    });
    return { purged };
  });
};
