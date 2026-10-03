import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client.js';

const defaultFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

export async function runMigrations(db: Db, migrationsFolder = defaultFolder) {
  await migrate(db, { migrationsFolder });
}
