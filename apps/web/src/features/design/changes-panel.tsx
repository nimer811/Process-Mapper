import { Link2, Minus, Pencil, Plus, ScrollText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { DesignChange, DesignDetail, VersionGraph } from '@process-ai/shared';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useVersionGraph } from '@/features/processes/queries';
import { ProcessMap } from '@/features/process-map/process-map';
import type { Highlight } from '@/features/process-map/layout';

export function useDesign(versionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['design', versionId],
    queryFn: () => api<DesignDetail>(`/versions/${versionId}/design`),
    enabled,
  });
}

const changeMeta: Record<
  DesignChange['changeType'],
  { icon: typeof Plus; label: string; tone: string }
> = {
  added: { icon: Plus, label: 'Added', tone: 'text-emerald-700 dark:text-emerald-400' },
  removed: { icon: Minus, label: 'Removed', tone: 'text-red-700 dark:text-red-400' },
  modified: { icon: Pencil, label: 'Changed', tone: 'text-amber-700 dark:text-amber-400' },
  reconnected: { icon: Link2, label: 'Flow', tone: 'text-sky-700 dark:text-sky-400' },
  rule_added: {
    icon: ScrollText,
    label: 'Rule added',
    tone: 'text-emerald-700 dark:text-emerald-400',
  },
  rule_removed: { icon: ScrollText, label: 'Rule removed', tone: 'text-red-700 dark:text-red-400' },
};

/** Highlights per step id for one side of the comparison. */
function highlights(
  graph: VersionGraph | undefined,
  changes: DesignChange[],
  side: 'as_is' | 'to_be',
) {
  const byKey = new Map((graph?.steps ?? []).map((s) => [s.stepKey, s.id]));
  const out: Record<string, Highlight> = {};
  for (const c of changes) {
    const id = c.stepKey ? byKey.get(c.stepKey) : undefined;
    if (!id) continue;
    if (c.changeType === 'modified') out[id] = 'modified';
    if (c.changeType === 'added' && side === 'to_be') out[id] = 'added';
    if (c.changeType === 'removed' && side === 'as_is') out[id] = 'removed';
  }
  return out;
}

/** First changed step in flow order, so the map opens where the changes are. */
function firstHighlighted(graph: VersionGraph, marks: Record<string, Highlight>) {
  return [...graph.steps]
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .find((s) => marks[s.id])?.id;
}

/** To-Be review: summary, every change with its reason, and both maps with changed steps highlighted. */
export function ChangesPanel({
  graph: toBe,
  onSelectStep,
}: {
  graph: VersionGraph;
  onSelectStep: (id: string | null) => void;
}) {
  const design = useDesign(toBe.id, toBe.kind === 'to_be');
  const asIs = useVersionGraph(design.data?.basedOn?.id);
  if (!design.data) return <Skeleton className="h-60" />;
  const d = design.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Design summary</CardTitle>
            {d.goals && <CardDescription>Goals: {d.goals}</CardDescription>}
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {d.summary ?? 'No summary.'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What changed and why ({d.changes.length})</CardTitle>
            <CardDescription>
              AI-designed steps are marked "AI inferred" until you confirm them in Review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {d.changes.map((c) => {
                const m = changeMeta[c.changeType];
                return (
                  <li key={c.id} className="text-sm">
                    <div className={`flex items-start gap-1.5 font-medium ${m.tone}`}>
                      <m.icon className="mt-0.5 size-3.5 shrink-0" />
                      {c.description}
                    </div>
                    <p className="text-muted-foreground ml-5">{c.rationale}</p>
                    {c.opportunity && (
                      <Badge variant="outline" className="mt-1 ml-5">
                        Implements: {c.opportunity.title}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      <MapCard
        title={`As-Is${d.basedOn ? ` (v${d.basedOn.versionNumber})` : ''}`}
        legend="Removed and changed steps highlighted"
      >
        {asIs.data ? (
          <ProcessMap
            graph={asIs.data}
            selectedStepId={null}
            onSelectStep={() => {}}
            highlights={highlights(asIs.data, d.changes, 'as_is')}
            focusStepId={firstHighlighted(asIs.data, highlights(asIs.data, d.changes, 'as_is'))}
          />
        ) : (
          <Skeleton className="h-full" />
        )}
      </MapCard>
      <MapCard
        title={`To-Be (v${toBe.versionNumber})`}
        legend="Added and changed steps highlighted · click a step for details"
      >
        <ProcessMap
          graph={toBe}
          selectedStepId={null}
          onSelectStep={onSelectStep}
          highlights={highlights(toBe, d.changes, 'to_be')}
          focusStepId={firstHighlighted(toBe, highlights(toBe, d.changes, 'to_be'))}
        />
      </MapCard>
    </div>
  );
}

function MapCard({
  title,
  legend,
  children,
}: {
  title: string;
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-emerald-500" /> Added
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-amber-500" /> Changed
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-red-500" /> Removed
          </span>
          · {legend}
        </span>
      </div>
      <div className="h-[45vh] min-h-[360px]">{children}</div>
    </Card>
  );
}
