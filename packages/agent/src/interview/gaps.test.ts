import { describe, expect, it } from 'vitest';
import { analyzeGaps, completeness } from './gaps.js';
import { nextStage } from './stage.js';
import { selectQuestions } from './policy.js';
import { edge, item, state, step } from '../test/fixtures.js';

const keys = (s: ReturnType<typeof state>) => analyzeGaps(s).map((g) => g.gapKey);

describe('analyzeGaps', () => {
  it('asks for scoping facts on an empty process', () => {
    const k = keys(state({ process: { name: 'Untitled process', departmentName: 'Procurement', isUntitled: true } }));
    expect(k).toEqual(expect.arrayContaining(['process:name', 'process:trigger', 'process:end_condition', 'process:purpose', 'process:owner_role']));
  });

  it('finds dangling steps, missing actors and decisions without enough branches', () => {
    const start = step('S1', { type: 'start' });
    const review = step('S2', { name: 'Review request' });
    const decide = step('S3', { type: 'decision', name: 'Approved?' });
    const s = state({ steps: [start, review, decide], edges: [edge(start, review), edge(review, decide)] });
    const k = keys(s);
    expect(k).toContain(`step:${decide.id}:next`);
    expect(k).toContain(`step:${review.id}:actor`);
    expect(k).toContain(`step:${decide.id}:branches`);
    expect(k).toContain('graph:end');
    expect(k).not.toContain(`step:${review.id}:next`);
  });

  it('accepts "no system" as an answer', () => {
    const s = state({ steps: [step('S1', { noSystem: true, actorName: 'Buyer' })] });
    expect(keys(s).some((k) => k.endsWith(':system'))).toBe(false);
  });

  it('scores completeness higher as the model fills in', () => {
    const start = step('S1', { type: 'start' });
    const t = step('S2', { actorName: 'Buyer', systems: ['SAP'], inputs: ['PR'], sla: '1 day' });
    const end = step('S3', { type: 'end' });
    const empty = state();
    const full = state({
      version: { purpose: 'p', trigger: 't', endCondition: 'e', ownerRole: 'o', description: null, frequency: null, volume: null },
      steps: [start, t, end],
      edges: [edge(start, t), edge(t, end)],
    });
    expect(completeness(empty)).toBeLessThan(20);
    expect(completeness(full)).toBe(100);
  });
});

describe('nextStage', () => {
  it('moves from scoping to happy path once trigger, end and name are known', () => {
    const s = state({ version: { trigger: 'PR raised', endCondition: 'PO sent', purpose: null, ownerRole: null, description: null, frequency: null, volume: null } });
    expect(nextStage(s, analyzeGaps(s), { userIntent: 'continue' })).toBe('happy_path');
  });

  it('jumps to summary when the user says they are finished', () => {
    expect(nextStage(state(), [], { userIntent: 'finish' })).toBe('summary');
  });

  it('moves on when a stage runs over its turn budget', () => {
    const s = state({ session: { stage: 'scoping', turnCount: 7, stageEnteredTurn: 0 } as never });
    expect(nextStage(s, analyzeGaps(s), { userIntent: 'continue' })).not.toBe('scoping');
  });
});

describe('selectQuestions', () => {
  it('prioritises contradictions and asks at most two questions', () => {
    const a = item({ priority: 90 });
    const c = item({ type: 'contradiction', source: 'extractor', priority: 60 });
    const picked = selectQuestions(state({ openItems: [a, c] }), [a, c], 'happy_path');
    expect(picked[0]!.id).toBe(c.id);
    expect(picked).toHaveLength(1);
  });

  it('pairs a second question only when it is about the same step', () => {
    const stepId = '00000000-0000-4000-8000-999999999999';
    const actor = item({ entityType: 'step', entityId: stepId, priority: 70 });
    const system = item({ entityType: 'step', entityId: stepId, priority: 60 });
    const other = item({ priority: 65 });
    const picked = selectQuestions(state({ openItems: [actor, system, other] }), [actor, system, other], 'step_detail');
    expect(picked.map((p) => p.id)).toEqual([actor.id, system.id]);
  });

  it("doesn't repeat a question asked last turn, and skips items asked twice", () => {
    const justAsked = item({ priority: 90, status: 'asked', timesAsked: 1, lastAskedTurn: 3 });
    const exhausted = item({ priority: 95, status: 'asked', timesAsked: 2, lastAskedTurn: 1 });
    const fresh = item({ priority: 40 });
    const s = state({ session: { turnCount: 4 } as never, openItems: [justAsked, exhausted, fresh] });
    expect(selectQuestions(s, s.openItems, 'happy_path')[0]!.id).toBe(fresh.id);
  });

  it('holds back questions for later stages', () => {
    const later = item({ priority: 90 });
    const now = item({ priority: 30 });
    const picked = selectQuestions(state(), [{ ...later, stage: 'rules_controls_pain' }, { ...now, stage: 'scoping' }], 'scoping');
    expect(picked[0]!.id).toBe(now.id);
  });
});
