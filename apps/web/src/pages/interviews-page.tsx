import { Link } from 'react-router';
import { MessageSquarePlus, MessagesSquare } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { stageLabel, useInterviews } from '@/features/interviews/queries';
import { StartInterviewDialog } from '@/features/interviews/start-interview-dialog';

export function InterviewsPage({ all = false }: { all?: boolean }) {
  const interviews = useInterviews(all);
  const startButton = (
    <StartInterviewDialog
      trigger={
        <Button>
          <MessageSquarePlus />
          Map a process
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title={all ? 'Interview sessions' : 'Interviews'}
        description={
          all
            ? 'All AI interviews across the organisation.'
            : 'Your process-mapping conversations. Pick up where you left off at any time.'
        }
        actions={all ? undefined : startButton}
      />
      {interviews.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !interviews.data?.length ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessagesSquare />
            </EmptyMedia>
            <EmptyTitle>No interviews yet</EmptyTitle>
            <EmptyDescription>Start one to map a process just by describing it.</EmptyDescription>
          </EmptyHeader>
          {!all && <EmptyContent>{startButton}</EmptyContent>}
        </Empty>
      ) : (
        <Card className="py-0">
          <CardContent className="px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Process</TableHead>
                  {all && <TableHead>Interviewee</TableHead>}
                  <TableHead>Stage</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interviews.data.map((i) => (
                  <TableRow key={i.id} className="relative">
                    <TableCell>
                      <Link
                        to={`/interviews/${i.id}`}
                        className="font-medium after:absolute after:inset-0 hover:underline"
                      >
                        {i.processName}
                      </Link>
                      <div className="text-muted-foreground text-xs">{i.departmentName}</div>
                    </TableCell>
                    {all && <TableCell>{i.user.displayName}</TableCell>}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{stageLabel[i.stage]}</Badge>
                        {i.status === 'paused' && (
                          <span className="text-muted-foreground text-xs">Paused</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={i.completeness ?? 0} className="w-24" />
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {Math.round(i.completeness ?? 0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(i.lastActivityAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
