import { PgBoss } from 'pg-boss';
import type { FastifyBaseLogger } from 'fastify';

export const INGEST_QUEUE = 'ingest-document';

/** Background work the API hands off (document indexing). */
export interface JobQueue {
  enqueueIngest(documentId: string): Promise<void>;
  stop(): Promise<void>;
}

/**
 * pg-boss queue: jobs live in PostgreSQL (no Redis), survive restarts and are retried. The worker
 * runs in the API process for the pilot; it can move to its own container later unchanged.
 */
export async function createPgBossQueue(
  connectionString: string,
  handler: (documentId: string) => Promise<void>,
  log: FastifyBaseLogger,
): Promise<JobQueue> {
  const boss = new PgBoss({ connectionString, schema: 'pgboss' });
  boss.on('error', (err) => log.error({ err }, 'Job queue error'));
  await boss.start();
  await boss.createQueue(INGEST_QUEUE, { retryLimit: 2, retryDelay: 30, expireInSeconds: 15 * 60 });
  await boss.work<{ documentId: string }>(
    INGEST_QUEUE,
    { pollingIntervalSeconds: 2 },
    async (jobs) => {
      for (const job of jobs) await handler(job.data.documentId);
    },
  );
  return {
    enqueueIngest: async (documentId) => {
      await boss.send(INGEST_QUEUE, { documentId }, { singletonKey: documentId });
    },
    stop: () => boss.stop({ graceful: true, timeout: 10_000 }),
  };
}

/** Runs jobs immediately in-process (tests). */
export function createInlineQueue(handler: (documentId: string) => Promise<void>): JobQueue {
  return {
    enqueueIngest: async (documentId) => {
      await handler(documentId).catch(() => {}); // failures are recorded on the document
    },
    stop: async () => {},
  };
}
