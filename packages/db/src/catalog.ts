import { eq } from 'drizzle-orm';
import type { Db } from './client.js';
import { actors, systems } from './schema/index.js';

export const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Finds or creates an actor (role/team) in the org-wide catalogue. */
export async function upsertActor(
  db: Db,
  name: string,
  opts: { kind?: 'role' | 'team' | 'external'; departmentId?: string | null } = {},
) {
  const normalizedName = normalizeName(name);
  await db
    .insert(actors)
    .values({ name: name.trim(), normalizedName, kind: opts.kind ?? 'role', departmentId: opts.departmentId ?? null })
    .onConflictDoNothing();
  const row = await db.query.actors.findFirst({ where: eq(actors.normalizedName, normalizedName) });
  return row!.id;
}

/** Finds or creates a system in the org-wide catalogue. */
export async function upsertSystem(db: Db, name: string) {
  const normalizedName = normalizeName(name);
  await db.insert(systems).values({ name: name.trim(), normalizedName }).onConflictDoNothing();
  const row = await db.query.systems.findFirst({ where: eq(systems.normalizedName, normalizedName) });
  return row!.id;
}
