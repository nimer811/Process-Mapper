import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  actorKinds,
  edgeTypes,
  evidenceSources,
  executionModes,
  provenances,
  ruleTypes,
  stepTypes,
  validationActions,
  versionKinds,
  versionStatuses,
} from '@process-ai/shared';
import { id, timestamps } from './columns.js';
import { departments, users } from './identity.js';

export const versionStatus = pgEnum('version_status', versionStatuses);
export const versionKind = pgEnum('version_kind', versionKinds);
export const stepType = pgEnum('step_type', stepTypes);
export const edgeType = pgEnum('edge_type', edgeTypes);
export const provenance = pgEnum('provenance', provenances);
export const executionMode = pgEnum('execution_mode', executionModes);
export const actorKind = pgEnum('actor_kind', actorKinds);
export const ruleType = pgEnum('rule_type', ruleTypes);
export const evidenceSource = pgEnum('evidence_source', evidenceSources);
export const validationAction = pgEnum('validation_action', validationActions);

// ---- Org-wide catalogues (deduplicated by normalised name) ----

export const actors = pgTable('actors', {
  id: id(),
  name: text().notNull(),
  normalizedName: text().notNull().unique(),
  kind: actorKind().notNull().default('role'),
  departmentId: uuid().references(() => departments.id),
  ...timestamps,
});

export const systems = pgTable('systems', {
  id: id(),
  name: text().notNull(),
  normalizedName: text().notNull().unique(),
  description: text(),
  ...timestamps,
});

// ---- Process identity and versions ----

export const processes = pgTable(
  'processes',
  {
    id: id(),
    departmentId: uuid()
      .notNull()
      .references(() => departments.id),
    name: text().notNull(),
    slug: text().notNull(),
    ownerUserId: uuid().references(() => users.id),
    /** Latest validated/approved version; null until one exists. */
    currentVersionId: uuid().references((): AnyPgColumn => processVersions.id),
    createdBy: uuid().references(() => users.id),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique().on(t.departmentId, t.slug)],
);

export const processVersions = pgTable(
  'process_versions',
  {
    id: id(),
    processId: uuid()
      .notNull()
      .references(() => processes.id, { onDelete: 'cascade' }),
    versionNumber: integer().notNull(),
    kind: versionKind().notNull().default('as_is'),
    status: versionStatus().notNull().default('draft'),
    basedOnVersionId: uuid().references((): AnyPgColumn => processVersions.id),
    description: text(),
    purpose: text(),
    trigger: text(),
    endCondition: text(),
    /** Owner as described in interviews (role/title); the accountable user is processes.owner_user_id. */
    ownerRole: text(),
    frequency: text(),
    volume: text(),
    scopeNotes: text(),
    completenessScore: numeric({ precision: 5, scale: 2, mode: 'number' }),
    changeSummary: text(),
    createdBy: uuid().references(() => users.id),
    submittedAt: timestamp({ withTimezone: true }),
    validatedBy: uuid().references(() => users.id),
    validatedAt: timestamp({ withTimezone: true }),
    approvedBy: uuid().references(() => users.id),
    approvedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique().on(t.processId, t.kind, t.versionNumber), index().on(t.processId)],
);

// ---- Process graph ----

export const processSteps = pgTable(
  'process_steps',
  {
    id: id(),
    versionId: uuid()
      .notNull()
      .references(() => processVersions.id, { onDelete: 'cascade' }),
    /** Stable across versions (e.g. "S4"); used to compare versions. */
    stepKey: text().notNull(),
    /** Display/order hint only. The flow is defined by edges. */
    sequence: integer(),
    type: stepType().notNull().default('task'),
    name: text().notNull(),
    description: text(),
    actorId: uuid().references(() => actors.id),
    inputs: text().array().notNull().default([]),
    outputs: text().array().notNull().default([]),
    execution: executionMode().notNull().default('unknown'),
    expectedDuration: text(),
    sla: text(),
    approvalAuthority: text(),
    painPoints: text().array().notNull().default([]),
    /** Interviewee said there is no system for this step (so don't keep asking). */
    noSystem: boolean().notNull().default(false),
    provenance: provenance().notNull().default('stated'),
    confidence: numeric({ precision: 3, scale: 2, mode: 'number' }),
    ...timestamps,
  },
  (t) => [unique().on(t.versionId, t.stepKey), index().on(t.versionId)],
);

export const stepSystems = pgTable(
  'step_systems',
  {
    stepId: uuid()
      .notNull()
      .references(() => processSteps.id, { onDelete: 'cascade' }),
    systemId: uuid()
      .notNull()
      .references(() => systems.id),
  },
  (t) => [primaryKey({ columns: [t.stepId, t.systemId] })],
);

export const stepDependencies = pgTable(
  'step_dependencies',
  {
    stepId: uuid()
      .notNull()
      .references(() => processSteps.id, { onDelete: 'cascade' }),
    dependsOnStepId: uuid()
      .notNull()
      .references(() => processSteps.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.stepId, t.dependsOnStepId] })],
);

export const processEdges = pgTable(
  'process_edges',
  {
    id: id(),
    versionId: uuid()
      .notNull()
      .references(() => processVersions.id, { onDelete: 'cascade' }),
    fromStepId: uuid()
      .notNull()
      .references(() => processSteps.id, { onDelete: 'cascade' }),
    toStepId: uuid()
      .notNull()
      .references(() => processSteps.id, { onDelete: 'cascade' }),
    type: edgeType().notNull().default('sequence'),
    conditionLabel: text(),
    provenance: provenance().notNull().default('stated'),
    ...timestamps,
  },
  (t) => [unique().on(t.versionId, t.fromStepId, t.toStepId, t.type), index().on(t.versionId)],
);

export const businessRules = pgTable(
  'business_rules',
  {
    id: id(),
    versionId: uuid()
      .notNull()
      .references(() => processVersions.id, { onDelete: 'cascade' }),
    /** Null = process-level rule. */
    stepId: uuid().references(() => processSteps.id, { onDelete: 'cascade' }),
    ruleType: ruleType().notNull().default('other'),
    statement: text().notNull(),
    provenance: provenance().notNull().default('stated'),
    ...timestamps,
  },
  (t) => [index().on(t.versionId)],
);

// ---- Provenance and lifecycle ----

/**
 * Where a fact came from. Polymorphic by design so "where did this come from?" has one answer.
 * Message and document-chunk references are added with the interview (Phase 2) and KB (Phase 3).
 */
export const evidence = pgTable(
  'evidence',
  {
    id: id(),
    versionId: uuid()
      .notNull()
      .references(() => processVersions.id, { onDelete: 'cascade' }),
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    field: text(),
    sourceType: evidenceSource().notNull(),
    /** Interview message the fact came from (FK added in migration to avoid a schema import cycle). */
    messageId: uuid(),
    quote: text(),
    providedBy: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.entityType, t.entityId), index().on(t.versionId)],
);

export const validationEvents = pgTable(
  'validation_events',
  {
    id: id(),
    versionId: uuid()
      .notNull()
      .references(() => processVersions.id, { onDelete: 'cascade' }),
    action: validationAction().notNull(),
    actorUserId: uuid()
      .notNull()
      .references(() => users.id),
    comment: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.versionId)],
);
