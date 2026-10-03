import { useState } from 'react';
import { ArrowRight, Minus, Pencil, Plus } from 'lucide-react';
import type { ProcessDetail, VersionDiff } from '@process-ai/shared';
import { formatDate, humanize } from '@/lib/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompare, useHistory } from './queries';

const actionLabel: Record<string, string> = {
  summary_confirmed: 'Interview summary confirmed',
  correction: 'Correction',
  submitted: 'Submitted for validation',
  validated: 'Validated',
  approved: 'Approved',
  returned: 'Returned to draft',
  archived: 'Archived',
  reopened: 'New version started',
};

/** Lifecycle history of the version being viewed, and a step-by-step comparison with another version. */
export function VersionsPanel({
  process: p,
  versionId,
}: {
  process: ProcessDetail;
  versionId: string;
}) {
  const history = useHistory(versionId);
  const others = p.versions.filter((v) => v.id !== versionId);
  const current = p.versions.find((v) => v.id === versionId);
  const defaultOther =
    others.find((v) => current && v.versionNumber === current.versionNumber - 1) ?? others[0];
  const [compareWith, setCompareWith] = useState<string | undefined>(defaultOther?.id);
  const diff = useCompare(versionId, compareWith);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">History of v{current?.versionNumber}</CardTitle>
          <CardDescription>Who moved this version through its lifecycle, and why.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.isPending ? (
            <Skeleton className="h-20" />
          ) : !history.data?.length ? (
            <p className="text-muted-foreground text-sm">No lifecycle events yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l pl-4">
              {history.data.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="bg-foreground/60 absolute -left-[4.5px] mt-1.5 size-2 rounded-full" />
                  <div className="font-medium">{actionLabel[e.action] ?? humanize(e.action)}</div>
                  <div className="text-muted-foreground text-xs">
                    {e.actor.displayName} · {formatDate(e.createdAt)}
                  </div>
                  {e.comment && <p className="mt-1">{e.comment}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Compare
            {others.length > 0 && (
              <Select value={compareWith} onValueChange={(v) => v && setCompareWith(v)}>
                <SelectTrigger size="sm" className="h-7 w-auto" aria-label="Compare with">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {others.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      v{v.versionNumber} ({humanize(v.status)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ArrowRight className="size-4" /> v{current?.versionNumber}
          </CardTitle>
          <CardDescription>
            Steps are matched by their key (S1, S2…) across versions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!others.length ? (
            <p className="text-muted-foreground text-sm">This is the only version.</p>
          ) : diff.isPending ? (
            <Skeleton className="h-20" />
          ) : diff.data ? (
            <DiffView diff={diff.data} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

const icon = { added: Plus, removed: Minus, changed: Pencil } as const;
const tone = {
  added: 'text-emerald-700 dark:text-emerald-400',
  removed: 'text-red-700 dark:text-red-400',
  changed: 'text-amber-700 dark:text-amber-400',
} as const;

function DiffView({ diff }: { diff: VersionDiff }) {
  const empty =
    !diff.metadata.length && !diff.steps.length && !diff.connections.length && !diff.rules.length;
  if (empty) return <p className="text-muted-foreground text-sm">No differences.</p>;
  return (
    <div className="space-y-4 text-sm">
      {diff.metadata.length > 0 && (
        <Section title="Process details">
          {diff.metadata.map((m) => (
            <li key={m.field}>
              <span className="font-medium">{humanize(m.field)}:</span>{' '}
              <s className="text-muted-foreground">{m.before ?? '—'}</s> → {m.after ?? '—'}
            </li>
          ))}
        </Section>
      )}
      {diff.steps.length > 0 && (
        <Section title="Steps">
          {diff.steps.map((s) => {
            const Icon = icon[s.change];
            return (
              <li key={s.stepKey}>
                <span className={`inline-flex items-center gap-1 ${tone[s.change]}`}>
                  <Icon className="size-3.5" />
                  {s.stepKey} {s.name}
                </span>
                {s.fields.map((f) => (
                  <div key={f.field} className="text-muted-foreground ml-5 text-xs">
                    {f.field}: <s>{f.before ?? '—'}</s> →{' '}
                    <span className="text-foreground">{f.after ?? '—'}</span>
                  </div>
                ))}
              </li>
            );
          })}
        </Section>
      )}
      {diff.connections.length > 0 && (
        <Section title="Connections">
          {diff.connections.map((c, i) => {
            const Icon = icon[c.change];
            return (
              <li key={i} className={`flex items-center gap-1 ${tone[c.change]}`}>
                <Icon className="size-3.5 shrink-0" />
                {c.description}
              </li>
            );
          })}
        </Section>
      )}
      {diff.rules.length > 0 && (
        <Section title="Rules">
          {diff.rules.map((r, i) => {
            const Icon = icon[r.change];
            return (
              <li key={i} className={`flex items-start gap-1 ${tone[r.change]}`}>
                <Icon className="mt-0.5 size-3.5 shrink-0" />
                {r.statement}
              </li>
            );
          })}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
        {title}
      </h4>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}
