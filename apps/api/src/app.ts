import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Db } from '@process-ai/db';
import { AiSdkGateway, LlmDocumentClassifier, type LlmGateway } from '@process-ai/agent';
import { documents, eq } from '@process-ai/db';
import {
  ingestDocument,
  LocalFileStore,
  type Embedder,
  type FileStore,
} from '@process-ai/knowledge';
import { createInlineQueue, createPgBossQueue, type JobQueue } from './lib/jobs.js';
import { knowledgeRoutes, UPLOAD_LIMITS } from './modules/knowledge/routes.js';
import { governanceRoutes } from './modules/governance/routes.js';
import { analysisRoutes } from './modules/analysis/routes.js';
import { designRoutes } from './modules/design/routes.js';
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
  /** Injected in tests; otherwise local disk at STORAGE_DIR. */
  store?: FileStore;
  /** "inline" runs indexing immediately (tests); default is the pg-boss queue. */
  jobs?: 'inline' | 'pgboss';
}

export function llmFromConfig(config: Config): LlmGateway | null {
  if (!config.LLM_API_KEY) return null;
  return new AiSdkGateway({
    provider: config.LLM_PROVIDER,
    apiKey: config.LLM_API_KEY,
    chatModel: config.LLM_CHAT_MODEL,
    extractionModel: config.LLM_EXTRACTION_MODEL,
    embeddingModel: config.LLM_EMBEDDING_MODEL,
    azureResourceName: config.AZURE_OPENAI_RESOURCE_NAME,
    azureApiVersion: config.AZURE_OPENAI_API_VERSION,
  });
}

export async function buildApp(
  { config, db, llm, store, jobs }: AppDeps,
  opts: FastifyServerOptions = {},
) {
  const gateway = llm === undefined ? llmFromConfig(config) : llm;
  const fileStore = store ?? new LocalFileStore(config.STORAGE_DIR);
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
  await app.register(multipart, { limits: UPLOAD_LIMITS });

  const embedder: Embedder | null = gateway;
  const classifier = gateway ? new LlmDocumentClassifier(gateway) : null;
  const ingest = async (documentId: string) => {
    if (!embedder) {
      await db
        .update(documents)
        .set({ status: 'failed', error: 'The embedding model is not configured (LLM_API_KEY).' })
        .where(eq(documents.id, documentId));
      return;
    }
    try {
      const result = await ingestDocument(
        { db, store: fileStore, embedder, classifier },
        documentId,
      );
      app.log.info({ documentId, chunks: result?.chunks }, 'Document indexed');
    } catch (err) {
      app.log.warn({ err, documentId }, 'Document indexing failed');
    }
  };
  const queue: JobQueue =
    jobs === 'inline'
      ? createInlineQueue(ingest)
      : await createPgBossQueue(config.DATABASE_URL, ingest, app.log);
  app.addHook('onClose', () => queue.stop());
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
      await api.register(knowledgeRoutes, { db, store: fileStore, embedder, jobs: queue });
      await api.register(governanceRoutes, { db });
      await api.register(analysisRoutes, { db, llm: gateway });
      await api.register(designRoutes, { db, llm: gateway });
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
