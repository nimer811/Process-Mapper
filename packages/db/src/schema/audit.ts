import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from './columns.js';
import { users } from './identity.js';

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorUserId: uuid().references(() => users.id),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    before: jsonb(),
    after: jsonb(),
    requestId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.entityType, t.entityId), index().on(t.createdAt)],
);
