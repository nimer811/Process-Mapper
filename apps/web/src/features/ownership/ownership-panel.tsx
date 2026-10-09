import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Crown, ShieldAlert } from 'lucide-react';
import type { DesignCheck, OwnershipView, VersionGraph } from '@process-ai/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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

const KIND: Record<DesignCheck['kind'], string> = {
  segregation_of_duties: 'Segregation of duties',
  delegation_of_authority: 'Delegation of authority',
  control_gap: 'Control gap',
  ownership: 'Ownership',
};

const SEVERITY: Record<DesignCheck['severity'], string> = {
  high: 'border-red-300 text-red-700 dark:border-red-900 dark:text-red-300',
  medium: 'border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  low: 'text-muted-foreground',
};

/**
 * Who owns the process and each step (RACI), and the automatic checks: segregation of duties,
 * delegation of authority, control gaps and ownership. The checks are rules in code, not AI.
 */
export function OwnershipPanel({ graph: g }: { graph: VersionGraph }) {
  const view = useQuery({
    queryKey: ['ownership', g.id, g.updatedAt],
    queryFn: () => api<OwnershipView>(`/versions/${g.id}/ownership`),
  });
  if (view.isPending) return <Skeleton className="h-48" />;
  if (!view.data) return null;
  const { processOwnerRole, raci, checks } = view.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="size-4 text-amber-600" />
            Process owner:{' '}
            {processOwnerRole ?? <span className="text-muted-foreground font-normal">not set</span>}
          </CardTitle>
          <CardDescription>
            The one role accountable for this process. Edit it in the process details;
            {g.kind === 'to_be'
              ? ' this To-Be design proposed it.'
              : ' a To-Be design can propose a new one.'}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4" />
            Checks
            {checks.length > 0 && (
              <span className="text-muted-foreground font-normal">({checks.length})</span>
            )}
          </CardTitle>
          <CardDescription>
            Run automatically on every version from the map, its controls and the best-practice
            library. Fix them by editing steps, owners or controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {checks.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-4" />
              No segregation-of-duties, authority, control or ownership issues found.
            </p>
          ) : (
            checks.map((c, i) => (
              <div key={i} className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn('capitalize', SEVERITY[c.severity])}>
                    {c.severity}
                  </Badge>
                  <Badge variant="secondary">{KIND[c.kind]}</Badge>
                  <span className="font-medium">{c.title}</span>
                </div>
                <p className="text-muted-foreground">{c.detail}</p>
                <p className="mt-1">
                  <span className="font-medium">Recommendation: </span>
                  {c.recommendation}
                </p>
                {c.practice && (
                  <p className="text-muted-foreground mt-1 text-xs">Best practice: {c.practice}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardContent className="px-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Step</TableHead>
                <TableHead>Responsible</TableHead>
                <TableHead>Accountable</TableHead>
                <TableHead>Consulted</TableHead>
                <TableHead>Informed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {raci.map((r) => (
                <TableRow key={r.stepId}>
                  <TableCell className="whitespace-normal">
                    <span className="text-muted-foreground font-mono text-xs">{r.stepKey}</span>{' '}
                    {r.name}
                  </TableCell>
                  <TableCell>{r.responsible ?? <Missing />}</TableCell>
                  <TableCell>{r.accountable ?? <Missing />}</TableCell>
                  <TableCell className="whitespace-normal">
                    {r.consulted.join(', ') || '—'}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {r.informed.join(', ') || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Missing() {
  return <span className="text-muted-foreground/70 italic">Not set</span>;
}
