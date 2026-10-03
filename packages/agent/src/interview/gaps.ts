import type { InterviewStage } from '@process-ai/shared';
import { isWorkStep, type InterviewState, type StepState } from './state.js';

/** Something the process model is missing, found by rules rather than by the model. */
export interface Gap {
  gapKey: string;
  source: 'gap_analysis' | 'probe';
  entityType: 'process' | 'step';
  entityId: string | null;
  field: string;
  description: string;
  priority: number;
  /** Earliest stage in which it's worth asking about this. */
  stage: InterviewStage;
}

const stepLabel = (s: StepState) => `${s.stepKey} "${s.name}"`;

/** Graph helpers. */
function graphInfo(state: InterviewState) {
  const out = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const e of state.edges) {
    out.set(e.fromStepId, [...(out.get(e.fromStepId) ?? []), e.toStepId]);
    incoming.set(e.toStepId, (incoming.get(e.toStepId) ?? 0) + 1);
  }
  const starts = state.steps.filter((s) => s.type === 'start');
  const ends = new Set(state.steps.filter((s) => s.type === 'end').map((s) => s.id));
  const reachable = new Set<string>();
  const queue = starts.map((s) => s.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    queue.push(...(out.get(id) ?? []));
  }
  const startReachesEnd = [...ends].some((id) => reachable.has(id));
  return { out, incoming, starts, ends, reachable, startReachesEnd };
}

export function hasCompleteHappyPath(state: InterviewState) {
  return graphInfo(state).startReachesEnd;
}

/** All current gaps in the process model. Pure and deterministic. */
export function analyzeGaps(state: InterviewState): Gap[] {
  const gaps: Gap[] = [];
  const v = state.version;
  const g = graphInfo(state);
  const add = (gap: Omit<Gap, 'source'> & { source?: Gap['source'] }) => gaps.push({ source: 'gap_analysis', ...gap });

  // --- Process-level scoping ---
  if (state.process.isUntitled) {
    add({ gapKey: 'process:name', entityType: 'process', entityId: null, field: 'name', description: 'What is the name of the process we are mapping?', priority: 95, stage: 'scoping' });
  }
  if (!v.trigger) {
    add({ gapKey: 'process:trigger', entityType: 'process', entityId: null, field: 'trigger', description: 'What triggers or starts this process?', priority: 90, stage: 'scoping' });
  }
  if (!v.endCondition) {
    add({ gapKey: 'process:end_condition', entityType: 'process', entityId: null, field: 'end_condition', description: 'What marks the process as complete?', priority: 80, stage: 'scoping' });
  }
  if (!v.purpose) {
    add({ gapKey: 'process:purpose', entityType: 'process', entityId: null, field: 'purpose', description: 'What is the purpose of the process — what does it achieve for the business?', priority: 60, stage: 'scoping' });
  }
  if (!v.ownerRole) {
    add({ gapKey: 'process:owner_role', entityType: 'process', entityId: null, field: 'owner_role', description: 'Who owns this process overall (role or team)?', priority: 55, stage: 'scoping' });
  }
  if (!v.frequency && !v.volume) {
    add({ gapKey: 'process:volume', entityType: 'process', entityId: null, field: 'volume', description: 'How often does this process run, or roughly how many cases per month?', priority: 25, stage: 'rules_controls_pain' });
  }

  // --- Flow (happy path) ---
  if (state.steps.length > 0 && g.starts.length === 0) {
    add({ gapKey: 'graph:start', entityType: 'process', entityId: null, field: 'start', description: 'What is the very first thing that happens when the process starts?', priority: 85, stage: 'happy_path' });
  }
  for (const s of state.steps) {
    if (s.type === 'end') continue;
    if ((g.out.get(s.id) ?? []).length === 0) {
      add({ gapKey: `step:${s.id}:next`, entityType: 'step', entityId: s.id, field: 'next', description: `What happens after ${stepLabel(s)}?`, priority: 80, stage: 'happy_path' });
    }
  }
  for (const s of state.steps) {
    if (s.type === 'start') continue;
    if (!g.incoming.get(s.id) && g.starts.length > 0) {
      add({ gapKey: `step:${s.id}:prev`, entityType: 'step', entityId: s.id, field: 'previous', description: `Which step leads to ${stepLabel(s)}?`, priority: 65, stage: 'happy_path' });
    }
  }
  if (state.steps.length >= 2 && g.ends.size === 0) {
    add({ gapKey: 'graph:end', entityType: 'process', entityId: null, field: 'end', description: 'How does the process end — what is the final step or outcome?', priority: 70, stage: 'happy_path' });
  }

  // --- Step detail ---
  for (const s of state.steps.filter(isWorkStep)) {
    if (!s.actorName) {
      add({ gapKey: `step:${s.id}:actor`, entityType: 'step', entityId: s.id, field: 'actor', description: `Who performs ${stepLabel(s)}?`, priority: 70, stage: 'step_detail' });
    }
    if (s.systems.length === 0 && !s.noSystem) {
      add({ gapKey: `step:${s.id}:system`, entityType: 'step', entityId: s.id, field: 'system', description: `Which system or tool is used for ${stepLabel(s)}, if any?`, priority: 60, stage: 'step_detail' });
    }
    if (s.inputs.length === 0 && s.outputs.length === 0) {
      add({ gapKey: `step:${s.id}:io`, entityType: 'step', entityId: s.id, field: 'inputs_outputs', description: `What goes into ${stepLabel(s)} and what does it produce?`, priority: 40, stage: 'step_detail' });
    }
    if (!s.sla && !s.expectedDuration) {
      add({ gapKey: `step:${s.id}:time`, entityType: 'step', entityId: s.id, field: 'sla', description: `How long does ${stepLabel(s)} usually take, and is there an SLA?`, priority: 30, stage: 'rules_controls_pain' });
    }
  }

  // --- Decisions, approvals, exceptions ---
  for (const s of state.steps) {
    const exits = state.edges.filter((e) => e.fromStepId === s.id);
    if (s.type === 'decision') {
      if (exits.length < 2) {
        add({ gapKey: `step:${s.id}:branches`, entityType: 'step', entityId: s.id, field: 'branches', description: `What are the possible outcomes of ${stepLabel(s)}, and what happens in each case?`, priority: 75, stage: 'branches_exceptions' });
      } else if (exits.some((e) => !e.conditionLabel)) {
        add({ gapKey: `step:${s.id}:labels`, entityType: 'step', entityId: s.id, field: 'branch_labels', description: `What condition decides each path out of ${stepLabel(s)}?`, priority: 55, stage: 'branches_exceptions' });
      }
    }
    if (s.type === 'approval') {
      if (!s.approvalAuthority) {
        add({ gapKey: `step:${s.id}:authority`, entityType: 'step', entityId: s.id, field: 'approval_authority', description: `Who approves at ${stepLabel(s)}, and does it depend on value or type?`, priority: 70, stage: 'branches_exceptions' });
      }
      if (exits.length < 2) {
        add({ gapKey: `step:${s.id}:rejection`, entityType: 'step', entityId: s.id, field: 'rejection_path', description: `What happens if ${stepLabel(s)} is rejected?`, priority: 65, stage: 'branches_exceptions' });
      }
    }
  }

  // --- Probes: open questions asked once per stage ---
  const probe = (key: string, description: string, priority: number, stage: InterviewStage) =>
    add({ gapKey: `probe:${key}`, source: 'probe', entityType: 'process', entityId: null, field: key, description, priority, stage });
  probe('exceptions', 'What can go wrong in this process, and how are those cases handled?', 50, 'branches_exceptions');
  probe('rules', 'Are there rules, thresholds or approval limits that change how the process runs (for example by amount or category)?', 45, 'rules_controls_pain');
  probe('pain', 'What are the biggest frustrations or delays in this process today?', 40, 'rules_controls_pain');

  return gaps;
}

/** 0–100 score of how complete the model is; shown to users and used to suggest wrapping up. */
export function completeness(state: InterviewState): number {
  const v = state.version;
  const work = state.steps.filter(isWorkStep);
  const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);
  const meta = [!state.process.isUntitled, v.trigger, v.endCondition, v.purpose, v.ownerRole].filter(Boolean).length / 5;
  const flow = hasCompleteHappyPath(state) ? 1 : state.steps.length > 0 ? 0.3 : 0;
  const actors = ratio(work.filter((s) => s.actorName).length, work.length);
  const systems = ratio(work.filter((s) => s.systems.length > 0 || s.noSystem).length, work.length);
  const io = ratio(work.filter((s) => s.inputs.length > 0 || s.outputs.length > 0).length, work.length);
  const decisions = state.steps.filter((s) => s.type === 'decision');
  const branches = decisions.length === 0 ? 1 : ratio(decisions.filter((d) => state.edges.filter((e) => e.fromStepId === d.id && e.conditionLabel).length >= 2).length, decisions.length);
  const timing = ratio(work.filter((s) => s.sla || s.expectedDuration).length, work.length);
  const score = meta * 30 + flow * 20 + actors * 15 + systems * 10 + io * 10 + branches * 10 + timing * 5;
  return Math.round(score);
}
