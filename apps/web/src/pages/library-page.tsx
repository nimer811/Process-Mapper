import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDepartments, useProcesses } from '@/features/processes/queries';
import { ProcessTable } from '@/features/processes/process-table';
import { ProcessFilters } from '@/features/processes/process-filters';
import { EmptyProcesses } from '@/features/processes/empty-processes';
import { useListParams } from '@/features/processes/use-list-params';
import { DepartmentPackButton } from '@/features/processes/download-actions';

export function LibraryPage() {
  const { q, status, query, update } = useListParams();
  const departments = useDepartments();
  const processes = useProcesses(query);
  const filtered = !!(query.q || query.status);

  const groups = (departments.data ?? [])
    .map((d) => ({ department: d, items: (processes.data ?? []).filter((p) => p.department.id === d.id) }))
    .filter((g) => g.items.length > 0 || (!filtered && g.department.processCount > 0));

  return (
    <>
      <PageHeader title="Process Library" description="Browse documented processes by department." />
      <ProcessFilters q={q} status={status} onChange={update} />

      {processes.isPending || departments.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : groups.length === 0 ? (
        <EmptyProcesses filtered={filtered} />
      ) : (
        <div className="space-y-6">
          {groups.map(({ department, items }) => (
            <Card key={department.id} className="gap-0 py-0">
              <CardHeader className="border-b py-3">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <Link to={`/library/${department.slug}`} className="hover:underline">
                    {department.name}
                  </Link>
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/library/${department.slug}`}
                      className="text-muted-foreground flex items-center text-xs font-normal hover:underline"
                    >
                      {items.length} {items.length === 1 ? 'process' : 'processes'}
                      <ChevronRight className="size-3.5" />
                    </Link>
                    <DepartmentPackButton departmentSlug={department.slug} size="sm" />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2">
                <ProcessTable items={items} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
