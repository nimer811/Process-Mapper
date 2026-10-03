import { createDb } from './client.js';
import { seed } from './seed.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { db, pool } = createDb(url);
await seed(db);
await pool.end();
console.log('Seed complete');
