import { Inbox } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { TaskList } from '@/features/tasks/task-list';
import { useTasks } from '@/features/tasks/queries';

/** "My actions": what the signed-in person needs to do. Tasks close themselves when done. */
export function InboxPage() {
  const tasks = useTasks();
  const open = (tasks.data ?? []).filter((t) => t.status === 'open');
  const done = (tasks.data ?? []).filter((t) => t.status !== 'open');

  return (
    <>
      <PageHeader
        title="My actions"
        description="Things waiting for you. Each one closes by itself once it's done."
      />
      {tasks.isPending ? (
        <Skeleton className="h-32" />
      ) : open.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>You're all caught up</EmptyTitle>
            <EmptyDescription>Nothing is waiting for you right now.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <TaskList tasks={open} />
      )}
      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-2 text-sm font-semibold">Recently done</h2>
          <TaskList tasks={done} compact />
        </section>
      )}
    </>
  );
}
