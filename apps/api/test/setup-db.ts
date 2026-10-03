import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDb, runMigrations, seed } from '@process-ai/db';

/** Starts a throwaway pgvector Postgres, migrates and seeds it. */
export async function startTestDb() {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'pgvector/pgvector:pg17',
  ).start();
  const { db, pool } = createDb(container.getConnectionUri());
  await runMigrations(db);
  await seed(db);
  return {
    db,
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
