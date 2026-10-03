import { stageIndex, type InterviewState, type OpenItemState } from './state.js';
import type { InterviewStage } from '@process-ai/shared';

/** Items stop being asked after this many attempts (the user may not know). */
export const MAX_TIMES_ASKED = 2;

interface ScoredItem {
  item: OpenItemState;
  score: number;
}

/**
 * Picks at most two open items to ask next. Deterministic: priorities come from gap analysis
 * and item type; the model only phrases the chosen questions.
 */
export function selectQuestions(
  state: InterviewState,
  items: (OpenItemState & { stage?: InterviewStage })[],
  stage: InterviewStage,
): OpenItemState[] {
  const turn = state.session.turnCount;
  const focus = state.session.focusStepId;

  const candidates: ScoredItem[] = items
    .filter((i) => i.status === 'open' || i.status === 'asked')
    .filter((i) => i.timesAsked < MAX_TIMES_ASKED)
    .filter((i) => !i.stage || stageIndex(i.stage) <= stageIndex(stage))
    .map((item) => {
      let score = item.priority;
      if (item.type === 'contradiction') score += 45;
      if (item.type === 'ambiguity') score += 30;
      if (item.type === 'question' && item.source === 'extractor') score += 15;
      if (focus && item.entityId === focus) score += 25;
      if (item.lastAskedTurn !== null && turn - item.lastAskedTurn <= 1) score -= 60; // don't repeat at once
      score -= item.timesAsked * 15;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  const first = candidates[0];
  if (!first) return [];
  // A second question only when it's about the same step, which keeps the message natural.
  const second = candidates.find(
    (c) =>
      c !== first &&
      first.item.type !== 'contradiction' &&
      c.item.entityId !== null &&
      c.item.entityId === first.item.entityId &&
      c.score > 0,
  );
  return second ? [first.item, second.item] : [first.item];
}
