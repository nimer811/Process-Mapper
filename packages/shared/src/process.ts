import { z } from 'zod';

// ---- Enumerations (single source of truth for DB enums, API and UI) ----

export const versionStatuses = [
  'draft',
  'under_validation',
  'validated',
  'approved',
  'archived',
] as const;
export const VersionStatus = z.enum(versionStatuses);
export type VersionStatus = z.infer<typeof VersionStatus>;

export const versionKinds = ['as_is', 'to_be'] as const;
export const VersionKind = z.enum(versionKinds);

export const stepTypes = ['start', 'task', 'decision', 'approval', 'end', 'subprocess'] as const;
export const StepType = z.enum(stepTypes);
export type StepType = z.infer<typeof StepType>;

export const edgeTypes = ['sequence', 'branch', 'exception', 'alternate', 'loop_back'] as const;
export const EdgeType = z.enum(edgeTypes);
export type EdgeType = z.infer<typeof EdgeType>;

/** Where a fact came from. Inferred facts are never silently treated as confirmed. */
export const provenances = ['stated', 'documented', 'inferred', 'confirmed', 'disputed'] as const;
export const Provenance = z.enum(provenances);
export type Provenance = z.infer<typeof Provenance>;

export const executionModes = ['manual', 'automated', 'semi_automated', 'unknown'] as const;
export const ExecutionMode = z.enum(executionModes);
export type ExecutionMode = z.infer<typeof ExecutionMode>;

export const actorKinds = ['role', 'team', 'external'] as const;
export const ActorKind = z.enum(actorKinds);

export const ruleTypes = ['threshold', 'approval', 'compliance', 'sla', 'control', 'other'] as const;
export const RuleType = z.enum(ruleTypes);

export const evidenceSources = [
  'user_statement',
  'document',
  'ai_inference',
  'user_validation',
  'manual_edit',
] as const;
export const EvidenceSource = z.enum(evidenceSources);

export const validationActions = [
  'summary_confirmed',
  'correction',
  'submitted',
  'validated',
  'approved',
  'returned',
  'archived',
  'reopened',
] as const;
export const ValidationAction = z.enum(validationActions);

// ---- API shapes ----

export const UserRef = z.object({ id: z.uuid(), displayName: z.string(), email: z.string() });
export type UserRef = z.infer<typeof UserRef>;

export const Department = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  processCount: z.number().int(),
});
export type Department = z.infer<typeof Department>;

export const DepartmentInput = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only')
    .max(60),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type DepartmentInput = z.infer<typeof DepartmentInput>;

export const ProcessListItem = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  department: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  owner: UserRef.nullable(),
  /** The version shown by default: latest approved/validated, else latest working version. */
  versionId: z.uuid(),
  versionNumber: z.number().int(),
  status: VersionStatus,
  description: z.string().nullable(),
  stepCount: z.number().int(),
  lastReviewedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type ProcessListItem = z.infer<typeof ProcessListItem>;

export const VersionSummary = z.object({
  id: z.uuid(),
  versionNumber: z.number().int(),
  kind: VersionKind,
  status: VersionStatus,
  changeSummary: z.string().nullable(),
  createdBy: UserRef.nullable(),
  createdAt: z.iso.datetime(),
  validatedBy: UserRef.nullable(),
  validatedAt: z.iso.datetime().nullable(),
  approvedBy: UserRef.nullable(),
  approvedAt: z.iso.datetime().nullable(),
});
export type VersionSummary = z.infer<typeof VersionSummary>;

export const ProcessDetail = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  department: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  owner: UserRef.nullable(),
  defaultVersionId: z.uuid(),
  versions: z.array(VersionSummary),
});
export type ProcessDetail = z.infer<typeof ProcessDetail>;

export const BusinessRule = z.object({
  id: z.uuid(),
  stepId: z.uuid().nullable(),
  ruleType: RuleType,
  statement: z.string(),
  provenance: Provenance,
});
export type BusinessRule = z.infer<typeof BusinessRule>;

export const ProcessStep = z.object({
  id: z.uuid(),
  stepKey: z.string(),
  sequence: z.number().int().nullable(),
  type: StepType,
  name: z.string(),
  description: z.string().nullable(),
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  systems: z.array(z.object({ id: z.uuid(), name: z.string() })),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  execution: ExecutionMode,
  expectedDuration: z.string().nullable(),
  sla: z.string().nullable(),
  approvalAuthority: z.string().nullable(),
  painPoints: z.array(z.string()),
  dependsOn: z.array(z.uuid()),
  provenance: Provenance,
  confidence: z.number().nullable(),
});
export type ProcessStep = z.infer<typeof ProcessStep>;

export const ProcessEdge = z.object({
  id: z.uuid(),
  fromStepId: z.uuid(),
  toStepId: z.uuid(),
  type: EdgeType,
  conditionLabel: z.string().nullable(),
  provenance: Provenance,
});
export type ProcessEdge = z.infer<typeof ProcessEdge>;

export const VersionGraph = z.object({
  id: z.uuid(),
  processId: z.uuid(),
  versionNumber: z.number().int(),
  kind: VersionKind,
  status: VersionStatus,
  description: z.string().nullable(),
  purpose: z.string().nullable(),
  trigger: z.string().nullable(),
  endCondition: z.string().nullable(),
  frequency: z.string().nullable(),
  volume: z.string().nullable(),
  scopeNotes: z.string().nullable(),
  completenessScore: z.number().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  validatedAt: z.iso.datetime().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  steps: z.array(ProcessStep),
  edges: z.array(ProcessEdge),
  rules: z.array(BusinessRule),
});
export type VersionGraph = z.infer<typeof VersionGraph>;

export const ProcessListQuery = z.object({
  department: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  status: VersionStatus.optional(),
});
export type ProcessListQuery = z.infer<typeof ProcessListQuery>;
