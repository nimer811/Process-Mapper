import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { asc, eq, type Db, users } from '@process-ai/db';
import { CurrentUser, DevUser } from '@process-ai/shared';
import type { Config } from '../../config.js';

export const authRoutes: FastifyPluginAsyncZod<{ db: Db; config: Config }> = async (
  app,
  { db, config },
) => {
  app.get('/me', { schema: { response: { 200: CurrentUser } } }, async (request) => {
    return app.requireUser(request);
  });

  if (config.AUTH_MODE === 'dev') {
    /** Lists seeded users for the dev login page. Only registered in dev auth mode. */
    app.get('/auth/dev-users', { schema: { response: { 200: z.array(DevUser) } } }, async () => {
      const rows = await db.query.users.findMany({
        where: eq(users.isActive, true),
        orderBy: asc(users.displayName),
      });
      return rows.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        roles: u.roles,
      }));
    });
  }
};
