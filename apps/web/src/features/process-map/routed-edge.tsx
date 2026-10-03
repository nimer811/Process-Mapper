import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';
import { labelPoint, roundedPath } from '@process-ai/diagram';
import type { RoutedEdgeData } from './layout';

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
