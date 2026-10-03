import { Link, useParams } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDepartments, useProcesses } from '@/features/processes/queries';
import { ProcessTable } from '@/features/processes/process-table';
import { ProcessFilters } from '@/features/processes/process-filters';
import { EmptyProcesses } from '@/features/processes/empty-processes';
import { useListParams } from '@/features/processes/use-list-params';
import { DepartmentPackButton } from '@/features/processes/download-actions';

export function DepartmentPage() {
  const { departmentSlug = '' } = useParams();
  const { q, status, query, update } = useListParams();
  const departments = useDepartments();
  const processes = useProcesses({ ...query, department: departmentSlug });
  const department = departments.data?.find((d) => d.slug === departmentSlug);

  if (departments.isSuccess && !department) {
    return <PageHeader title="Department not found" description="It may have been renamed." />;
  }

  return (
    <>
      <nav className="text-muted-foreground mb-2 text-sm">
        <Link to="/library" className="hover:underline">
          Process Library
        </Link>{' '}
        / {department?.name}
      </nav>
      <PageHeader
        title={department?.name ?? ''}
        description={department?.description ?? undefined}
        actions={
          processes.data?.length ? <DepartmentPackButton departmentSlug={departmentSlug} /> : null
        }
      />
      <ProcessFilters q={q} status={status} onChange={update} />
      {processes.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : processes.data?.length ? (
        <Card className="py-0">
          <CardContent className="px-2">
            <ProcessTable items={processes.data} />
          </CardContent>
        </Card>
      ) : (
        <EmptyProcesses filtered={!!(query.q || query.status)} />
      )}
    </>
  );
}
