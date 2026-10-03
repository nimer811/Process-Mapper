import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { findingSources, findingStatuses, issueCategories, levels, opportunityKinds } from '@process-ai/shared';
import { id, timestamps } from './columns.js';
import { users } from './identity.js';
import { processSteps, processVersions } from './process.js';

export const issueCategory = pgEnum('issue_category', issueCategories);
export const opportunityKind = pgEnum('opportunity_kind', opportunityKinds);
export const level = pgEnum('level', levels);
export const findingSource = pgEnum('finding_source', findingSources);
export const findingStatus = pgEnum('finding_status', findingStatuses);

const findingColumns = {
  id: id(),
  versionId: uuid()
    .notNull()
    .references(() => processVersions.id, { onDelete: 'cascade' }),
  stepId: uuid().references(() => processSteps.id, { onDelete: 'set null' }),
  title: text().notNull(),
  description: text().notNull(),
  source: findingSource().notNull(),
  status: findingStatus().notNull().default('proposed'),
  /** Stable key for rule-check findings, so re-runs don't duplicate or resurrect dismissed items. */
  findingKey: text(),
  decidedBy: uuid().references(() => users.id),
  decidedAt: timestamp({ withTimezone: true }),
  decisionNote: text(),
  createdBy: uuid().references(() => users.id),
  ...timestamps,
};

/** Problems in the current process. Recommendations, never changes to the As-Is model. */
export const issues = pgTable(
  'issues',
  { ...findingColumns, category: issueCategory().notNull(), severity: level().notNull().default('medium') },
  (t) => [unique().on(t.versionId, t.findingKey), index().on(t.versionId)],
);

export const automationOpportunities = pgTable(
  'automation_opportunities',
  {
    ...findingColumns,
    kind: opportunityKind().notNull(),
    expectedBenefit: text(),
    impact: level().notNull().default('medium'),
    effort: level().notNull().default('medium'),
  },
  (t) => [unique().on(t.versionId, t.findingKey), index().on(t.versionId)],
);
