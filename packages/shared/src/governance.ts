import { z } from 'zod';
import {
  DesignChangeType,
  EdgeType,
  ExecutionMode,
  FindingSource,
  FindingStatus,
  IssueCategory,
  Level,
  OpportunityKind,
  Provenance,
  RuleType,
  StepType,
  UserRef,
  ValidationAction,
  VersionStatus,
} from './process.js';

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
  kind: z.enum(['inferred', 'disputed', 'contradiction', 'disagreement', 'no_owner', 'structure']),
  entityType: z.enum(['step', 'edge', 'rule', 'open_item', 'process', 'disagreement']).nullable(),
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
  /** Owner/admin viewing the current As-Is, with no To-Be design in progress. */
  canDesignToBe: z.boolean(),
  canArchive: z.boolean(),
  /** Owner/admin may send open points back to the interviewee (the interview behind this version is finished). */
  canSendBack: z.boolean(),
  /** Owner/admin may invite colleagues to add their view (draft or under validation). */
  canInvite: z.boolean(),
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

export const SendBackInput = z.object({
  comment: z.string().trim().max(1000).optional(),
});

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
  sourceType: z.enum([
    'user_statement',
    'document',
    'ai_inference',
    'user_validation',
    'manual_edit',
  ]),
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
  metadata: z.array(
    z.object({ field: z.string(), before: z.string().nullable(), after: z.string().nullable() }),
  ),
  steps: z.array(
    z.object({
      stepKey: z.string(),
      name: z.string(),
      change: z.enum(['added', 'removed', 'changed']),
      fields: z.array(
        z.object({
          field: z.string(),
          before: z.string().nullable(),
          after: z.string().nullable(),
        }),
      ),
    }),
  ),
  connections: z.array(
    z.object({ description: z.string(), change: z.enum(['added', 'removed', 'changed']) }),
  ),
  rules: z.array(z.object({ statement: z.string(), change: z.enum(['added', 'removed']) })),
});
export type VersionDiff = z.infer<typeof VersionDiff>;

export { Provenance };

// ---- Improvement analysis ----

const findingBase = {
  id: z.uuid(),
  stepId: z.uuid().nullable(),
  title: z.string(),
  description: z.string(),
  source: FindingSource,
  status: FindingStatus,
  decidedBy: UserRef.nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
};

export const Issue = z.object({ ...findingBase, category: IssueCategory, severity: Level });
export type Issue = z.infer<typeof Issue>;

export const Opportunity = z.object({
  ...findingBase,
  kind: OpportunityKind,
  expectedBenefit: z.string().nullable(),
  impact: Level,
  effort: Level,
});
export type Opportunity = z.infer<typeof Opportunity>;

export const Findings = z.object({
  issues: z.array(Issue),
  opportunities: z.array(Opportunity),
  canManage: z.boolean(),
  aiAvailable: z.boolean(),
});
export type Findings = z.infer<typeof Findings>;

export const AnalyseInput = z.object({ ai: z.boolean().default(false) });
export const AnalyseResult = Findings.extend({ aiError: z.string().nullable() });
export type AnalyseResult = z.infer<typeof AnalyseResult>;

export const DecideInput = z.object({
  status: z.enum(['accepted', 'dismissed', 'proposed']),
  note: z.string().trim().max(1000).optional(),
});

export const IssueInput = z.object({
  stepId: z.uuid().nullable(),
  category: IssueCategory,
  severity: Level,
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(2000),
});
export type IssueInput = z.infer<typeof IssueInput>;

// ---- To-Be design ----

export const ToBeInput = z.object({
  /** Opportunities to implement (accepted ones are suggested by default). */
  opportunityIds: z.array(z.uuid()).max(20),
  goals: z.string().trim().max(2000).optional(),
});
export type ToBeInput = z.infer<typeof ToBeInput>;

export const DesignChange = z.object({
  id: z.uuid(),
  changeType: DesignChangeType,
  stepKey: z.string().nullable(),
  description: z.string(),
  rationale: z.string(),
  opportunity: z.object({ id: z.uuid(), title: z.string() }).nullable(),
});
export type DesignChange = z.infer<typeof DesignChange>;

export const DesignDetail = z.object({
  basedOn: z
    .object({ id: z.uuid(), versionNumber: z.number().int(), status: VersionStatus })
    .nullable(),
  goals: z.string().nullable(),
  summary: z.string().nullable(),
  changes: z.array(DesignChange),
});
export type DesignDetail = z.infer<typeof DesignDetail>;
