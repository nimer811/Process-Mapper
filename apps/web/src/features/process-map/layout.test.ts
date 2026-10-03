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
const edge = (
  id: string,
  from: string,
  to: string,
  type: ProcessEdge['type'] = 'sequence',
): ProcessEdge => ({
  id,
  fromStepId: from,
  toStepId: to,
  type,
  conditionLabel: type === 'branch' ? 'Yes' : null,
  provenance: 'stated',
});

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

describe('toFlow', () => {
  it('maps step types to node types and draws every edge along its ELK route', async () => {
    const { nodes, edges } = toFlow(graph, await layoutGraph(graph));
    expect(Object.fromEntries(nodes.map((n) => [n.id, n.type]))).toMatchObject({
      start: 'terminal',
      d: 'decision',
      a: 'task',
      end: 'terminal',
    });
    expect(edges).toHaveLength(5);
    expect(edges.every((e) => e.type === 'routed')).toBe(true);
    expect(edges.find((e) => e.id === 'e2')?.label).toBe('Yes');
    expect(edges.find((e) => e.id === 'e3')?.style?.strokeDasharray).toBeDefined();
  });
});
