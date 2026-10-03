import type {
  EdgeType,
  ExecutionMode,
  InterviewStage,
  InterviewStatus,
  OpenItemStatus,
  OpenItemType,
  Provenance,
  StepType,
} from '@process-ai/shared';

/** Everything the engine knows about one interview, loaded from PostgreSQL each turn. */
export interface InterviewState {
  session: {
    id: string;
    userId: string;
    processId: string;
    versionId: string;
    stage: InterviewStage;
    status: InterviewStatus;
    focusStepId: string | null;
    runningSummary: string | null;
    summarizedTurns: number;
    turnCount: number;
    stageEnteredTurn: number;
  };
  process: { name: string; departmentName: string; isUntitled: boolean };
  version: {
    description: string | null;
    purpose: string | null;
    trigger: string | null;
    endCondition: string | null;
    ownerRole: string | null;
    frequency: string | null;
    volume: string | null;
  };
  steps: StepState[];
  edges: EdgeState[];
  rules: { id: string; stepId: string | null; ruleType: string; statement: string; provenance: Provenance }[];
  openItems: OpenItemState[];
  /** Most recent messages, oldest first. */
  recentMessages: { role: 'user' | 'assistant'; content: string }[];
}

export interface StepState {
  id: string;
  stepKey: string;
  type: StepType;
  name: string;
  description: string | null;
  actorName: string | null;
  systems: string[];
  noSystem: boolean;
  inputs: string[];
  outputs: string[];
  execution: ExecutionMode;
  expectedDuration: string | null;
  sla: string | null;
  approvalAuthority: string | null;
  painPoints: string[];
  provenance: Provenance;
}

export interface EdgeState {
  id: string;
  fromStepId: string;
  toStepId: string;
  type: EdgeType;
  conditionLabel: string | null;
  provenance: Provenance;
}

export interface OpenItemState {
  id: string;
  type: OpenItemType;
  gapKey: string | null;
  source: 'gap_analysis' | 'probe' | 'extractor';
  entityType: string | null;
  entityId: string | null;
  field: string | null;
  description: string;
  priority: number;
  status: OpenItemStatus;
  timesAsked: number;
  lastAskedTurn: number | null;
}

export const STAGE_ORDER: InterviewStage[] = [
  'scoping',
  'happy_path',
  'step_detail',
  'branches_exceptions',
  'rules_controls_pain',
  'summary',
  'completed',
];

export const stageIndex = (s: InterviewStage) => STAGE_ORDER.indexOf(s);

export const isWorkStep = (s: Pick<StepState, 'type'>) =>
  s.type === 'task' || s.type === 'approval' || s.type === 'subprocess';
