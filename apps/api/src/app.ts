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
  AzureBlobFileStore,
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
import type { JWTVerifyGetKey } from 'jose';
import { authPlugin } from './plugins/auth.js';
import { registerAccessCode } from './plugins/access-code.js';
import { RecordingGateway, registerAiContext } from './lib/ai-usage.js';
import { healthRoutes } from './modules/health/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { departmentRoutes } from './modules/departments/routes.js';
import { processRoutes } from './modules/processes/routes.js';
import { packRoutes } from './modules/packs/routes.js';
import { interviewRoutes } from './modules/interviews/routes.js';
import { taskRoutes } from './modules/tasks/routes.js';
import { contributionRoutes } from './modules/contributions/routes.js';
import { controlRoutes } from './modules/governance/controls-routes.js';
import { sopRoutes } from './modules/sop/routes.js';
import { practiceRoutes } from './modules/practices/routes.js';
import { architectureRoutes } from './modules/architecture/routes.js';
import { valueRoutes } from './modules/value/routes.js';
import { reviewRoutes } from './modules/reviews/routes.js';
import { adminRoutes } from './modules/admin/routes.js';

export interface AppDeps {
  config: Config;
  db: Db;
  /** Injected in tests; otherwise built from config (null when no API key is set). */
  llm?: LlmGateway | null;
  /** Injected in tests; otherwise local disk at STORAGE_DIR. */
  store?: FileStore;
  /** "inline" runs indexing immediately (tests); default is the pg-boss queue. */
  jobs?: 'inline' | 'pgboss';
  /** Injected in tests: keys that sign Entra test tokens (otherwise Microsoft's published keys). */
  entraKeys?: JWTVerifyGetKey;
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
  { config, db, llm, store, jobs, entraKeys }: AppDeps,
  opts: FastifyServerOptions = {},
) {
  const model = llm === undefined ? llmFromConfig(config) : llm;
  const fileStore =
    store ??
    (config.STORAGE_DRIVER === 'azure'
      ? new AzureBlobFileStore(
          config.AZURE_STORAGE_CONNECTION_STRING!,
          config.AZURE_STORAGE_CONTAINER,
        )
      : new LocalFileStore(config.STORAGE_DIR));
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

  // Every AI call is logged (user, process, tokens) and stops once the monthly budget is used.
  const gateway = model
    ? new RecordingGateway(model, db, {
        monthlyTokenBudget: config.AI_MONTHLY_TOKEN_BUDGET,
        log: app.log,
      })
    : null;
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
  registerAccessCode(app, config.DEMO_ACCESS_CODE);
  await app.register(authPlugin, { config, db, entraKeys });
  registerAiContext(app);

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
      await api.register(taskRoutes, { db });
      await api.register(contributionRoutes, { db, llm: gateway });
      await api.register(controlRoutes, { db, llm: gateway });
      await api.register(practiceRoutes, { db });
      await api.register(architectureRoutes, { db, llm: gateway });
      await api.register(valueRoutes, { db, llm: gateway });
      await api.register(reviewRoutes, { db });
      await api.register(adminRoutes, { db, config });
      await api.register(sopRoutes, {
        db,
        llm: gateway,
        store: fileStore,
        jobs: queue,
        orgCode: config.ORG_CODE,
      });
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
