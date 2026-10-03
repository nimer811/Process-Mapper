import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Bot, Hand, Monitor, ShieldCheck, User, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StepNode } from './layout';

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

export const TaskNode = memo(function TaskNode({ data, selected }: NodeProps<StepNode>) {
  const { step } = data;
  const isApproval = step.type === 'approval';
  const ExecIcon = executionIcon[step.execution];
  return (
    <div
      className={cn(
        'bg-card text-card-foreground flex h-full w-full flex-col justify-between rounded-lg border px-3 py-2 shadow-xs transition-shadow',
        isApproval && 'border-l-4 border-l-amber-500',
        provenanceBorder[step.provenance],
        selected && 'ring-ring ring-2 ring-offset-1',
      )}
    >
      <Handles />
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
        selected && 'ring-ring ring-2 ring-offset-1',
      )}
    >
      <Handles />
      <span className="line-clamp-2">{step.name}</span>
    </div>
  );
});

export const nodeTypes = { task: TaskNode, decision: DecisionNode, terminal: TerminalNode };
