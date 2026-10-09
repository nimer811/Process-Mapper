import { Link } from 'react-router';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/features/processes/badges';
import { useCoverage } from './queries';

/** How much of the department's expected process landscape is documented, by process level. */
export function CoverageDashboard({ departmentSlug }: { departmentSlug: string }) {
  const c = useCoverage(departmentSlug);
  if (c.isPending) return <Skeleton className="h-40" />;
  if (!c.data || (!c.data.areas.length && !c.data.unclassified.length)) return null;
  const t = c.data.totals;
  const pct = t.expected ? Math.round((t.mapped / t.expected) * 100) : 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Coverage</CardTitle>
        <CardDescription>
          The processes this department is expected to document (from its part of the process
          classification), and how far each has got.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Expected" value={t.expected} />
          <Stat label="Mapped" value={`${t.mapped} (${pct}%)`} />
          <Stat label="Validated" value={t.validated} />
          <Stat label="Approved" value={t.approved} />
          <Stat label="SOP published" value={t.sopPublished} />
          <Stat label="Review overdue" value={t.reviewOverdue} warn={t.reviewOverdue > 0} />
        </div>
        {c.data.areas.map((a) => (
          <section key={a.group.id}>
            <h3 className="mb-2 text-sm font-semibold">
              {a.group.code} {a.group.name}
            </h3>
            <div className="grid gap-2">
              {a.items.map((i) => (
                <div
                  key={i.category.id}
                  className="flex flex-wrap items-start gap-x-4 gap-y-1 rounded-md border p-2.5 text-sm"
                >
                  <div className="w-full min-w-0 sm:w-72">
                    <span className="text-muted-foreground font-mono text-xs">
                      {i.category.code}
                    </span>{' '}
                    {i.category.name}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                    {i.processes.length ? (
                      i.processes.map((p) => (
                        <Link
                          key={p.id}
                          to={`/processes/${p.id}`}
                          className="hover:bg-muted flex items-center gap-1.5 rounded-md border px-2 py-0.5"
                        >
                          {p.name}
                          <StatusBadge status={p.status} />
                          {p.sopPublished && (
                            <span className="text-xs text-emerald-700 dark:text-emerald-400">
                              SOP
                            </span>
                          )}
                          {p.reviewOverdue && (
                            <CircleAlert
                              className="size-3.5 text-amber-600"
                              aria-label="Review overdue"
                            />
                          )}
                        </Link>
                      ))
                    ) : (
                      <span className="text-muted-foreground italic">Not mapped yet</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {c.data.unclassified.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Not classified yet</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {c.data.unclassified.map((p) => (
                <Link
                  key={p.id}
                  to={`/processes/${p.id}`}
                  className="hover:bg-muted flex items-center gap-1.5 rounded-md border px-2 py-0.5"
                >
                  {p.name}
                  <StatusBadge status={p.status} />
                </Link>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={cn('text-xl font-semibold', warn && 'text-amber-600')}>{value}</div>
    </div>
  );
}
