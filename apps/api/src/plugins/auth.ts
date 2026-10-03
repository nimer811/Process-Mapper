import fp from 'fastify-plugin';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users, type Db } from '@process-ai/db';
import { DEV_USER_HEADER, type CurrentUser, type UserRole } from '@process-ai/shared';
import type { Config } from '../config.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: CurrentUser | null;
  }
  interface FastifyInstance {
    requireUser: (request: FastifyRequest) => CurrentUser;
    requireRole: (request: FastifyRequest, role: UserRole) => CurrentUser;
  }
}

const uuid = z.uuid();

/**
 * Resolves the calling user for every request.
 * - dev:   trusts the DEV_USER_HEADER (seeded user id). Local only.
 * - entra: validates Entra ID access tokens (Phase 6).
 */
export const authPlugin = fp<{ config: Config; db: Db }>(async (app, { config, db }) => {
  if (config.AUTH_MODE === 'entra') {
    throw new Error('AUTH_MODE=entra is implemented in Phase 6. Use AUTH_MODE=dev for now.');
  }

  app.decorateRequest('user', null);

  app.addHook('onRequest', async (request) => {
    const header = request.headers[DEV_USER_HEADER];
    const userId = Array.isArray(header) ? header[0] : header;
    if (!userId || !uuid.safeParse(userId).success) return;

    const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!row || !row.isActive) return;

    request.user = {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      department: row.departmentText,
      roles: row.roles,
    };
  });

  app.decorate('requireUser', (request) => {
    if (!request.user) throw app.httpErrors.unauthorized('Sign in required');
    return request.user;
  });

  app.decorate('requireRole', (request, role) => {
    const user = app.requireUser(request);
    if (!user.roles.includes(role)) throw app.httpErrors.forbidden('Insufficient permissions');
    return user;
  });
});
