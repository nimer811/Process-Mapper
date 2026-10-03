import { Link } from 'react-router';
import type { ProcessListItem } from '@process-ai/shared';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { useProcesses } from '@/features/processes/queries';

/** Admin work queue: validated processes to approve, and reviews that are stuck (e.g. no owner). */
export function ApprovalsPage() {
  const validated = useProcesses({ status: 'validated' });
  const inReview = useProcesses({ status: 'under_validation' });
  return (
    <>
      <nav className="text-muted-foreground mb-2 text-sm">
        <Link to="/admin" className="hover:underline">
          Admin
        </Link>{' '}
        / Approvals
      </nav>
      <PageHeader
        title="Approvals"
        description="Validated processes waiting for approval, and processes under review."
      />
      <div className="grid gap-6">
        <Queue
          title="Ready for approval"
          description="Validated by their owner. Open one to approve it."
          loading={validated.isPending}
          items={validated.data ?? []}
          when={(p) => `Validated ${formatDate(p.lastReviewedAt)}`}
        />
        <Queue
          title="Under validation"
          description="Waiting for the process owner. Assign an owner where none is set."
          loading={inReview.isPending}
          items={inReview.data ?? []}
          when={(p) => `Updated ${formatDate(p.updatedAt)}`}
        />
      </div>
    </>
  );
}

function Queue(props: {
  title: string;
  description: string;
  loading: boolean;
  items: ProcessListItem[];
  when: (p: ProcessListItem) => string;
}) {
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">
          {props.title}{' '}
          <span className="text-muted-foreground font-normal">({props.items.length})</span>
        </CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent className="px-2">
        {props.loading ? (
          <Skeleton className="m-4 h-12" />
        ) : !props.items.length ? (
          <p className="text-muted-foreground px-4 pb-4 text-sm">Nothing here.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Version</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.items.map((p) => (
                <TableRow key={p.id} className="relative">
                  <TableCell>
                    <Link
                      to={`/processes/${p.id}`}
                      className="font-medium after:absolute after:inset-0 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>{p.department.name}</TableCell>
                  <TableCell>
                    {p.owner?.displayName ?? (
                      <span className="text-amber-700 dark:text-amber-400">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>v{p.versionNumber}</TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs">
                    {props.when(p)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
