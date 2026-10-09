import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  designChangeTypes,
  findingSources,
  findingStatuses,
  issueCategories,
  levels,
  opportunityKinds,
  practiceCategories,
} from '@process-ai/shared';
import { id, timestamps } from './columns.js';
import { departments, users } from './identity.js';
import { processSteps, processVersions } from './process.js';

export const issueCategory = pgEnum('issue_category', issueCategories);
export const opportunityKind = pgEnum('opportunity_kind', opportunityKinds);
export const level = pgEnum('level', levels);
export const findingSource = pgEnum('finding_source', findingSources);
export const findingStatus = pgEnum('finding_status', findingStatuses);
export const practiceCategory = pgEnum('practice_category', practiceCategories);

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
  {
    ...findingColumns,
    category: issueCategory().notNull(),
    severity: level().notNull().default('medium'),
  },
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

export const designChangeType = pgEnum('design_change_type', designChangeTypes);

/** What a To-Be design changed relative to its As-Is, and why. */
export const designChanges = pgTable(
  'design_changes',
  {
    id: id(),
    versionId: uuid()
      .notNull()
      .references(() => processVersions.id, { onDelete: 'cascade' }),
    changeType: designChangeType().notNull(),
    /** Step key in the To-Be (or the As-Is key for removed steps). */
    stepKey: text(),
    description: text().notNull(),
    rationale: text().notNull(),
    opportunityId: uuid().references(() => automationOpportunities.id, { onDelete: 'set null' }),
    /** Knowledge-base passages and best practices the change relies on. */
    sources: text().array().notNull().default([]),
    // Wall-clock time (not the transaction start) so changes made in one design keep their order.
    createdAt: timestamp({ withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [index().on(t.versionId)],
);

/** Organisation-wide good practices (admin-editable) used by the To-Be designer and the checks. */
export const bestPractices = pgTable('best_practices', {
  id: id(),
  title: text().notNull(),
  statement: text().notNull(),
  category: practiceCategory().notNull(),
  keywords: text().array().notNull().default([]),
  departmentId: uuid().references(() => departments.id, { onDelete: 'cascade' }),
  source: text(),
  isActive: boolean().notNull().default(true),
  ...timestamps,
});

export const estimateSource = pgEnum('estimate_source', ['owner', 'ai']);

/**
 * Timings and volume used for value analysis, kept apart from the documented map: the owner's
 * figures or AI estimates per step (stepId) or for the whole process (stepId null = volume).
 */
export const valueEstimates = pgTable(
  'value_estimates',
  {
    id: id(),
    versionId: uuid()
      .notNull()
      .references(() => processVersions.id, { onDelete: 'cascade' }),
    stepId: uuid().references(() => processSteps.id, { onDelete: 'cascade' }),
    source: estimateSource().notNull(),
    effortMinutes: integer(),
    durationMinutes: integer(),
    volumePerMonth: real(),
    reasoning: text(),
    ...timestamps,
  },
  (t) => [uniqueIndex('value_estimates_unique').on(t.versionId, t.stepId, t.source)],
);
