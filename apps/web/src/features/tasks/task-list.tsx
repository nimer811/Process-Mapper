import { Link } from 'react-router';
import {
  CheckCircle2,
  ClipboardCheck,
  MessageSquareReply,
  MessagesSquare,
  Stamp,
  UserRoundPlus,
  Users,
  Scale,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Task, TaskKind } from '@process-ai/shared';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { useDismissTask } from './queries';

const ICON: Record<TaskKind, LucideIcon> = {
  confirm_points: MessageSquareReply,
  continue_interview: MessagesSquare,
  assign_owner: UserRoundPlus,
  validate: ClipboardCheck,
  approve: Stamp,
  add_view: Users,
  resolve_disagreements: Scale,
};

const ACTION: Record<TaskKind, string> = {
  confirm_points: 'Confirm',
  continue_interview: 'Continue',
  assign_owner: 'Assign owner',
  validate: 'Review',
  approve: 'Review',
  add_view: 'Start',
  resolve_disagreements: 'Decide',
};

export function TaskList({ tasks, compact = false }: { tasks: Task[]; compact?: boolean }) {
  const dismiss = useDismissTask();
  return (
    <ul className="grid gap-2">
      {tasks.map((t) => {
        const Icon = t.status === 'open' ? ICON[t.kind] : CheckCircle2;
        const done = t.status !== 'open';
        return (
          <li
            key={t.id}
            className={cn('flex items-start gap-3 rounded-md border p-3', done && 'opacity-60')}
          >
            <Icon
              className={cn('mt-0.5 size-4 shrink-0', done ? 'text-emerald-600' : 'text-sky-600')}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t.title}</div>
              {!compact && t.detail && (
                <p className="text-muted-foreground mt-0.5 text-sm">{t.detail}</p>
              )}
              <div className="text-muted-foreground mt-1 text-xs">
                {done
                  ? `${t.status === 'dismissed' ? 'Dismissed' : 'Done'} ${formatDate(t.completedAt)}`
                  : formatDate(t.createdAt)}
              </div>
            </div>
            {!done && (
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="outline" asChild>
                  <Link to={t.link}>{ACTION[t.kind]}</Link>
                </Button>
                {t.dismissible && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Dismiss"
                    disabled={dismiss.isPending}
                    onClick={() => dismiss.mutate(t.id)}
                  >
                    <X />
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
