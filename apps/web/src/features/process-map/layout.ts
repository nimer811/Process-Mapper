import type { Edge, Node } from '@xyflow/react';
import type { EdgeType, ProcessEdge, ProcessStep, StepType } from '@process-ai/shared';
import { NODE_SIZE, type DiagramGraph, type GraphLayout, type Point } from '@process-ai/diagram';

export { layoutGraph } from '@process-ai/diagram';

export type StepNodeData = { step: ProcessStep };
export type StepNode = Node<StepNodeData>;
export type RoutedEdgeData = { points: Point[]; edgeType: EdgeType };

const nodeTypeFor: Record<StepType, string> = {
  start: 'terminal',
  end: 'terminal',
  task: 'task',
  approval: 'task',
  subprocess: 'task',
  decision: 'decision',
};

export const edgeColor: Record<EdgeType, string> = {
  sequence: 'var(--edge-default)',
  branch: 'var(--edge-default)',
  alternate: 'var(--edge-default)',
  exception: 'var(--edge-exception)',
  loop_back: 'var(--edge-loop)',
};

const edgeDash: Partial<Record<EdgeType, string>> = {
  exception: '6 4',
  loop_back: '4 4',
  alternate: '2 4',
};

/** Converts a computed layout into React Flow nodes and edges. */
export function toFlow(graph: DiagramGraph, { positions, routes }: GraphLayout): { nodes: StepNode[]; edges: Edge[] } {
  const nodes: StepNode[] = graph.steps.map((step) => ({
    id: step.id,
    type: nodeTypeFor[step.type],
    position: positions.get(step.id) ?? { x: 0, y: 0 },
    data: { step },
    ...NODE_SIZE[step.type],
  }));

  const edges: Edge[] = graph.edges.map((e: ProcessEdge) => {
    const color = edgeColor[e.type];
    const route = routes.get(e.id);
    return {
      id: e.id,
      source: e.fromStepId,
      target: e.toStepId,
      // Fallback only: every edge normally has an ELK route.
      type: route ? 'routed' : 'smoothstep',
      label: e.conditionLabel ?? undefined,
      markerEnd: { type: 'arrowclosed', color, width: 16, height: 16 },
      style: { stroke: color, strokeWidth: 1.5, strokeDasharray: edgeDash[e.type] },
      labelStyle: { fontSize: 11, fill: 'var(--foreground)' },
      labelBgStyle: { fill: 'var(--background)' },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
      data: { edgeType: e.type, points: route ?? [] } satisfies RoutedEdgeData,
    } satisfies Edge;
  });

  return { nodes, edges };
}
