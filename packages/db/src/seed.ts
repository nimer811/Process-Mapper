import { departments, users } from './schema/index.js';
import type { Db } from './client.js';

/** Idempotent seed: pilot department and dev users. Safe to run repeatedly. */
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
}
