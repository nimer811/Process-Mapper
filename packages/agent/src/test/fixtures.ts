import type { InterviewState, OpenItemState, StepState } from '../interview/state.js';

let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

export function step(stepKey: string, partial: Partial<StepState> = {}): StepState {
  return {
    id: uid(),
    stepKey,
    type: 'task',
    name: `Step ${stepKey}`,
    description: null,
    actorName: null,
    systems: [],
    noSystem: false,
    inputs: [],
    outputs: [],
    execution: 'unknown',
    expectedDuration: null,
    sla: null,
    approvalAuthority: null,
    painPoints: [],
    provenance: 'stated',
    ...partial,
  };
}

export function item(partial: Partial<OpenItemState> = {}): OpenItemState {
  return {
    id: uid(),
    type: 'missing_info',
    gapKey: null,
    source: 'gap_analysis',
    entityType: 'process',
    entityId: null,
    field: null,
    description: 'Something?',
    priority: 50,
    status: 'open',
    timesAsked: 0,
    lastAskedTurn: null,
    ...partial,
  };
}

export function state(partial: Partial<InterviewState> = {}): InterviewState {
  return {
    session: {
      id: uid(),
      userId: uid(),
      processId: uid(),
      versionId: uid(),
      stage: 'scoping',
      status: 'active',
      focusStepId: null,
      runningSummary: null,
      summarizedTurns: 0,
      turnCount: 1,
      stageEnteredTurn: 0,
      ...partial.session,
    },
    process: {
      name: 'Vendor Onboarding',
      departmentId: uid(),
      departmentName: 'Procurement',
      isUntitled: false,
      ...partial.process,
    },
    version: {
      description: null,
      purpose: null,
      trigger: null,
      endCondition: null,
      ownerRole: null,
      frequency: null,
      volume: null,
      ...partial.version,
    },
    steps: partial.steps ?? [],
    edges: partial.edges ?? [],
    rules: partial.rules ?? [],
    openItems: partial.openItems ?? [],
    recentMessages: partial.recentMessages ?? [],
  };
}

export const edge = (
  from: StepState,
  to: StepState,
  type: 'sequence' | 'branch' | 'exception' | 'loop_back' = 'sequence',
  conditionLabel: string | null = null,
) => ({
  id: uid(),
  fromStepId: from.id,
  toStepId: to.id,
  type,
  conditionLabel,
  provenance: 'stated' as const,
});
