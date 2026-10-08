import type { InterviewStage } from '@process-ai/shared';
import type { Gap } from './gaps.js';
import { hasCompleteHappyPath } from './gaps.js';
import { isWorkStep, stageIndex, type InterviewState } from './state.js';

/** Turns spent in one stage before moving on anyway, so the interview never gets stuck. */
const STAGE_TURN_BUDGET: Partial<Record<InterviewStage, number>> = {
  scoping: 6,
  happy_path: 20,
  step_detail: 16,
  branches_exceptions: 12,
  rules_controls_pain: 10,
};

/** Minimum work steps before the main flow counts as described. */
const MIN_WORK_STEPS = 3;

/**
 * Deterministic depth gate for the summary: a connected flow with enough steps, every work step
 * owned, and no important questions left open.
 */
export function isDeepEnough(state: InterviewState): boolean {
  const work = state.steps.filter(isWorkStep);
  if (!hasCompleteHappyPath(state) || work.length < MIN_WORK_STEPS) return false;
  if (work.some((s) => !s.actorName)) return false;
  // Important questions not yet asked block the summary; asked ones count as handled ("not sure" is an answer).
  return !state.openItems.some(
    (i) => i.status === 'open' && i.priority >= 80 && i.timesAsked === 0,
  );
}

const openGapsFor = (stage: InterviewStage, gaps: Gap[], askedProbes: Set<string>) =>
  gaps.filter((g) => g.stage === stage && !(g.source === 'probe' && askedProbes.has(g.gapKey)));

/**
 * Decides the interview stage from what's known. Stages only move forward (users can still talk
 * about anything; this only steers which questions are asked next).
 */
export function nextStage(
  state: InterviewState,
  gaps: Gap[],
  opts: { userIntent: 'continue' | 'pause' | 'finish'; readyForSummary?: boolean },
): InterviewStage {
  const current = state.session.stage;
  if (current === 'completed') return current;
  if (opts.userIntent === 'finish') return 'summary';
  if (current === 'summary') return current;

  const askedProbes = new Set(
    state.openItems
      .filter((i) => i.source === 'probe' && i.timesAsked > 0)
      .map((i) => i.gapKey ?? ''),
  );
  const turnsInStage = state.session.turnCount - state.session.stageEnteredTurn;
  const overBudget = turnsInStage >= (STAGE_TURN_BUDGET[current] ?? Infinity);
  const work = state.steps.filter(isWorkStep);

  const done: Record<string, () => boolean> = {
    scoping: () => !openGapsFor('scoping', gaps, askedProbes).some((g) => g.priority >= 80),
    happy_path: () => hasCompleteHappyPath(state) && work.length >= MIN_WORK_STEPS,
    step_detail: () =>
      work.length > 0 &&
      work.filter((s) => s.actorName && (s.systems.length > 0 || s.noSystem)).length /
        work.length >=
        0.8,
    branches_exceptions: () => openGapsFor('branches_exceptions', gaps, askedProbes).length === 0,
    rules_controls_pain: () =>
      openGapsFor('rules_controls_pain', gaps, askedProbes).filter((g) => g.source === 'probe')
        .length === 0,
  };

  let stage: InterviewStage = current;
  // Advance through every stage whose exit condition is already met (or whose budget ran out).
  while (
    stageIndex(stage) < stageIndex('summary') &&
    (done[stage]?.() || (stage === current && overBudget))
  ) {
    // The summary needs the analyst's go-ahead and real depth, not just an empty question list.
    if (stage === 'rules_controls_pain' && !opts.readyForSummary) break;
    stage = (
      [
        'scoping',
        'happy_path',
        'step_detail',
        'branches_exceptions',
        'rules_controls_pain',
        'summary',
      ] as const
    )[stageIndex(stage) + 1]!;
  }
  return stage;
}
