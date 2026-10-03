import { describe, expect, it } from 'vitest';
import { quoteSupported, validateOps } from './validate.js';
import type { Op } from './ops.js';
import { item, state, step } from '../test/fixtures.js';

const addStep = (ref: string, after: string | null, extra: Partial<Extract<Op, { op: 'add_step' }>> = {}): Op => ({
  op: 'add_step', ref, type: 'task', name: 'Review request', description: null, actor: null, systems: [],
  inputs: [], outputs: [], execution: 'unknown', expected_duration: null, sla: null, approval_authority: null,
  after, after_label: null, provenance: 'stated', quote: 'it gets reviewed', ...extra,
});

describe('quoteSupported', () => {
  it('matches quotes regardless of case and punctuation', () => {
    expect(quoteSupported('Through SAP', 'It goes through SAP, usually.')).toBe(true);
    expect(quoteSupported('through Ariba', 'It goes through SAP.')).toBe(false);
    expect(quoteSupported(null, 'anything')).toBe(false);
  });
});

describe('validateOps', () => {
  const s1 = step('S1', { type: 'start' });
  const s2 = step('S2');
  const base = state({ steps: [s1, s2], edges: [] });

  it('resolves existing keys and refs introduced earlier in the same batch', () => {
    const r = validateOps(base, [addStep('new1', 'S2'), { op: 'add_edge', from: 'new1', to: 'S1', type: 'loop_back', condition_label: null, provenance: 'inferred', quote: null }], 'then it gets reviewed');
    expect(r.rejected).toEqual([]);
    expect(r.accepted[0]!.targets.after).toEqual({ kind: 'existing', id: s2.id });
    expect(r.accepted[1]!.targets.from).toEqual({ kind: 'new', ref: 'new1' });
  });

  it('rejects unknown steps, self loops and duplicate connections', () => {
    const withEdge = state({ steps: [s1, s2], edges: [{ id: 'e', fromStepId: s1.id, toStepId: s2.id, type: 'sequence', conditionLabel: null, provenance: 'stated' }] });
    const r = validateOps(withEdge, [
      { op: 'update_step', step: 'S9', name: 'x', type: null, description: null, actor: null, add_systems: [], no_system: null, add_inputs: [], add_outputs: [], execution: null, expected_duration: null, sla: null, approval_authority: null, provenance: 'stated', quote: null },
      { op: 'add_edge', from: 'S2', to: 'S2', type: 'sequence', condition_label: null, provenance: 'stated', quote: null },
      { op: 'add_edge', from: 'S1', to: 'S2', type: 'sequence', condition_label: null, provenance: 'stated', quote: null },
    ], 'x');
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected.map((x) => x.reason)).toEqual(['unknown step "S9"', 'self loop', 'connection already exists']);
  });

  it('downgrades "stated" claims that the user did not actually say', () => {
    const r = validateOps(base, [addStep('new1', 'S2', { quote: 'Finance reviews every request' })], 'Then procurement checks it.');
    expect(r.accepted[0]!.finalProvenance).toBe('inferred');
    expect(r.downgraded).toBe(1);
  });

  it('keeps "stated" when the quote is in the message', () => {
    const r = validateOps(base, [addStep('new1', 'S2', { quote: 'it gets reviewed' })], 'After that it gets reviewed by the buyer.');
    expect(r.accepted[0]!.finalProvenance).toBe('stated');
  });

  it('maps open-item labels to ids and rejects unknown labels', () => {
    const q = item({ status: 'asked' });
    const r = validateOps(state({ openItems: [q] }), [
      { op: 'resolve_open_item', item: 'Q1', resolution: 'SAP' },
      { op: 'resolve_open_item', item: 'Q7', resolution: 'x' },
    ], 'SAP');
    expect(r.accepted[0]!.openItemId).toBe(q.id);
    expect(r.rejected[0]!.reason).toContain('Q7');
  });
});
