import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge } from 'elkjs/lib/elk-api';
import type { Edge, Node } from '@xyflow/react';
import type { EdgeType, ProcessEdge, ProcessStep, StepType, VersionGraph } from '@process-ai/shared';

export type StepNodeData = { step: ProcessStep };
export type StepNode = Node<StepNodeData>;

export type Point = { x: number; y: number };
export type RoutedEdgeData = { points: Point[]; edgeType: EdgeType };

export interface GraphLayout {
  positions: Map<string, Point>;
  /** Orthogonal routes computed by ELK, so edges never cut through steps. */
  routes: Map<string, Point[]>;
}

export const NODE_SIZE: Record<StepType, { width: number; height: number }> = {
  start: { width: 176, height: 48 },
  end: { width: 176, height: 48 },
  task: { width: 240, height: 92 },
  approval: { width: 240, height: 92 },
  subprocess: { width: 240, height: 92 },
  decision: { width: 136, height: 136 },
};

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

const elk = new ELK();

/** Computes node positions from the process graph. The map is always derived from data. */
export async function layoutGraph(graph: Pick<VersionGraph, 'steps' | 'edges'>): Promise<GraphLayout> {
  const result = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.spacing.nodeNode': '56',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
    },
    children: graph.steps.map((s) => ({ id: s.id, ...NODE_SIZE[s.type] })),
    // Loop-backs are laid out as forward edges (so they don't disturb the left-to-right flow)
    // and drawn reversed below; that way ELK still routes them around every step.
    edges: graph.edges.map((e) =>
      e.type === 'loop_back'
        ? { id: e.id, sources: [e.toStepId], targets: [e.fromStepId] }
        : { id: e.id, sources: [e.fromStepId], targets: [e.toStepId] },
    ),
  });
  const positions = new Map((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  const loopBacks = new Set(graph.edges.filter((e) => e.type === 'loop_back').map((e) => e.id));
  const routes = new Map<string, Point[]>();
  for (const e of (result.edges ?? []) as ElkExtendedEdge[]) {
    const section = e.sections?.[0];
    if (section) {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      routes.set(e.id, loopBacks.has(e.id) ? points.reverse() : points);
    }
  }
  return { positions, routes };
}

export function toFlow(
  graph: Pick<VersionGraph, 'steps' | 'edges'>,
  { positions, routes }: GraphLayout,
): { nodes: StepNode[]; edges: Edge[] } {
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
