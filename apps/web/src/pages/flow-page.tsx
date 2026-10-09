import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { EndToEndFlow } from '@process-ai/shared';
import { useColorScheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/features/processes/badges';
import { useFlow } from '@/features/architecture/queries';

type FlowProcess = EndToEndFlow['processes'][number];
type ProcessNodeData = { process: FlowProcess; current: boolean };

const COL = 340;
const ROW = 190;

/** Columns by longest path from the processes nothing hands over to (cycles are cut). */
function layout(flow: EndToEndFlow, currentId: string) {
  const incoming = new Map<string, string[]>();
  for (const l of flow.links) incoming.set(l.to.id, [...(incoming.get(l.to.id) ?? []), l.from.id]);
  const depth = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const d = Math.max(-1, ...(incoming.get(id) ?? []).map((p) => visit(p, stack))) + 1;
    stack.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const p of flow.processes) visit(p.id, new Set());
  const rows = new Map<number, number>();
  const nodes: Node<ProcessNodeData>[] = flow.processes.map((p) => {
    const col = depth.get(p.id) ?? 0;
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    return {
      id: p.id,
      type: 'process',
      position: { x: col * COL, y: row * ROW },
      data: { process: p, current: p.id === currentId },
    };
  });
  const edges: Edge[] = flow.links.map((l) => ({
    id: l.id,
    source: l.from.id,
    target: l.to.id,
    label:
      [l.label, l.fromStepKey && `from ${l.fromStepKey}`].filter(Boolean).join(' · ') || undefined,
    animated: l.provenance === 'inferred',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: l.provenance === 'inferred' ? { strokeDasharray: '6 4' } : undefined,
  }));
  return { nodes, edges };
}

function ProcessNode({ data }: NodeProps<Node<ProcessNodeData>>) {
  const p = data.process;
  return (
    <div
      className={cn(
        'bg-card w-72 rounded-lg border p-3 text-left text-xs shadow-sm',
        data.current && 'ring-2 ring-sky-500',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      <div className="mb-1 flex items-center gap-2">
        <span className="truncate text-sm font-semibold">{p.name}</span>
        <StatusBadge status={p.status} />
      </div>
      <div className="text-muted-foreground mb-1.5">
        {p.department} · {p.stepCount} steps
        {p.category && (
          <Badge variant="outline" className="ml-1.5 font-normal">
            {p.category.code}
          </Badge>
        )}
      </div>
      {p.trigger && (
        <div className="line-clamp-2">
          <span className="font-medium">Starts: </span>
          {p.trigger}
        </div>
      )}
      {p.endCondition && (
        <div className="line-clamp-2">
          <span className="font-medium">Ends: </span>
          {p.endCondition}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
    </div>
  );
}

const nodeTypes = { process: ProcessNode };

/** End-to-end view: the chain of processes linked by hand-offs around one process. */
export function FlowPage() {
  const { processId = '' } = useParams();
  const flow = useFlow(processId);
  const navigate = useNavigate();
  const colorScheme = useColorScheme();
  const view = useMemo(
    () => (flow.data ? layout(flow.data, processId) : null),
    [flow.data, processId],
  );
  const current = flow.data?.processes.find((p) => p.id === processId);

  return (
    <>
      <nav className="text-muted-foreground mb-2 text-sm">
        <Link to={`/processes/${processId}`} className="hover:underline">
          {current?.name ?? 'Process'}
        </Link>{' '}
        / End to end
      </nav>
      <PageHeader
        title="End-to-end flow"
        description="Processes linked by hand-offs. Dashed links were suggested by the AI and are not confirmed yet. Click a process to open it."
      />
      {flow.isPending || !view ? (
        <Skeleton className="h-[60vh]" />
      ) : view.nodes.length <= 1 ? (
        <p className="text-muted-foreground text-sm">
          This process isn't linked to others yet. Add hand-offs from its page.
        </p>
      ) : (
        <Card className="h-[65vh] overflow-hidden py-0">
          <ReactFlow
            nodes={view.nodes}
            edges={view.edges}
            nodeTypes={nodeTypes}
            colorMode={colorScheme}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(_, n) => navigate(`/processes/${n.id}`)}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </Card>
      )}
    </>
  );
}
