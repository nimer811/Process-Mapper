import { count } from 'drizzle-orm';
import { bestPractices, departments, users } from './schema/index.js';
import { DEFAULT_BEST_PRACTICES } from './best-practices-seed.js';
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
}

/** Adds the starter best-practice library once (never overwrites an admin's edits). */
export async function seedBestPractices(db: Db) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(bestPractices);
  if (n > 0) return;
  await db.insert(bestPractices).values(DEFAULT_BEST_PRACTICES);
}
