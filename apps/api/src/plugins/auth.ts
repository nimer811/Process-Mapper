import fp from 'fastify-plugin';
import { z } from 'zod';
import { eq, type Db, users } from '@process-ai/db';
import { DEV_USER_HEADER, type CurrentUser, type UserRole } from '@process-ai/shared';
import type { JWTVerifyGetKey } from 'jose';
import type { Config } from '../config.js';
import { entraVerifier } from './entra.js';

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
 * - entra: validates Entra ID access tokens (Authorization: Bearer …).
 */
export const authPlugin = fp<{ config: Config; db: Db; entraKeys?: JWTVerifyGetKey }>(
  async (app, { config, db, entraKeys }) => {
    app.decorateRequest('user', null);

    if (config.AUTH_MODE === 'entra') {
      const entra = entraVerifier(config, db, entraKeys);
      app.addHook('onRequest', async (request) => {
        const header = request.headers.authorization;
        if (!header?.startsWith('Bearer ')) return;
        try {
          request.user = await entra.verify(header.slice(7));
        } catch (err) {
          request.log.info({ err }, 'Rejected access token');
        }
      });
    } else
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
  },
);
