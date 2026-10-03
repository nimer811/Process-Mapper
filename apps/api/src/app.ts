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
import { AiSdkGateway, type LlmGateway } from '@process-ai/agent';
import type { Config } from './config.js';
import { registerErrorHandling } from './plugins/errors.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './modules/health/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { departmentRoutes } from './modules/departments/routes.js';
import { processRoutes } from './modules/processes/routes.js';
import { packRoutes } from './modules/packs/routes.js';
import { interviewRoutes } from './modules/interviews/routes.js';

export interface AppDeps {
  config: Config;
  db: Db;
  /** Injected in tests; otherwise built from config (null when no API key is set). */
  llm?: LlmGateway | null;
}

export function llmFromConfig(config: Config): LlmGateway | null {
  if (!config.LLM_API_KEY) return null;
  return new AiSdkGateway({
    provider: config.LLM_PROVIDER,
    apiKey: config.LLM_API_KEY,
    chatModel: config.LLM_CHAT_MODEL,
    extractionModel: config.LLM_EXTRACTION_MODEL,
    azureResourceName: config.AZURE_OPENAI_RESOURCE_NAME,
    azureApiVersion: config.AZURE_OPENAI_API_VERSION,
  });
}

export async function buildApp({ config, db, llm }: AppDeps, opts: FastifyServerOptions = {}) {
  const gateway = llm === undefined ? llmFromConfig(config) : llm;
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
      await api.register(packRoutes, { db });
      await api.register(interviewRoutes, { db, llm: gateway });
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
