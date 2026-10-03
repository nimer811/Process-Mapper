import { boolean, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { userRoles } from '@process-ai/shared';
import { id, timestamps } from './columns.js';

export const userRole = pgEnum('user_role', userRoles);

export const users = pgTable('users', {
  id: id(),
  /** Entra ID object id (oid claim). Null for seeded dev users. */
  entraOid: text().unique(),
  /** Always stored lower-cased. */
  email: text().notNull().unique(),
  displayName: text().notNull(),
  /** Department from Microsoft Graph; informational only. */
  departmentText: text(),
  roles: userRole().array().notNull().default(['user']),
  isActive: boolean().notNull().default(true),
  lastLoginAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const departments = pgTable('departments', {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  isActive: boolean().notNull().default(true),
  ...timestamps,
});
