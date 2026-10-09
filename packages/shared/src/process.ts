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

export const ruleTypes = [
  'threshold',
  'approval',
  'compliance',
  'sla',
  'control',
  'other',
] as const;
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
  'reviewed',
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
  /** Where it sits in the process classification (e.g. APQC 4.2.2). */
  category: z.object({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
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
  createdBy: UserRef.nullable(),
  archivedAt: z.iso.datetime().nullable(),
  defaultVersionId: z.uuid(),
  versions: z.array(VersionSummary),
  category: z.object({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
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
  /** RACI beyond the doer (actor = Responsible): who is Accountable, Consulted, Informed. */
  accountableRole: z.string().nullable(),
  consultedRoles: z.array(z.string()),
  informedRoles: z.array(z.string()),
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
  ownerRole: z.string().nullable(),
  changeSummary: z.string().nullable(),
  steps: z.array(ProcessStep),
  edges: z.array(ProcessEdge),
  rules: z.array(BusinessRule),
});
export type VersionGraph = z.infer<typeof VersionGraph>;

export const ProcessListQuery = z.object({
  department: z.string().optional(),
  /** "me": only processes the current user owns. */
  owner: z.literal('me').optional(),
  q: z.string().trim().max(200).optional(),
  status: VersionStatus.optional(),
});
export type ProcessListQuery = z.infer<typeof ProcessListQuery>;

// ---- Interviews ----

export const interviewStages = [
  'scoping',
  'happy_path',
  'step_detail',
  'branches_exceptions',
  'rules_controls_pain',
  'summary',
  'completed',
] as const;
export const InterviewStage = z.enum(interviewStages);
export type InterviewStage = z.infer<typeof InterviewStage>;

export const interviewStatuses = ['active', 'paused', 'completed', 'abandoned'] as const;
export const InterviewStatus = z.enum(interviewStatuses);
export type InterviewStatus = z.infer<typeof InterviewStatus>;

export const openItemTypes = [
  'missing_info',
  'question',
  'ambiguity',
  'contradiction',
  'assumption',
] as const;
export const OpenItemType = z.enum(openItemTypes);
export type OpenItemType = z.infer<typeof OpenItemType>;

export const openItemStatuses = ['open', 'asked', 'resolved', 'dismissed'] as const;
export const OpenItemStatus = z.enum(openItemStatuses);
export type OpenItemStatus = z.infer<typeof OpenItemStatus>;

/** Conversation channels. "voice" is provisioned for spoken interviews (speech-to-text in, text-to-speech out). */
export const channels = ['web', 'teams', 'voice'] as const;
export const Channel = z.enum(channels);

// ---- Knowledge base ----

export const documentCategories = [
  'sop',
  'policy',
  'doa',
  'approval_matrix',
  'form',
  'checklist',
  'other',
] as const;
export const DocumentCategory = z.enum(documentCategories);
export type DocumentCategory = z.infer<typeof DocumentCategory>;

export const documentCategoryLabels: Record<DocumentCategory, string> = {
  sop: 'SOP',
  policy: 'Policy',
  doa: 'Delegation of authority',
  approval_matrix: 'Approval matrix',
  form: 'Form',
  checklist: 'Checklist',
  other: 'Other',
};

export const documentStatuses = ['pending', 'processing', 'ready', 'failed'] as const;
export const DocumentStatus = z.enum(documentStatuses);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

/** Embedding size of the configured embedding model (text-embedding-3-small). Changing it needs a migration. */
export const EMBEDDING_DIMENSIONS = 1536;

// ---- Improvement analysis (kept separate from the documented process) ----

export const issueCategories = [
  'manual_work',
  'duplicate_entry',
  'unnecessary_approval',
  'rework',
  'handoff_delay',
  'unclear_ownership',
  'missing_sla',
  'control_gap',
  'other',
] as const;
export const IssueCategory = z.enum(issueCategories);
export type IssueCategory = z.infer<typeof IssueCategory>;

export const opportunityKinds = [
  'workflow',
  'integration',
  'rpa',
  'ai',
  'self_service',
  'elimination',
  'other',
] as const;
export const OpportunityKind = z.enum(opportunityKinds);
export type OpportunityKind = z.infer<typeof OpportunityKind>;

export const levels = ['low', 'medium', 'high'] as const;
export const Level = z.enum(levels);
export type Level = z.infer<typeof Level>;

/** Where a finding came from: the employee (pain point), a rule check, or the AI. */
export const findingSources = ['user', 'heuristic', 'ai', 'manual'] as const;
export const FindingSource = z.enum(findingSources);
export type FindingSource = z.infer<typeof FindingSource>;

export const findingStatuses = ['proposed', 'accepted', 'dismissed'] as const;
export const FindingStatus = z.enum(findingStatuses);
export type FindingStatus = z.infer<typeof FindingStatus>;

/** Who set a document's category and knowledge base. */
export const classificationSources = ['user', 'ai', 'rule'] as const;
export const ClassificationSource = z.enum(classificationSources);
export type ClassificationSource = z.infer<typeof ClassificationSource>;

/** Kinds of change in a To-Be design, relative to the As-Is it was based on. */
export const designChangeTypes = [
  'added',
  'removed',
  'modified',
  'reconnected',
  'rule_added',
  'rule_removed',
  'ownership',
] as const;
export const DesignChangeType = z.enum(designChangeTypes);
export type DesignChangeType = z.infer<typeof DesignChangeType>;
