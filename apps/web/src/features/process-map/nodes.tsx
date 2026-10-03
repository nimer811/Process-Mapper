import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Bot,
  Hand,
  Lightbulb,
  Monitor,
  ShieldCheck,
  TriangleAlert,
  User,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StepNode } from './layout';

/** Comparison highlight ring (As-Is vs To-Be). */
const highlightRing = {
  added: 'ring-2 ring-emerald-500 ring-offset-2',
  modified: 'ring-2 ring-amber-500 ring-offset-2',
  removed: 'ring-2 ring-red-500 ring-offset-2 opacity-60',
} as const;

const provenanceBorder = {
  stated: '',
  documented: '',
  confirmed: '',
  inferred: 'border-dashed border-amber-500',
  disputed: 'border-dashed border-red-500',
} as const;

function Handles() {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-1.5 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-1.5 !border-0 !bg-transparent"
      />
    </>
  );
}

const executionIcon = {
  manual: Hand,
  automated: Bot,
  semi_automated: Workflow,
  unknown: null,
} as const;

/** Small badges for open issues and opportunities on a step. */
function Markers({ marker }: { marker?: { issues: number; opportunities: number } }) {
  if (!marker || (!marker.issues && !marker.opportunities)) return null;
  return (
    <div className="absolute -top-2.5 right-2 flex gap-1">
      {marker.issues > 0 && (
        <span
          className="flex items-center gap-0.5 rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 font-semibold text-white"
          title={`${marker.issues} issue(s)`}
        >
          <TriangleAlert className="size-2.5" />
          {marker.issues}
        </span>
      )}
      {marker.opportunities > 0 && (
        <span
          className="flex items-center gap-0.5 rounded-full bg-sky-600 px-1.5 text-[10px] leading-4 font-semibold text-white"
          title={`${marker.opportunities} opportunit(ies)`}
        >
          <Lightbulb className="size-2.5" />
          {marker.opportunities}
        </span>
      )}
    </div>
  );
}

export const TaskNode = memo(function TaskNode({ data, selected }: NodeProps<StepNode>) {
  const { step } = data;
  const isApproval = step.type === 'approval';
  const ExecIcon = executionIcon[step.execution];
  return (
    <div
      className={cn(
        'bg-card text-card-foreground relative flex h-full w-full flex-col justify-between rounded-lg border px-3 py-2 shadow-xs transition-shadow',
        isApproval && 'border-l-4 border-l-amber-500',
        provenanceBorder[step.provenance],
        data.highlight && highlightRing[data.highlight],
        selected && 'ring-ring ring-2 ring-offset-1',
      )}
    >
      <Handles />
      <Markers marker={data.marker} />
      <div className="text-muted-foreground flex items-center justify-between text-[10px] font-medium tracking-wide uppercase">
        <span className="flex items-center gap-1">
          {isApproval && <ShieldCheck className="size-3 text-amber-600" />}
          {step.stepKey} · {isApproval ? 'Approval' : 'Task'}
        </span>
        {ExecIcon && <ExecIcon className="size-3" aria-label={step.execution} />}
      </div>
      <div className="line-clamp-2 text-[13px] leading-snug font-medium">{step.name}</div>
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-[11px]">
        {step.actor && (
          <span className="flex min-w-0 items-center gap-1">
            <User className="size-3 shrink-0" />
            <span className="truncate">{step.actor.name}</span>
          </span>
        )}
        {step.systems[0] && (
          <span className="flex min-w-0 items-center gap-1">
            <Monitor className="size-3 shrink-0" />
            <span className="truncate">
              {step.systems[0].name}
              {step.systems.length > 1 && ` +${step.systems.length - 1}`}
            </span>
          </span>
        )}
      </div>
    </div>
  );
});

export const DecisionNode = memo(function DecisionNode({ data, selected }: NodeProps<StepNode>) {
  const { step } = data;
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <Handles />
      <div
        className={cn(
          'absolute inset-[15%] rotate-45 rounded-md border-2 border-sky-500 bg-sky-50 shadow-xs dark:bg-sky-950',
          provenanceBorder[step.provenance],
          data.highlight && highlightRing[data.highlight],
          selected && 'ring-ring ring-2 ring-offset-1',
        )}
      />
      <div className="relative px-6 text-center text-[11px] leading-tight font-medium">
        {step.name}
      </div>
    </div>
  );
});

export const TerminalNode = memo(function TerminalNode({ data, selected }: NodeProps<StepNode>) {
  const { step } = data;
  const isStart = step.type === 'start';
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full border-2 px-4 text-center text-xs font-medium shadow-xs',
        isStart
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950'
          : 'border-foreground/70 bg-muted',
        provenanceBorder[step.provenance],
        data.highlight && highlightRing[data.highlight],
        selected && 'ring-ring ring-2 ring-offset-1',
      )}
    >
      <Handles />
      <span className="line-clamp-2">{step.name}</span>
    </div>
  );
});

export const nodeTypes = { task: TaskNode, decision: DecisionNode, terminal: TerminalNode };
