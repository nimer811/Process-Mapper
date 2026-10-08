import { createDb, runMigrations, seed, seedDemo } from '@process-ai/db';
import { buildApp } from './app.js';
import { syncAllVersionTasks } from './modules/tasks/service.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);

if (config.MIGRATE_ON_START) await runMigrations(db, config.MIGRATIONS_DIR);
if (config.SEED_ON_START) await seed(db);
if (config.SEED_ON_START && config.SEED_DEMO_ON_START) await seedDemo(db);

const app = await buildApp({ config, db });
// Review tasks for versions already waiting (e.g. from before the inbox existed, or the demo data).
await syncAllVersionTasks(db).catch((err) => app.log.warn({ err }, 'Task sync failed'));

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: config.HOST });
