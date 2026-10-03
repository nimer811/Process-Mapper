import { describe, expect, it } from 'vitest';
import type { ProcessEdge, ProcessStep, StepType } from '@process-ai/shared';
import { layoutGraph } from './layout.js';
import { buildScene } from './scene.js';
import { sceneToSvg } from './svg.js';
import { labelPoint, roundedPath, wrapText } from './geometry.js';

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

  it('renders an escaped standalone SVG containing every step', async () => {
    const g = { ...graph, steps: graph.steps.map((s) => (s.id === 'a' ? { ...s, name: 'Check <PO> & quotes' } : s)) };
    const svg = sceneToSvg(buildScene(g, await layoutGraph(g)), 'Test & map');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Check &lt;PO&gt; &amp; quotes');
    expect(svg).toContain('<title>Test &amp; map</title>');
    expect(svg).not.toContain('<PO>');
    expect(svg).toContain('>Yes<'); // branch label
  });
});

describe('geometry', () => {
  it('puts the label on the longest horizontal run', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 300 },
      { x: 120, y: 300 },
    ];
    expect(labelPoint(pts)).toEqual({ x: 70, y: 300 });
  });

  it('draws a path through every point', () => {
    const d = roundedPath([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ]);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d.endsWith('L 50 50')).toBe(true);
  });

  it('wraps text and ellipsises overflow', () => {
    expect(wrapText('Review documents and screen vendor', 20, 2)).toEqual(['Review documents and', 'screen vendor']);
    const lines = wrapText('one two three four five six seven eight', 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
  });
});
