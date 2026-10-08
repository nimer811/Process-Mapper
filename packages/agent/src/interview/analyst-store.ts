import { and, eq, inArray } from 'drizzle-orm';
import { openItems, type Db } from '@process-ai/db';
import type { AnalystResult, FindingKind } from './analyst.js';
import { openItemLabels } from './validate.js';
import { isWorkStep, type InterviewState } from './state.js';

const PRIORITY = { high: 88, medium: 66, low: 42 } as const;

const TYPE: Record<FindingKind, 'question' | 'ambiguity'> = {
  missing_step: 'question',
  vague: 'ambiguity',
  unclear_term: 'ambiguity',
  needs_detail: 'question',
  inconsistency: 'ambiguity',
  implausible: 'ambiguity',
  sop_gap: 'question',
  practice_gap: 'question',
};

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
/** Overlap of significant words; used to skip near-duplicate questions. */
function similar(a: string, b: string) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size) >= 0.6;
}

/**
 * Turns the analyst's findings into open items (skipping near-duplicates of what's already open)
 * and resolves the questions the latest answer addressed.
 */
export async function storeAnalystFindings(db: Db, state: InterviewState, result: AnalystResult) {
  const labels = openItemLabels(state);
  const answered = result.addressed.map((l) => labels.get(l.trim())).filter((x): x is string => !!x);
  if (answered.length) {
    await db
      .update(openItems)
      .set({ status: 'resolved', resolution: 'answered' })
      .where(and(eq(openItems.sessionId, state.session.id), inArray(openItems.id, answered)));
  }

  const byKey = new Map(state.steps.map((s) => [s.stepKey.toUpperCase(), s.id]));
  const active = state.openItems.filter((i) => (i.status === 'open' || i.status === 'asked') && !answered.includes(i.id));
  const recent = state.openItems.filter((i) => i.source === 'analyst');
  for (const f of result.findings) {
    const entityId = f.step ? (byKey.get(f.step.trim().toUpperCase()) ?? null) : null;
    const duplicate = [...active, ...recent].some((i) => (i.entityId ?? null) === entityId && similar(i.description, f.question));
    if (duplicate) continue;
    await db.insert(openItems).values({
      sessionId: state.session.id,
      versionId: state.session.versionId,
      type: TYPE[f.kind],
      source: 'analyst',
      entityType: entityId ? 'step' : 'process',
      entityId,
      field: f.kind,
      description: f.question.trim(),
      rationale: f.why.trim(),
      priority: PRIORITY[f.priority] + (f.kind === 'missing_step' ? 5 : 0),
    });
  }
}

/**
 * When nothing specific is left to ask but the process isn't understood in depth yet, ask the
 * employee to walk through the biggest stretch of the flow in their own words.
 */
export async function addDeepeningQuestion(db: Db, state: InterviewState) {
  const work = state.steps.filter(isWorkStep);
  const start = state.steps.find((s) => s.type === 'start');
  const end = state.steps.find((s) => s.type === 'end');
  const noOwner = work.find((s) => !s.actorName);
  const description = noOwner
    ? `Who exactly does "${noOwner.name}" — which role, and what do they check or decide?`
    : work.length < 3 && start && end
      ? `Could you walk me through, step by step, everything that happens between "${start.name}" and "${end.name}"? Who does what, and in which system?`
      : 'What can go wrong in this process, and what happens then? For example, when something is missing, rejected or urgent.';
  await db.insert(openItems).values({
    sessionId: state.session.id,
    versionId: state.session.versionId,
    type: 'question',
    source: 'analyst',
    entityType: noOwner ? 'step' : 'process',
    entityId: noOwner?.id ?? null,
    field: 'needs_detail',
    description,
    rationale: 'The process is not yet detailed enough to draw and improve.',
    priority: 85,
  });
}
