import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { taskKinds, taskStatuses } from '@process-ai/shared';
import { id, timestamps } from './columns.js';
import { users } from './identity.js';
import { processes, processVersions } from './process.js';
import { interviewSessions } from './interview.js';

export const taskKind = pgEnum('task_kind', taskKinds);
export const taskStatus = pgEnum('task_status', taskStatuses);

/** "My actions": something a person needs to do, created and closed by lifecycle events. */
export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: taskKind().notNull(),
    title: text().notNull(),
    detail: text(),
    link: text().notNull(),
    processId: uuid().references(() => processes.id, { onDelete: 'cascade' }),
    versionId: uuid().references(() => processVersions.id, { onDelete: 'cascade' }),
    sessionId: uuid().references(() => interviewSessions.id, { onDelete: 'cascade' }),
    status: taskStatus().notNull().default('open'),
    completedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.userId, t.status),
    // One open task per person, kind and subject (the migration adds NULLS NOT DISTINCT).
    uniqueIndex('tasks_open_unique')
      .on(t.userId, t.kind, t.versionId, t.sessionId)
      .where(sql`${t.status} = 'open'`),
  ],
);
