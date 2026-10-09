import { describe, expect, it } from 'vitest';
import type { ProcessEdge, ProcessStep, VersionGraph } from '@process-ai/shared';
import { computeValue } from './metrics.js';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const step = (stepKey: string, p: Partial<ProcessStep> = {}): ProcessStep => ({
  id: id(),
  stepKey,
  sequence: null,
  type: 'task',
  name: stepKey,
  description: null,
  actor: null,
  systems: [],
  inputs: [],
  outputs: [],
  execution: 'manual',
  expectedDuration: null,
  sla: null,
  approvalAuthority: null,
  accountableRole: null,
  consultedRoles: [],
  informedRoles: [],
  painPoints: [],
  dependsOn: [],
  provenance: 'confirmed',
  confidence: null,
  ...p,
});
const edge = (
  a: ProcessStep,
  b: ProcessStep,
  type: ProcessEdge['type'] = 'sequence',
): ProcessEdge => ({
  id: id(),
  fromStepId: a.id,
  toStepId: b.id,
  type,
  conditionLabel: null,
  provenance: 'confirmed',
});

describe('computeValue', () => {
  const start = step('S1', { type: 'start' });
  const review = step('S2', { expectedDuration: '2 working days' });
  const decide = step('S3', { type: 'decision', expectedDuration: '1 hour' });
  const fast = step('S4', { expectedDuration: '30 minutes' });
  const slow = step('S5', { expectedDuration: '3–5 days' });
  const auto = step('S6', { execution: 'automated' });
  const end = step('S7', { type: 'end' });
  const g = {
    steps: [start, review, decide, fast, slow, auto, end],
    edges: [
      edge(start, review),
      edge(review, decide),
      edge(decide, fast, 'branch'),
      edge(decide, slow, 'branch'),
      edge(fast, auto),
      edge(slow, auto),
      edge(auto, end),
      edge(slow, review, 'loop_back'),
    ],
    volume: 'about 40 per month',
    frequency: null,
  } as unknown as VersionGraph;

  it('follows the longest normal path and ignores loop-backs', () => {
    const v = computeValue({ graph: g, opportunities: [], estimates: [], canEstimate: true });
    expect(v.steps.filter((s) => s.onMainPath).map((s) => s.stepKey)).toEqual([
      'S2',
      'S3',
      'S5',
      'S6',
    ]);
    expect(v.cycleMinutes).toBe(960 + 60 + 1920 + 0);
    expect(v.volumePerMonth).toEqual({ value: 40, source: 'stated' });
    expect(v.completeness.duration).toBe(1);
  });

  it('uses owner figures over the map and AI estimates last, and values opportunities', () => {
    const v = computeValue({
      graph: g,
      opportunities: [
        { id: id(), title: 'Robot for review', kind: 'rpa', status: 'proposed', stepId: review.id },
        { id: id(), title: 'Unlinked idea', kind: 'workflow', status: 'proposed', stepId: null },
      ],
      estimates: [
        {
          stepId: review.id,
          source: 'ai',
          effortMinutes: 45,
          durationMinutes: 9999,
          volumePerMonth: null,
        },
        {
          stepId: review.id,
          source: 'owner',
          effortMinutes: 60,
          durationMinutes: null,
          volumePerMonth: null,
        },
        {
          stepId: decide.id,
          source: 'ai',
          effortMinutes: 15,
          durationMinutes: null,
          volumePerMonth: null,
        },
        {
          stepId: slow.id,
          source: 'ai',
          effortMinutes: 120,
          durationMinutes: null,
          volumePerMonth: null,
        },
      ],
      canEstimate: true,
    });
    const s2 = v.steps.find((s) => s.stepKey === 'S2')!;
    expect(s2.effort).toEqual({ value: 60, source: 'owner' });
    expect(s2.duration).toEqual({ value: 960, source: 'stated' }); // the employee's words beat the AI
    expect(v.touchMinutes).toBe(60 + 15 + 120 + 0);
    expect(v.effortHoursPerMonth).toBe(130);
    expect(v.waitShare).toBeCloseTo(0.93, 2);
    expect(v.opportunities[0]).toMatchObject({
      title: 'Robot for review',
      hoursSavedPerMonth: 32,
      stepKey: 'S2',
    });
    expect(v.opportunities[0]!.assumption).toBe('80% of 1 h hands-on × 40 cases a month.');
    expect(v.opportunities[1]).toMatchObject({ hoursSavedPerMonth: null });
  });

  it('reports unknowns instead of guessing', () => {
    const bare = {
      ...g,
      volume: null,
      steps: g.steps.map((s) => ({ ...s, expectedDuration: null })),
    } as VersionGraph;
    const v = computeValue({ graph: bare, opportunities: [], estimates: [], canEstimate: false });
    expect(v.volumePerMonth).toEqual({ value: null, source: null });
    expect(v.effortHoursPerMonth).toBeNull();
    expect(v.completeness.effort).toBeCloseTo(1 / 5);
  });
});
