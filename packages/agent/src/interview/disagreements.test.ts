import { describe, expect, it } from 'vitest';
import { findDisagreements } from './disagreements.js';
import type { ValidOp } from './validate.js';
import { edge, state, step } from '../test/fixtures.js';

const SARA = 'user-sara';
const OMAR = 'user-omar';

const update = (stepId: string, fields: Record<string, string | null>): ValidOp =>
  ({
    op: 'update_step',
    step: 'S2',
    name: null,
    type: null,
    description: null,
    actor: null,
    add_systems: [],
    no_system: null,
    add_inputs: [],
    add_outputs: [],
    execution: null,
    expected_duration: null,
    sla: null,
    approval_authority: null,
    provenance: 'stated',
    quote: 'the manager approves',
    ...fields,
    targets: { step: { kind: 'existing', id: stepId } },
    finalProvenance: 'stated',
  }) as ValidOp;

describe('findDisagreements', () => {
  const s1 = step('S1', { type: 'start' });
  const s2 = step('S2', {
    name: 'Approve supplier',
    actorName: 'Procurement Manager',
    sla: '2 days',
    provenance: 'stated',
  });
  const base = state({
    steps: [s1, s2],
    edges: [{ ...edge(s1, s2), provenance: 'stated' }],
    rules: [
      {
        id: 'r1',
        stepId: null,
        ruleType: 'approval',
        statement: 'Spend above AED 1 million needs Head of Procurement approval',
        provenance: 'stated',
      },
    ],
    sources: [
      {
        entityId: s2.id,
        fields: null,
        userId: SARA,
        displayName: 'Sara',
        quote: 'the Procurement Manager approves',
      },
      { entityId: 'r1', fields: null, userId: SARA, displayName: 'Sara', quote: 'above 1 million' },
    ],
  });

  it('holds a different answer from someone else and applies the rest of the change', () => {
    const r = findDisagreements(
      base,
      [update(s2.id, { actor: 'Category Manager', expected_duration: '1 day' })],
      OMAR,
    );
    expect(r.found).toMatchObject([
      {
        field: 'actor',
        currentValue: 'Procurement Manager',
        proposedValue: 'Category Manager',
        currentName: 'Sara',
      },
    ]);
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0]).toMatchObject({ actor: null, expected_duration: '1 day' });
  });

  it('treats refinements and the same person changing their mind as normal updates', () => {
    expect(
      findDisagreements(base, [update(s2.id, { actor: 'Senior Procurement Manager' })], OMAR).found,
    ).toEqual([]);
    expect(
      findDisagreements(base, [update(s2.id, { actor: 'Category Manager' })], SARA).found,
    ).toEqual([]);
    // Different figures are a disagreement even when the words match.
    expect(findDisagreements(base, [update(s2.id, { sla: '5 days' })], OMAR).found).toMatchObject([
      { field: 'sla', currentValue: '2 days', proposedValue: '5 days' },
    ]);
    const inferred = state({ ...base, steps: [s1, { ...s2, provenance: 'inferred' }] });
    expect(
      findDisagreements(inferred, [update(s2.id, { actor: 'Category Manager' })], OMAR).found,
    ).toEqual([]);
  });

  it('holds removals of what someone else described, and rules with different figures', () => {
    const r = findDisagreements(
      base,
      [
        {
          op: 'remove_step',
          step: 'S2',
          reason: 'we skip it',
          targets: { step: { kind: 'existing', id: s2.id } },
          finalProvenance: 'inferred',
        } as ValidOp,
        {
          op: 'add_rule',
          step: null,
          rule_type: 'approval',
          statement: 'Spend above AED 500,000 needs Head of Procurement approval',
          provenance: 'stated',
          source: null,
          quote: null,
          targets: {},
          finalProvenance: 'stated',
        } as ValidOp,
      ],
      OMAR,
    );
    expect(r.ops).toEqual([]);
    expect(r.found.map((f) => f.field)).toEqual(['remove', 'statement']);
    expect(r.found[1]!.proposedValue).toContain('500,000');
  });
});
