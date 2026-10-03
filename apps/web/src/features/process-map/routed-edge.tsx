import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';
import type { Point, RoutedEdgeData } from './layout';

const RADIUS = 8;

/** SVG path through ELK's orthogonal points, with softly rounded corners. */
export function roundedPath(points: Point[]) {
  if (points.length < 2) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const r = Math.min(RADIUS, dist(prev, cur) / 2, dist(cur, next) / 2);
    const a = towards(cur, prev, r);
    const b = towards(cur, next, r);
    d += ` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}

/**
 * Label sits mid-way along the edge's longest horizontal run: the part that unambiguously
 * belongs to this edge, with room for text. Falls back to the longest segment.
 */
export function labelPoint(points: Point[]): Point {
  let best: { a: Point; b: Point; score: number } | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const horizontal = Math.abs(a.y - b.y) < 1;
    const score = dist(a, b) + (horizontal ? 10_000 : 0);
    if (!best || score > best.score) best = { a, b, score };
  }
  if (!best) return points[0] ?? { x: 0, y: 0 };
  return { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const towards = (from: Point, to: Point, d: number) => {
  const len = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / len) * d, y: from.y + ((to.y - from.y) / len) * d };
};

export function RoutedEdge({ data, label, style, markerEnd }: EdgeProps<Edge<RoutedEdgeData>>) {
  const points = data?.points ?? [];
  const at = labelPoint(points);
  return (
    <>
      <BaseEdge path={roundedPath(points)} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="bg-background text-foreground nodrag nopan pointer-events-none absolute rounded border px-1.5 py-0.5 text-[11px] leading-none"
            style={{ transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { routed: RoutedEdge };
