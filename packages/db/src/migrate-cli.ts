import { createDb } from './client.js';
import { runMigrations } from './migrate.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { db, pool } = createDb(url);
await runMigrations(db);
await pool.end();
console.log('Migrations applied');
