import { describe, expect, it } from 'vitest';
import type { ProcessEdge, ProcessStep, StepType } from '@process-ai/shared';
import { layoutGraph, toFlow } from './layout';

const step = (id: string, type: StepType = 'task'): ProcessStep => ({
  id,
  stepKey: id,
  sequence: null,
  type,
  name: id,
  description: null,
  actor: null,
  systems: [],
  inputs: [],
  outputs: [],
  execution: 'unknown',
  expectedDuration: null,
  sla: null,
  approvalAuthority: null,
  painPoints: [],
  dependsOn: [],
  provenance: 'stated',
  confidence: null,
});
const edge = (id: string, from: string, to: string, type: ProcessEdge['type'] = 'sequence'): ProcessEdge => ({
  id,
  fromStepId: from,
  toStepId: to,
  type,
  conditionLabel: type === 'branch' ? 'Yes' : null,
  provenance: 'stated',
});

// start → decision → (A | B) → end, with a loop from B back to the decision
const graph = {
  steps: [step('start', 'start'), step('d', 'decision'), step('a'), step('b'), step('end', 'end')],
  edges: [
    edge('e1', 'start', 'd'),
    edge('e2', 'd', 'a', 'branch'),
    edge('e3', 'd', 'b', 'exception'),
    edge('e4', 'a', 'end'),
    edge('e5', 'b', 'd', 'loop_back'),
  ],
};

describe('process map layout', () => {
  it('lays out a branching graph left to right, with loop-backs routed but not driving layering', async () => {
    const { positions: pos, routes } = await layoutGraph(graph);
    expect(pos.size).toBe(5);
    // Loop-back from b to d: routed, and drawn starting at b and ending at d.
    const loop = routes.get('e5')!;
    expect(loop[0]!.x).toBeGreaterThan(loop[loop.length - 1]!.x);
    expect(routes.get('e2')!.length).toBeGreaterThanOrEqual(2);
    expect(pos.get('start')!.x).toBeLessThan(pos.get('d')!.x);
    expect(pos.get('d')!.x).toBeLessThan(pos.get('a')!.x);
    expect(pos.get('a')!.x).toBeLessThan(pos.get('end')!.x);
    // The two branches sit side by side, not on top of each other.
    expect(pos.get('a')!.y).not.toBe(pos.get('b')!.y);
  });

  it('maps step types to node types and keeps every edge, labelled and styled by type', async () => {
    const { nodes, edges } = toFlow(graph, await layoutGraph(graph));
    expect(Object.fromEntries(nodes.map((n) => [n.id, n.type]))).toMatchObject({
      start: 'terminal',
      d: 'decision',
      a: 'task',
      end: 'terminal',
    });
    expect(edges).toHaveLength(5);
    expect(edges.find((e) => e.id === 'e2')?.label).toBe('Yes');
    expect(edges.find((e) => e.id === 'e3')?.style?.strokeDasharray).toBeDefined();
    expect(edges.find((e) => e.id === 'e2')?.type).toBe('routed');
    expect(edges.find((e) => e.id === 'e5')?.type).toBe('routed');
  });
});
