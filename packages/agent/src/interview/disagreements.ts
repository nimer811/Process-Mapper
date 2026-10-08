import type { DisagreementField } from '@process-ai/shared';
import type { InterviewState, SourceState } from './state.js';
import { conflictingRule, refines } from './text.js';
import type { ValidOp } from './validate.js';

/** A differing statement, held for the process owner instead of being applied. */
export interface FoundDisagreement {
  entityType: 'step' | 'edge' | 'rule';
  entityId: string;
  field: DisagreementField;
  subject: string;
  currentValue: string;
  currentUserId: string;
  currentName: string;
  currentQuote: string | null;
  proposedValue: string;
}

/** Step fields where a different answer from another person is a disagreement (op field → column names in evidence). */
const STEP_FIELDS = [
  { op: 'actor', field: 'actor', columns: ['actorId', 'actor'] },
  { op: 'sla', field: 'sla', columns: ['sla'] },
  { op: 'expected_duration', field: 'expected_duration', columns: ['expectedDuration'] },
  { op: 'approval_authority', field: 'approval_authority', columns: ['approvalAuthority'] },
  { op: 'execution', field: 'execution', columns: ['execution'] },
] as const;

/** Only what a person said (or an owner confirmed) is protected; AI inferences and SOP text can be corrected freely. */
const PROTECTED = new Set(['stated', 'confirmed']);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The most recent person who set this field of the element (or created it). */
function sourceOf(sources: SourceState[], entityId: string, columns: readonly string[] | null) {
  for (let i = sources.length - 1; i >= 0; i--) {
    const s = sources[i]!;
    if (s.entityId !== entityId) continue;
    if (s.fields === null || columns === null || s.fields.some((f) => columns.includes(f)))
      return s;
  }
  return null;
}

/**
 * Splits this turn's validated ops: changes that contradict what someone else said become
 * disagreements (not applied); everything else goes ahead. Refinements ("Procurement" →
 * "Procurement Officer") and the person's own earlier statements are not disagreements.
 */
export function findDisagreements(
  state: InterviewState,
  ops: ValidOp[],
  userId: string,
): { ops: ValidOp[]; found: FoundDisagreement[] } {
  const found: FoundDisagreement[] = [];
  const kept: ValidOp[] = [];
  const stepById = new Map(state.steps.map((s) => [s.id, s]));
  const existing = (t: ValidOp['targets'][string] | undefined) =>
    t?.kind === 'existing' ? t.id : null;
  const other = (s: SourceState | null): s is SourceState => !!s && s.userId !== userId;

  for (const op of ops) {
    if (op.op === 'update_step') {
      const step = stepById.get(existing(op.targets.step) ?? '');
      if (!step || !PROTECTED.has(step.provenance)) {
        kept.push(op);
        continue;
      }
      const current: Record<string, string | null> = {
        actor: step.actorName,
        sla: step.sla,
        expected_duration: step.expectedDuration,
        approval_authority: step.approvalAuthority,
        execution: step.execution === 'unknown' ? null : step.execution,
      };
      const next = { ...op } as typeof op & Record<string, unknown>;
      for (const f of STEP_FIELDS) {
        const proposed = op[f.op];
        const now = current[f.field];
        if (!proposed || !now || norm(proposed) === norm(now) || refines(proposed, now)) continue;
        const src = sourceOf(state.sources, step.id, f.columns);
        if (!other(src)) continue;
        next[f.op] = null;
        found.push({
          entityType: 'step',
          entityId: step.id,
          field: f.field,
          subject: `Step ${step.stepKey} "${step.name}"`,
          currentValue: now,
          currentUserId: src.userId,
          currentName: src.displayName,
          currentQuote: src.quote,
          proposedValue: proposed,
        });
      }
      kept.push(next);
      continue;
    }

    if (op.op === 'remove_step') {
      const step = stepById.get(existing(op.targets.step) ?? '');
      const src = step ? sourceOf(state.sources, step.id, null) : null;
      if (step && PROTECTED.has(step.provenance) && other(src)) {
        found.push({
          entityType: 'step',
          entityId: step.id,
          field: 'remove',
          subject: `Step ${step.stepKey} "${step.name}"`,
          currentValue: `"${step.name}" is part of the process`,
          currentUserId: src.userId,
          currentName: src.displayName,
          currentQuote: src.quote,
          proposedValue: `This step doesn't happen${op.reason ? ` (${op.reason})` : ''}`,
        });
        continue;
      }
    }

    if (op.op === 'remove_edge') {
      const from = existing(op.targets.from);
      const to = existing(op.targets.to);
      const edge = state.edges.find((e) => e.fromStepId === from && e.toStepId === to);
      const src = edge ? sourceOf(state.sources, edge.id, null) : null;
      if (edge && PROTECTED.has(edge.provenance) && other(src)) {
        const a = stepById.get(edge.fromStepId)!.name;
        const b = stepById.get(edge.toStepId)!.name;
        found.push({
          entityType: 'edge',
          entityId: edge.id,
          field: 'remove',
          subject: `Connection "${a}" → "${b}"`,
          currentValue: `After "${a}" comes "${b}"`,
          currentUserId: src.userId,
          currentName: src.displayName,
          currentQuote: src.quote,
          proposedValue: `"${b}" doesn't follow "${a}"${op.reason ? ` (${op.reason})` : ''}`,
        });
        continue;
      }
    }

    if (op.op === 'add_rule') {
      const clash = state.rules.find(
        (r) => PROTECTED.has(r.provenance) && conflictingRule(r.statement, op.statement),
      );
      const src = clash ? sourceOf(state.sources, clash.id, null) : null;
      if (clash && other(src)) {
        found.push({
          entityType: 'rule',
          entityId: clash.id,
          field: 'statement',
          subject: `Rule "${clash.statement}"`,
          currentValue: clash.statement,
          currentUserId: src.userId,
          currentName: src.displayName,
          currentQuote: src.quote,
          proposedValue: op.statement.trim(),
        });
        continue;
      }
    }

    kept.push(op);
  }
  return { ops: kept, found };
}

export const FIELD_LABEL: Record<DisagreementField, string> = {
  actor: 'who does it',
  sla: 'the SLA',
  expected_duration: 'how long it takes',
  approval_authority: 'who approves',
  execution: 'manual or automated',
  remove: 'whether it happens',
  statement: 'the rule',
};
