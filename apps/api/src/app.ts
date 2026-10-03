import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Db } from '@process-ai/db';
import type { Config } from './config.js';
import { registerErrorHandling } from './plugins/errors.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './modules/health/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { departmentRoutes } from './modules/departments/routes.js';
import { processRoutes } from './modules/processes/routes.js';

export interface AppDeps {
  config: Config;
  db: Db;
}

export async function buildApp({ config, db }: AppDeps, opts: FastifyServerOptions = {}) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      ...(config.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
    },
    genReqId: () => crypto.randomUUID(),
    ...opts,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible);
  if (config.CORS_ORIGIN) await app.register(cors, { origin: config.CORS_ORIGIN });
  registerErrorHandling(app);
  await app.register(authPlugin, { config, db });

  await app.register(healthRoutes, { db });
  await app.register(
    async (api) => {
      await api.register(authRoutes, { db, config });
      await api.register(departmentRoutes, { db });
      await api.register(processRoutes, { db });
    },
    { prefix: '/api/v1' },
  );

  if (config.WEB_DIST_DIR && fs.existsSync(config.WEB_DIST_DIR)) {
    await serveSpa(app, path.resolve(config.WEB_DIST_DIR));
  }

  return app;
}

/** Serve the built SPA, falling back to index.html for client-side routes. */
async function serveSpa(app: FastifyInstance, root: string) {
  await app.register(fastifyStatic, { root, wildcard: false });
  app.get('/*', (request, reply) => {
    if (request.url.startsWith('/api/')) return reply.callNotFound();
    return reply.sendFile('index.html');
  });
}
