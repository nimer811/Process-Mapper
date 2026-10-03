import { sql } from '@process-ai/db';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '@process-ai/db';

export const healthRoutes: FastifyPluginAsyncZod<{ db: Db }> = async (app, { db }) => {
  /** Liveness: the process is up. */
  app.get('/health', async () => ({ status: 'ok' }));

  /** Readiness: dependencies are reachable. */
  app.get('/ready', async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
};
