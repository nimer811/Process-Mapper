import { z } from 'zod';
import { EdgeType, ExecutionMode, Provenance, RuleType, StepType, UserRef, ValidationAction, VersionStatus } from './process.js';

// ---- Lifecycle ----

export const lifecycleActions = ['submit', 'validate', 'return', 'approve'] as const;
export const LifecycleAction = z.enum(lifecycleActions);
export type LifecycleAction = z.infer<typeof LifecycleAction>;

export const TransitionInput = z.object({
  action: LifecycleAction,
  comment: z.string().trim().max(2000).optional(),
});
export type TransitionInput = z.infer<typeof TransitionInput>;

export const Blocker = z.object({
  kind: z.enum(['inferred', 'disputed', 'contradiction', 'no_owner', 'structure']),
  entityType: z.enum(['step', 'edge', 'rule', 'open_item', 'process']).nullable(),
  entityId: z.uuid().nullable(),
  description: z.string(),
  /** Warnings are shown but don't block validation. */
  blocking: z.boolean(),
});
export type Blocker = z.infer<typeof Blocker>;

export const Readiness = z.object({
  status: VersionStatus,
  /** Actions the current user may take now (permission + state + blockers). */
  allowedActions: z.array(LifecycleAction),
  canEdit: z.boolean(),
  canAssignOwner: z.boolean(),
  canCreateVersion: z.boolean(),
  canArchive: z.boolean(),
  blockers: z.array(Blocker),
});
export type Readiness = z.infer<typeof Readiness>;

export const HistoryEvent = z.object({
  id: z.uuid(),
  action: ValidationAction,
  actor: UserRef,
  comment: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type HistoryEvent = z.infer<typeof HistoryEvent>;

export const ProcessPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  ownerUserId: z.uuid().nullable().optional(),
});

export const NewVersionInput = z.object({
  changeSummary: z.string().trim().min(3).max(500),
});

// ---- Editing (owners/admins) ----

export const VersionMetaPatch = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  purpose: z.string().trim().max(1000).nullable().optional(),
  trigger: z.string().trim().max(1000).nullable().optional(),
  endCondition: z.string().trim().max(1000).nullable().optional(),
  ownerRole: z.string().trim().max(200).nullable().optional(),
  frequency: z.string().trim().max(200).nullable().optional(),
  volume: z.string().trim().max(200).nullable().optional(),
});
export type VersionMetaPatch = z.infer<typeof VersionMetaPatch>;

const list = z.array(z.string().trim().min(1).max(200)).max(30);

export const StepInput = z.object({
  name: z.string().trim().min(2).max(200),
  type: StepType,
  description: z.string().trim().max(2000).nullable().optional(),
  actor: z.string().trim().max(120).nullable().optional(),
  systems: list.optional(),
  inputs: list.optional(),
  outputs: list.optional(),
  execution: ExecutionMode.optional(),
  expectedDuration: z.string().trim().max(100).nullable().optional(),
  sla: z.string().trim().max(100).nullable().optional(),
  approvalAuthority: z.string().trim().max(300).nullable().optional(),
  painPoints: list.optional(),
  /** When adding: connect from this existing step. */
  afterStepId: z.uuid().nullable().optional(),
});
export type StepInput = z.infer<typeof StepInput>;

export const EdgeInput = z.object({
  fromStepId: z.uuid(),
  toStepId: z.uuid(),
  type: EdgeType,
  conditionLabel: z.string().trim().max(120).nullable().optional(),
});
export type EdgeInput = z.infer<typeof EdgeInput>;

export const RuleInput = z.object({
  stepId: z.uuid().nullable(),
  ruleType: RuleType,
  statement: z.string().trim().min(3).max(1000),
});
export type RuleInput = z.infer<typeof RuleInput>;

export const AcceptInput = z.object({
  entityType: z.enum(['step', 'edge', 'rule']),
  entityId: z.uuid(),
});

export const ResolveItemInput = z.object({ resolution: z.string().trim().min(2).max(1000) });

// ---- Provenance ----

export const EvidenceItem = z.object({
  id: z.uuid(),
  entityType: z.string(),
  entityId: z.uuid(),
  field: z.string().nullable(),
  sourceType: z.enum(['user_statement', 'document', 'ai_inference', 'user_validation', 'manual_edit']),
  quote: z.string().nullable(),
  providedBy: UserRef.nullable(),
  /** Interview the fact came from, if any. */
  interviewId: z.uuid().nullable(),
  /** Message excerpt for context when there is no exact quote. */
  messageExcerpt: z.string().nullable(),
  document: z.object({ id: z.uuid(), citation: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

// ---- Version comparison ----

export const VersionDiff = z.object({
  from: z.object({ id: z.uuid(), versionNumber: z.number().int() }),
  to: z.object({ id: z.uuid(), versionNumber: z.number().int() }),
  metadata: z.array(z.object({ field: z.string(), before: z.string().nullable(), after: z.string().nullable() })),
  steps: z.array(
    z.object({
      stepKey: z.string(),
      name: z.string(),
      change: z.enum(['added', 'removed', 'changed']),
      fields: z.array(z.object({ field: z.string(), before: z.string().nullable(), after: z.string().nullable() })),
    }),
  ),
  connections: z.array(z.object({ description: z.string(), change: z.enum(['added', 'removed', 'changed']) })),
  rules: z.array(z.object({ statement: z.string(), change: z.enum(['added', 'removed']) })),
});
export type VersionDiff = z.infer<typeof VersionDiff>;

export { Provenance };
