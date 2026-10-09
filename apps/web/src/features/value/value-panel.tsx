import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { FigureSource, ValueView, VersionGraph } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { humanize } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const MIN_PER_DAY = 480;
/** Working time: "45 min", "2.5 h", "3 d". */
export function formatMinutes(min: number | null) {
  if (min === null) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  if (min < MIN_PER_DAY) return `${Math.round((min / 60) * 10) / 10} h`;
  return `${Math.round((min / MIN_PER_DAY) * 10) / 10} d`;
}

const SOURCE: Record<FigureSource, { label: string; className: string }> = {
  owner: { label: 'Owner', className: '' },
  stated: { label: 'From interview', className: 'text-muted-foreground' },
  ai: { label: 'AI estimate', className: 'border-violet-300 text-violet-700 dark:text-violet-300' },
};

function SourceBadge({ source }: { source: FigureSource | null }) {
  if (!source) return null;
  return (
    <Badge
      variant="outline"
      className={cn('ml-1.5 px-1.5 py-0 text-[10px] font-normal', SOURCE[source].className)}
    >
      {SOURCE[source].label}
    </Badge>
  );
}

/**
 * Timings and value: cycle time, hands-on time, waiting, effort per month, and automation
 * opportunities ranked by the hours they could save. Estimates never change the documented map.
 */
export function ValuePanel({ graph: g }: { graph: VersionGraph }) {
  const qc = useQueryClient();
  const value = useQuery({
    queryKey: ['value', g.id, g.updatedAt],
    queryFn: () => api<ValueView>(`/versions/${g.id}/value`),
  });
  const [busy, setBusy] = useState(false);
  const set = (data: ValueView) => qc.setQueryData(['value', g.id, g.updatedAt], data);

  const call = async (fn: () => Promise<ValueView>, ok?: string) => {
    setBusy(true);
    try {
      set(await fn());
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  const figure = (body: object) =>
    call(() =>
      api<ValueView>(`/versions/${g.id}/value/figures`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    );

  if (value.isPending) return <Skeleton className="h-48" />;
  if (!value.data) return null;
  const v = value.data;
  const canEdit = v.canEdit;
  const missing = Math.round((1 - Math.min(v.completeness.duration, v.completeness.effort)) * 100);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Cycle time (main path)" value={formatMinutes(v.cycleMinutes)} />
        <Kpi label="Hands-on time" value={formatMinutes(v.touchMinutes)} />
        <Kpi
          label="Time spent waiting"
          value={v.waitShare === null ? '—' : `${Math.round(v.waitShare * 100)}%`}
        />
        <Kpi
          label="Cases per month"
          value={v.volumePerMonth.value === null ? '—' : String(v.volumePerMonth.value)}
          source={v.volumePerMonth.source}
          edit={canEdit ? (n) => figure({ stepId: null, volumePerMonth: n }) : undefined}
        />
        <Kpi
          label="Effort per month"
          value={v.effortHoursPerMonth === null ? '—' : `${v.effortHoursPerMonth} h`}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Step timings</CardTitle>
            <CardDescription>
              Elapsed time known for {Math.round(v.completeness.duration * 100)}% of steps, hands-on
              time for {Math.round(v.completeness.effort * 100)}%. Steps marked ● are on the main
              path.
              {canEdit && ' Type a number of minutes to set your own figure.'}
            </CardDescription>
          </div>
          {v.canEstimate && missing > 0 && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                call(
                  () => api<ValueView>(`/versions/${g.id}/value/estimate`, { method: 'POST' }),
                  'Estimates added — check and correct them',
                )
              }
            >
              <Sparkles />
              {busy ? 'Estimating…' : 'Estimate missing with AI'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Step</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Elapsed</TableHead>
                <TableHead>Hands-on</TableHead>
                <TableHead>Waiting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {v.steps.map((s) => (
                <TableRow key={s.stepId}>
                  <TableCell className="whitespace-normal">
                    <span
                      className={cn('mr-1', s.onMainPath ? 'text-sky-600' : 'text-transparent')}
                    >
                      ●
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">{s.stepKey}</span>{' '}
                    {s.name}
                  </TableCell>
                  <TableCell className="text-xs">{s.actor ?? '—'}</TableCell>
                  <TableCell>
                    <MinutesCell
                      figure={s.duration}
                      edit={
                        canEdit
                          ? (n) => figure({ stepId: s.stepId, durationMinutes: n })
                          : undefined
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <MinutesCell
                      figure={s.effort}
                      edit={
                        canEdit ? (n) => figure({ stepId: s.stepId, effortMinutes: n }) : undefined
                      }
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {s.duration.value !== null && s.effort.value !== null
                      ? formatMinutes(Math.max(0, s.duration.value - s.effort.value))
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opportunities by value</CardTitle>
          <CardDescription>
            Estimated hands-on hours each could save per month. Find them on the Automation tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {v.opportunities.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No opportunities yet. Run the analysis on the Automation tab.
            </p>
          ) : (
            v.opportunities.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2.5 text-sm"
              >
                <span className="w-24 shrink-0 text-right font-semibold tabular-nums">
                  {o.hoursSavedPerMonth === null ? '—' : `≈ ${o.hoursSavedPerMonth} h`}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {o.title}
                    {o.stepKey && (
                      <span className="text-muted-foreground ml-1.5 font-mono text-xs">
                        {o.stepKey}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">{o.assumption}</div>
                </div>
                <Badge variant="secondary">{humanize(o.kind)}</Badge>
                {o.status === 'accepted' && <Badge variant="outline">Accepted</Badge>}
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <ul className="text-muted-foreground list-disc space-y-0.5 pl-5 text-xs">
        {v.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  );
}

function Kpi({
  label,
  value,
  source,
  edit,
}: {
  label: string;
  value: string;
  source?: FigureSource | null;
  edit?: (n: number | null) => void;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-muted-foreground text-xs">
        {label}
        <SourceBadge source={source ?? null} />
      </div>
      {edit ? (
        <NumberInput
          initial={value === '—' ? '' : value}
          onCommit={edit}
          className="mt-1 h-8 text-lg font-semibold"
        />
      ) : (
        <div className="text-xl font-semibold">{value}</div>
      )}
    </div>
  );
}

function MinutesCell({
  figure,
  edit,
}: {
  figure: { value: number | null; source: FigureSource | null };
  edit?: (n: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      {edit ? (
        <NumberInput
          initial={figure.value === null ? '' : String(figure.value)}
          onCommit={edit}
          className="h-7 w-20 text-xs"
          title={figure.value === null ? 'Minutes' : formatMinutes(figure.value)}
        />
      ) : (
        <span className="text-xs">{formatMinutes(figure.value)}</span>
      )}
      {edit && figure.value !== null && (
        <span className="text-muted-foreground text-xs">{formatMinutes(figure.value)}</span>
      )}
      <SourceBadge source={figure.source} />
    </div>
  );
}

/** Saves on Enter or blur; empty clears the owner's figure. */
function NumberInput({
  initial,
  onCommit,
  className,
  title,
}: {
  initial: string;
  onCommit: (n: number | null) => void;
  className?: string;
  title?: string;
}) {
  const [text, setText] = useState(initial);
  const [base, setBase] = useState(initial);
  if (initial !== base) {
    setBase(initial);
    setText(initial);
  }
  const commit = () => {
    if (text === initial) return;
    const n = text.trim() === '' ? null : Number(text);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return setText(initial);
    onCommit(n);
  };
  return (
    <Input
      inputMode="decimal"
      value={text}
      title={title}
      aria-label={title ?? 'Value'}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      className={className}
    />
  );
}
