import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { StepType, VersionGraph } from '@process-ai/shared';

export type Point = { x: number; y: number };
export type DiagramGraph = Pick<VersionGraph, 'steps' | 'edges'>;

export interface GraphLayout {
  positions: Map<string, Point>;
  /** Orthogonal routes computed by ELK, so edges never cut through steps. */
  routes: Map<string, Point[]>;
  width: number;
  height: number;
}

export const NODE_SIZE: Record<StepType, { width: number; height: number }> = {
  start: { width: 176, height: 48 },
  end: { width: 176, height: 48 },
  task: { width: 240, height: 92 },
  approval: { width: 240, height: 92 },
  subprocess: { width: 240, height: 92 },
  decision: { width: 136, height: 136 },
};

const elk = new ELK();

/**
 * Computes node positions and edge routes from the process graph. Used by the on-screen map
 * and by exported packs, so both always show the same diagram.
 */
export async function layoutGraph(graph: DiagramGraph): Promise<GraphLayout> {
  const result: ElkNode = await elk.layout({
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

  const positions = new Map(
    (result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]),
  );
  const loopBacks = new Set(graph.edges.filter((e) => e.type === 'loop_back').map((e) => e.id));
  const routes = new Map<string, Point[]>();
  for (const e of (result.edges ?? []) as ElkExtendedEdge[]) {
    const section = e.sections?.[0];
    if (section) {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      routes.set(e.id, loopBacks.has(e.id) ? points.reverse() : points);
    }
  }
  return { positions, routes, width: result.width ?? 0, height: result.height ?? 0 };
}
