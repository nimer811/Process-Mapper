import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, MessageSquarePlus } from 'lucide-react';
import { useAuth } from '@/auth/auth';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { StartInterviewDialog } from '@/features/interviews/start-interview-dialog';
import { stageLabel, useInterviews } from '@/features/interviews/queries';
import { useProcesses } from '@/features/processes/queries';
import { StatusBadge } from '@/features/processes/badges';

export function HomePage() {
  const { user } = useAuth();
  const firstName = user?.displayName.split(' ')[0] ?? '';
  const awaiting = useProcesses({ owner: 'me', status: 'under_validation' });
  const interviews = useInterviews();
  const all = useProcesses({});
  const recent = [...(all.data ?? [])]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  const openInterviews = (interviews.data ?? [])
    .filter((i) => i.status !== 'completed')
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Map how work really happens, and keep it in one place."
        actions={
          <StartInterviewDialog
            trigger={
              <Button>
                <MessageSquarePlus />
                Map a process
              </Button>
            }
          />
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard
          title="Awaiting my validation"
          empty="Nothing waiting for you."
          loading={awaiting.isPending}
          items={(awaiting.data ?? []).map((p) => ({
            key: p.id,
            to: `/processes/${p.id}`,
            title: p.name,
            meta: `${p.department.name} · v${p.versionNumber}`,
          }))}
          highlight={!!awaiting.data?.length}
        />
        <ListCard
          title="My interviews in progress"
          empty="No interviews in progress."
          loading={interviews.isPending}
          items={openInterviews.map((i) => ({
            key: i.id,
            to: `/interviews/${i.id}`,
            title: i.processName,
            meta: `${i.status === 'paused' ? 'Paused' : stageLabel[i.stage]} · ${Math.round(i.completeness ?? 0)}%`,
          }))}
        />
        <ListCard
          title="Recently updated"
          empty="No processes yet."
          loading={all.isPending}
          items={recent.map((p) => ({
            key: p.id,
            to: `/processes/${p.id}`,
            title: p.name,
            meta: formatDate(p.updatedAt),
            badge: <StatusBadge status={p.status} />,
          }))}
        />
      </div>
    </>
  );
}

function ListCard(props: {
  title: string;
  empty: string;
  loading: boolean;
  highlight?: boolean;
  items: { key: string; to: string; title: string; meta: string; badge?: ReactNode }[];
}) {
  return (
    <Card className={props.highlight ? 'border-sky-300 dark:border-sky-800' : undefined}>
      <CardHeader>
        <CardTitle className="text-base">
          {props.title}
          {props.items.length > 0 && (
            <span className="text-muted-foreground font-normal"> ({props.items.length})</span>
          )}
        </CardTitle>
        {!props.loading && !props.items.length && <CardDescription>{props.empty}</CardDescription>}
      </CardHeader>
      {(props.loading || props.items.length > 0) && (
        <CardContent className="px-3">
          {props.loading ? (
            <Skeleton className="h-16" />
          ) : (
            <ul>
              {props.items.map((i) => (
                <li key={i.key}>
                  <Link
                    to={i.to}
                    className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{i.title}</div>
                      <div className="text-muted-foreground text-xs">{i.meta}</div>
                    </div>
                    {i.badge}
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
