import { MAX_OPS_PER_TURN, type Op } from './ops.js';
import type { InterviewState, ReferenceDoc } from './state.js';

export type StepTarget = { kind: 'existing'; id: string } | { kind: 'new'; ref: string };

/** An op that passed validation, with step references resolved and provenance settled. */
export type ValidOp = Op & {
  /** Resolved targets keyed by the op's step-reference field names. */
  targets: Record<string, StepTarget | null>;
  /** Final provenance after checks ("stated" claims without support become "inferred"). */
  finalProvenance: 'stated' | 'inferred' | 'documented';
  /** Document chunk cited by the op (only chunks retrieved for this turn are accepted). */
  sourceChunkId?: string;
  /** Open item id for resolve_open_item. */
  openItemId?: string;
};

export interface ValidationResult {
  accepted: ValidOp[];
  rejected: { op: Op; reason: string }[];
  /** Ops whose "stated" provenance was downgraded because the quote wasn't in the user's message. */
  downgraded: number;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when the quote really appears in what the user said. */
export function quoteSupported(quote: string | null | undefined, userMessage: string) {
  if (!quote) return false;
  const q = normalize(quote);
  return q.length >= 2 && normalize(userMessage).includes(q);
}

/** Labels shown to the model for open items ("Q1", "Q2", ...), in a stable order. */
export function openItemLabels(state: InterviewState) {
  const visible = state.openItems.filter((i) => i.status === 'open' || i.status === 'asked');
  return new Map(visible.map((item, i) => [`Q${i + 1}`, item.id]));
}

/**
 * Checks every proposed op against the current state. Deterministic, no I/O.
 * Rejected ops are reported (and logged by the caller) instead of being silently applied.
 */
export function validateOps(
  state: InterviewState,
  ops: Op[],
  userMessage: string,
  docs: ReferenceDoc[] = [],
): ValidationResult {
  const docsByLabel = new Map(docs.map((d) => [d.docLabel, d]));
  const result: ValidationResult = { accepted: [], rejected: [], downgraded: 0 };
  const byKey = new Map(state.steps.map((s) => [s.stepKey.toUpperCase(), s]));
  const newRefs = new Set<string>();
  const removedSteps = new Set<string>();
  const edgeKeys = new Set(state.edges.map((e) => `${e.fromStepId}->${e.toStepId}`));
  const itemLabels = openItemLabels(state);

  const resolve = (ref: string | null | undefined): StepTarget | null | 'invalid' => {
    if (ref == null) return null;
    const key = ref.trim();
    const existing = byKey.get(key.toUpperCase());
    if (existing && !removedSteps.has(existing.id)) return { kind: 'existing', id: existing.id };
    if (newRefs.has(key)) return { kind: 'new', ref: key };
    return 'invalid';
  };
  const reject = (op: Op, reason: string) => result.rejected.push({ op, reason });

  for (const op of ops.slice(0, MAX_OPS_PER_TURN)) {
    const targets: Record<string, StepTarget | null> = {};
    const need = (field: string, ref: string | null | undefined, required: boolean) => {
      const t = resolve(ref);
      if (t === 'invalid') return `unknown step "${ref}"`;
      if (required && t === null) return `missing ${field}`;
      targets[field] = t;
      return null;
    };

    let error: string | null = null;
    switch (op.op) {
      case 'set_process_field':
        if (!op.value.trim()) error = 'empty value';
        break;
      case 'add_step':
        if (!op.name.trim()) error = 'empty step name';
        else if (newRefs.has(op.ref) || byKey.has(op.ref.toUpperCase())) error = `duplicate ref "${op.ref}"`;
        else error = need('after', op.after, false);
        if (!error) newRefs.add(op.ref);
        break;
      case 'update_step':
        error = need('step', op.step, true);
        break;
      case 'add_edge': {
        error = need('from', op.from, true) ?? need('to', op.to, true);
        if (!error) {
          const from = targets.from!;
          const to = targets.to!;
          if (from.kind === 'existing' && to.kind === 'existing') {
            if (from.id === to.id) error = 'self loop';
            else if (edgeKeys.has(`${from.id}->${to.id}`)) error = 'connection already exists';
            else edgeKeys.add(`${from.id}->${to.id}`);
          }
        }
        break;
      }
      case 'remove_edge':
        error = need('from', op.from, true) ?? need('to', op.to, true);
        if (!error && (targets.from!.kind !== 'existing' || targets.to!.kind !== 'existing')) {
          error = 'can only remove existing connections';
        }
        break;
      case 'remove_step':
        error = need('step', op.step, true);
        if (!error) {
          if (targets.step!.kind !== 'existing') error = 'can only remove existing steps';
          else removedSteps.add(targets.step!.id);
        }
        break;
      case 'add_rule':
        if (!op.statement.trim()) error = 'empty rule';
        else if (op.provenance === 'documented' && !docsByLabel.has(op.source ?? '')) {
          error = `documented rule cites unknown reference "${op.source}"`;
        } else error = need('step', op.step, false);
        break;
      case 'add_pain_point':
        if (!op.text.trim()) error = 'empty pain point';
        else error = need('step', op.step, true);
        break;
      case 'resolve_open_item':
        if (!itemLabels.has(op.item)) error = `unknown open item "${op.item}"`;
        break;
      case 'raise_item':
        if (!op.description.trim()) error = 'empty description';
        else if (op.source && !docsByLabel.has(op.source)) error = `cites unknown reference "${op.source}"`;
        else error = need('step', op.step, false);
        break;
      case 'set_focus':
        error = need('step', op.step, true);
        break;
    }

    if (error) {
      reject(op, error);
      continue;
    }

    // Provenance: "stated" must be backed by the user's own words in this message.
    const claimed = 'provenance' in op ? op.provenance : 'quote' in op ? 'stated' : 'inferred';
    let finalProvenance: ValidOp['finalProvenance'] = claimed;
    if (claimed === 'stated' && 'quote' in op && !quoteSupported(op.quote, userMessage)) {
      finalProvenance = 'inferred';
      result.downgraded++;
    }

    result.accepted.push({
      ...op,
      targets,
      finalProvenance,
      ...(op.op === 'resolve_open_item' ? { openItemId: itemLabels.get(op.item) } : {}),
      ...('source' in op && op.source && docsByLabel.has(op.source) ? { sourceChunkId: docsByLabel.get(op.source)!.chunkId } : {}),
    });
  }

  for (const op of ops.slice(MAX_OPS_PER_TURN)) reject(op, 'too many changes in one turn');
  return result;
}
