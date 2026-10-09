import { count } from 'drizzle-orm';
import { bestPractices, departments, processCategories, users } from './schema/index.js';
import { DEFAULT_BEST_PRACTICES } from './best-practices-seed.js';
import { DEFAULT_TAXONOMY } from './taxonomy-seed.js';
import type { Db } from './client.js';

/** Idempotent seed: pilot department, dev users and the starter best-practice library. Safe to run repeatedly. */
export async function seed(db: Db) {
  await db
    .insert(departments)
    .values([
      {
        name: 'Procurement',
        slug: 'procurement',
        description: 'Pilot department: sourcing, vendor management and purchasing.',
      },
    ])
    .onConflictDoNothing({ target: departments.slug });

  await db
    .insert(users)
    .values([
      {
        email: 'admin@processai.local',
        displayName: 'Dev Admin',
        departmentText: 'IT',
        roles: ['user', 'admin'],
      },
      {
        email: 'owner@processai.local',
        displayName: 'Procurement Lead',
        departmentText: 'Procurement',
        roles: ['user'],
      },
      {
        email: 'employee@processai.local',
        displayName: 'Procurement Officer',
        departmentText: 'Procurement',
        roles: ['user'],
      },
    ])
    .onConflictDoNothing({ target: users.email });
  await seedBestPractices(db);
  await seedTaxonomy(db);
}

/** Adds the starter best-practice library once (never overwrites an admin's edits). */
export async function seedBestPractices(db: Db) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(bestPractices);
  if (n > 0) return;
  await db.insert(bestPractices).values(DEFAULT_BEST_PRACTICES);
}

/** Adds the starter APQC-based classification once (never overwrites an admin's edits). */
export async function seedTaxonomy(db: Db) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(processCategories);
  if (n > 0) return;
  const depts = await db.select({ id: departments.id, slug: departments.slug }).from(departments);
  const ids = new Map<string, string>();
  for (const node of DEFAULT_TAXONOMY) {
    const [row] = await db
      .insert(processCategories)
      .values({
        code: node.code,
        name: node.name,
        level: node.code.split('.').filter((x) => x !== '0').length || 1,
        parentId: node.parent ? ids.get(node.parent)! : null,
        departmentId: depts.find((d) => d.slug === node.department)?.id ?? null,
        source: 'APQC PCF Cross-Industry',
      })
      .returning({ id: processCategories.id });
    ids.set(node.code, row!.id);
  }
}
