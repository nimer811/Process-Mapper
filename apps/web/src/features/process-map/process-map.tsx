import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { VersionGraph } from '@process-ai/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { layoutGraph, toFlow, type Highlight, type StepNode } from './layout';
import { useColorScheme } from '@/lib/theme';
import { nodeTypes } from './nodes';
import { edgeTypes } from './routed-edge';

interface ProcessMapProps {
  graph: VersionGraph;
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
  /** Open issues / opportunities per step, shown as small markers on nodes. */
  markers?: Record<string, { issues: number; opportunities: number }>;
  highlights?: Record<string, Highlight>;
  /** Open the map centred on this step instead of the start. */
  focusStepId?: string;
}

export function ProcessMap({
  graph,
  selectedStepId,
  onSelectStep,
  markers,
  highlights,
  focusStepId,
}: ProcessMapProps) {
  const colorScheme = useColorScheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useQuery({
    queryKey: ['map-layout', graph.id, graph.updatedAt],
    queryFn: () => layoutGraph(graph),
    staleTime: Infinity,
  });

  const flow = useMemo(() => {
    if (!layout.data) return null;
    const { nodes, edges } = toFlow(graph, layout.data);
    return {
      nodes: nodes.map((n): StepNode => ({
        ...n,
        selected: n.id === selectedStepId,
        data: { ...n.data, marker: markers?.[n.id], highlight: highlights?.[n.id] },
      })),
      edges,
    };
  }, [graph, layout.data, selectedStepId, markers, highlights]);

  if (!flow) return <Skeleton className="h-full w-full" />;

  return (
    <div ref={containerRef} className="h-full w-full">
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={colorScheme}
        onInit={(instance) => openReadable(instance, containerRef.current, focusStepId)}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        onNodeClick={(_, node) => onSelectStep(node.id)}
        onPaneClick={() => onSelectStep(null)}
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!hidden md:!block" />
        <Panel position="top-left">
          <MapLegend />
        </Panel>
      </ReactFlow>
    </div>
  );
}

const READABLE_ZOOM = 0.8;

/**
 * Fit the whole process when it is small enough to stay readable; otherwise open at a readable
 * zoom anchored on the start step, so users pan along the flow instead of squinting at it.
 */
function openReadable(
  instance: ReactFlowInstance<StepNode>,
  container: HTMLDivElement | null,
  focusStepId?: string,
) {
  // Computed from the node positions directly (not React Flow's own fit, which may not have run yet),
  // so every map opens the same way.
  const nodes = instance.getNodes();
  if (!container || !nodes.length) return;
  const left = Math.min(...nodes.map((n) => n.position.x));
  const right = Math.max(...nodes.map((n) => n.position.x + (n.width ?? 0)));
  const top = Math.min(...nodes.map((n) => n.position.y));
  const bottom = Math.max(...nodes.map((n) => n.position.y + (n.height ?? 0)));
  const pad = 48;
  const fit = Math.min(
    (container.clientWidth - pad * 2) / (right - left || 1),
    (container.clientHeight - pad * 2) / (bottom - top || 1),
    1,
  );
  if (fit >= READABLE_ZOOM) {
    // Small enough to show whole and readable: centre it.
    instance.setViewport({
      x: (container.clientWidth - (right - left) * fit) / 2 - left * fit,
      y: (container.clientHeight - (bottom - top) * fit) / 2 - top * fit,
      zoom: fit,
    });
    return;
  }
  const focus = focusStepId ? nodes.find((n) => n.id === focusStepId) : undefined;
  const start = nodes.find((n) => n.data.step.type === 'start') ?? nodes[0]!;
  const graphHeight = (bottom - top) * READABLE_ZOOM;
  const y =
    graphHeight < container.clientHeight
      ? (container.clientHeight - graphHeight) / 2 - top * READABLE_ZOOM
      : 72 - top * READABLE_ZOOM;
  const x = focus
    ? container.clientWidth / 3 - (focus.position.x + (focus.width ?? 0) / 2) * READABLE_ZOOM
    : 32 - start.position.x * READABLE_ZOOM;
  instance.setViewport({ x, y, zoom: READABLE_ZOOM });
}

function MapLegend() {
  return (
    <div className="bg-background/90 text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-1.5 text-[11px] backdrop-blur">
      <LegendLine label="Flow" color="var(--edge-default)" />
      <LegendLine label="Exception" color="var(--edge-exception)" dash="6 4" />
      <LegendLine label="Loop back" color="var(--edge-loop)" dash="4 4" />
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded-sm border border-l-4 border-l-amber-500" />
        Approval
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded-sm border border-dashed border-amber-500" />
        AI inferred
      </span>
    </div>
  );
}

function LegendLine({ label, color, dash }: { label: string; color: string; dash?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="6" aria-hidden>
        <line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dash} />
      </svg>
      {label}
    </span>
  );
}
