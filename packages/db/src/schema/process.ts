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
  controlModes,
  controlTypes,
  docClassifications,
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
export const controlType = pgEnum('control_type', controlTypes);
export const controlMode = pgEnum('control_mode', controlModes);
export const docClassification = pgEnum('doc_classification', docClassifications);
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

/** Process classification (APQC PCF style): L1 category → L2 process group → L3 process. */
export const processCategories = pgTable(
  'process_categories',
  {
    id: id(),
    code: text().notNull().unique(),
    name: text().notNull(),
    level: integer().notNull(),
    parentId: uuid().references((): AnyPgColumn => processCategories.id, { onDelete: 'cascade' }),
    /** Department expected to own processes under this node (coverage dashboard). */
    departmentId: uuid().references(() => departments.id, { onDelete: 'set null' }),
    description: text(),
    source: text(),
    ...timestamps,
  },
  (t) => [index().on(t.parentId)],
);

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
    /** SOP number within the department (assigned on first SOP), e.g. 1 → 7X-PRC-SOP-001. */
    /** Where it sits in the process classification (APQC-style). */
    categoryId: uuid().references((): AnyPgColumn => processCategories.id, { onDelete: 'set null' }),
    sopNumber: integer(),
    classification: docClassification().notNull().default('internal'),
    reviewCycleMonths: integer().notNull().default(12),
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
    /** To-Be designs: the goals given and the AI's summary of the design. */
    designGoals: text(),
    designSummary: text(),
    createdBy: uuid().references(() => users.id),
    submittedAt: timestamp({ withTimezone: true }),
    validatedBy: uuid().references(() => users.id),
    validatedAt: timestamp({ withTimezone: true }),
    approvedBy: uuid().references(() => users.id),
    approvedAt: timestamp({ withTimezone: true }),
    /** Last periodic review without changes (resets the review clock). */
    reviewedAt: timestamp({ withTimezone: true }),
    reviewedBy: uuid().references(() => users.id),
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
    accountableRole: text(),
    consultedRoles: text().array().notNull().default([]),
    informedRoles: text().array().notNull().default([]),
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

/**
 * Controls: the activities that enforce rules or reduce risks (preventive/detective), with an owner,
 * frequency and the evidence that proves they ran. Keys are unique within a department.
 */
export const controls = pgTable(
  'controls',
  {
    id: id(),
    versionId: uuid()
      .notNull()
      .references(() => processVersions.id, { onDelete: 'cascade' }),
    controlKey: text().notNull(),
    name: text().notNull(),
    description: text(),
    controlType: controlType().notNull().default('preventive'),
    mode: controlMode().notNull().default('manual'),
    frequency: text(),
    ownerRole: text(),
    evidence: text(),
    isKey: boolean().notNull().default(false),
    risk: text(),
    ruleId: uuid().references(() => businessRules.id, { onDelete: 'set null' }),
    /** Steps where the control applies (ids within the same version). */
    stepIds: uuid().array().notNull().default([]),
    provenance: provenance().notNull().default('stated'),
    ...timestamps,
  },
  (t) => [index().on(t.versionId), unique().on(t.versionId, t.controlKey)],
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
    /** Document chunk the fact came from (FK added in migration to avoid a schema import cycle). */
    chunkId: uuid(),
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

/** One process handing off to another (end-to-end flows). AI-suggested links stay inferred until confirmed. */
export const processLinks = pgTable(
  'process_links',
  {
    id: id(),
    fromProcessId: uuid()
      .notNull()
      .references(() => processes.id, { onDelete: 'cascade' }),
    toProcessId: uuid()
      .notNull()
      .references(() => processes.id, { onDelete: 'cascade' }),
    /** Step key in the "from" process where the hand-off happens (kept across versions). */
    fromStepKey: text(),
    label: text(),
    provenance: provenance().notNull().default('confirmed'),
    reasoning: text(),
    createdBy: uuid().references(() => users.id),
    ...timestamps,
  },
  (t) => [unique().on(t.fromProcessId, t.toProcessId), index().on(t.toProcessId)],
);

/** Something that may have changed a process's validity: a linked document changed. The owner checks it. */
export const processAlerts = pgTable(
  'process_alerts',
  {
    id: id(),
    processId: uuid()
      .notNull()
      .references(() => processes.id, { onDelete: 'cascade' }),
    kind: text({ enum: ['document_changed'] }).notNull(),
    /** Document that changed (kept as text too, in case the document is deleted). */
    documentId: uuid(),
    documentTitle: text().notNull(),
    change: text().notNull(),
    status: text({ enum: ['open', 'resolved'] }).notNull().default('open'),
    resolution: text(),
    resolvedBy: uuid().references(() => users.id),
    resolvedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.processId, t.status)],
);
