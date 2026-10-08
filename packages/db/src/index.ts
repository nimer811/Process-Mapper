export * from './schema/index.js';
export { createDb, type Db } from './client.js';
export { runMigrations } from './migrate.js';
export { seed } from './seed.js';
export { seedDemo } from './seed-demo.js';
export { normalizeName, upsertActor, upsertSystem } from './catalog.js';
/**
 * Query operators re-exported so every package uses this package's drizzle-orm instance
 * (a second copy, e.g. resolved with different optional peers, breaks type compatibility).
 */
export {
  aliasedTable,
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
