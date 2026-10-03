import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Check,
  Lightbulb,
  ListChecks,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  issueCategories,
  type AnalyseResult,
  type FindingSource,
  type FindingStatus,
  type Findings,
  type Issue,
  type IssueInput,
  type Level,
  type Opportunity,
  type VersionGraph,
} from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, humanize } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const sourceMeta: Record<FindingSource, { label: string; icon: typeof Bot }> = {
  user: { label: 'From employees', icon: User },
  heuristic: { label: 'Rule check', icon: ListChecks },
  ai: { label: 'AI suggestion', icon: Sparkles },
  manual: { label: 'Added by owner', icon: User },
};

const levelTone: Record<Level, string> = {
  high: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  medium: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  low: 'bg-muted text-muted-foreground',
};

function useDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      id,
      status,
    }: {
      kind: 'issues' | 'opportunities';
      id: string;
      status: FindingStatus;
    }) => api(`/${kind}/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.problem.title : 'Could not update'),
  });
}

/** Run rule checks, optionally with AI analysis. */
export function AnalyseBar({ versionId, findings }: { versionId: string; findings: Findings }) {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: (ai: boolean) =>
      api<AnalyseResult>(`/versions/${versionId}/analyse`, {
        method: 'POST',
        body: JSON.stringify({ ai }),
      }),
    onSuccess: async (r, ai) => {
      qc.setQueryData(['findings', versionId], r);
      if (r.aiError) toast.error(r.aiError);
      else toast.success(ai ? 'Analysis complete' : 'Rule checks complete');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.problem.title : 'Analysis failed'),
  });
  if (!findings.canManage) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-muted-foreground mr-auto text-sm">
        Recommendations only — they never change the documented process. Accept what's worth acting
        on.
      </span>
      <Button variant="outline" onClick={() => run.mutate(false)} disabled={run.isPending}>
        {run.isPending && run.variables === false ? (
          <Loader2 className="animate-spin" />
        ) : (
          <ListChecks />
        )}
        Run rule checks
      </Button>
      {findings.aiAvailable && (
        <Button onClick={() => run.mutate(true)} disabled={run.isPending}>
          {run.isPending && run.variables === true ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Sparkles />
          )}
          {run.isPending && run.variables === true ? 'Analysing…' : 'Analyse with AI'}
        </Button>
      )}
    </div>
  );
}

export function IssuesTab({
  graph,
  findings,
  onSelectStep,
}: {
  graph: VersionGraph;
  findings: Findings | undefined;
  onSelectStep: (id: string) => void;
}) {
  if (!findings) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <AnalyseBar versionId={graph.id} findings={findings} />
      {findings.canManage && (
        <div className="flex justify-end">
          <AddIssueDialog graph={graph} />
        </div>
      )}
      <FindingList
        kind="issues"
        items={findings.issues}
        canManage={findings.canManage}
        graph={graph}
        onSelectStep={onSelectStep}
        empty={{
          icon: <TriangleAlert />,
          title: 'No issues recorded',
          text: 'Run the rule checks or the AI analysis to look for problems in this process.',
        }}
        render={(i: Issue) => (
          <>
            <Badge variant="secondary" className={levelTone[i.severity]}>
              {humanize(i.severity)}
            </Badge>
            <Badge variant="outline">{humanize(i.category)}</Badge>
          </>
        )}
      />
    </div>
  );
}

export function OpportunitiesTab({
  graph,
  findings,
  onSelectStep,
}: {
  graph: VersionGraph;
  findings: Findings | undefined;
  onSelectStep: (id: string) => void;
}) {
  if (!findings) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-4">
      <AnalyseBar versionId={graph.id} findings={findings} />
      <FindingList
        kind="opportunities"
        items={findings.opportunities}
        canManage={findings.canManage}
        graph={graph}
        onSelectStep={onSelectStep}
        empty={{
          icon: <Lightbulb />,
          title: 'No opportunities yet',
          text: 'Run the analysis to find automation and AI opportunities.',
        }}
        render={(o: Opportunity) => (
          <>
            <Badge variant="outline">
              {o.kind === 'ai' ? 'AI' : o.kind === 'rpa' ? 'RPA' : humanize(o.kind)}
            </Badge>
            <Badge variant="secondary" className={levelTone[o.impact]}>
              {humanize(o.impact)} impact
            </Badge>
            <Badge variant="secondary">{humanize(o.effort)} effort</Badge>
            {o.impact === 'high' && o.effort === 'low' && (
              <Badge className="bg-emerald-600 text-white">Quick win</Badge>
            )}
          </>
        )}
        extra={(o: Opportunity) =>
          o.expectedBenefit && (
            <p className="text-muted-foreground text-xs">Benefit: {o.expectedBenefit}</p>
          )
        }
      />
    </div>
  );
}

function FindingList<T extends Issue | Opportunity>(props: {
  kind: 'issues' | 'opportunities';
  items: T[];
  canManage: boolean;
  graph: VersionGraph;
  onSelectStep: (id: string) => void;
  empty: { icon: ReactNode; title: string; text: string };
  render: (item: T) => ReactNode;
  extra?: (item: T) => ReactNode;
}) {
  const decide = useDecide();
  const [showDismissed, setShowDismissed] = useState(false);
  const stepName = new Map(props.graph.steps.map((s) => [s.id, `${s.stepKey} · ${s.name}`]));
  const visible = props.items.filter((i) => showDismissed || i.status !== 'dismissed');
  const dismissed = props.items.length - props.items.filter((i) => i.status !== 'dismissed').length;

  if (!props.items.length) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">{props.empty.icon}</EmptyMedia>
          <EmptyTitle>{props.empty.title}</EmptyTitle>
          <EmptyDescription>{props.empty.text}</EmptyDescription>
        </EmptyHeader>
        {!props.canManage && (
          <EmptyContent className="text-muted-foreground text-xs">
            The process owner can run the analysis.
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {visible.map((item) => {
        const src = sourceMeta[item.source];
        return (
          <Card
            key={item.id}
            className={cn(
              'gap-2 py-4',
              item.status === 'dismissed' && 'opacity-60',
              item.status === 'accepted' && 'border-emerald-300 dark:border-emerald-900',
            )}
          >
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {props.render(item)}
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <src.icon className="size-3" />
                  {src.label}
                </span>
                <span className="ml-auto text-xs">
                  {item.status === 'accepted' && (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Accepted{item.decidedBy && ` by ${item.decidedBy.displayName}`}
                    </span>
                  )}
                  {item.status === 'dismissed' && (
                    <span className="text-muted-foreground">
                      Dismissed{item.decidedAt && ` ${formatDate(item.decidedAt)}`}
                    </span>
                  )}
                </span>
              </div>
              <div className="font-medium">{item.title}</div>
              <p className="text-muted-foreground text-sm">{item.description}</p>
              {props.extra?.(item)}
              <div className="flex flex-wrap items-center gap-2">
                {item.stepId && stepName.has(item.stepId) && (
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => props.onSelectStep(item.stepId!)}
                  >
                    {stepName.get(item.stepId)}
                  </button>
                )}
                {props.canManage && (
                  <div className="ml-auto flex gap-1">
                    {item.status !== 'accepted' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          decide.mutate({ kind: props.kind, id: item.id, status: 'accepted' })
                        }
                      >
                        <Check />
                        Accept
                      </Button>
                    )}
                    {item.status !== 'dismissed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          decide.mutate({ kind: props.kind, id: item.id, status: 'dismissed' })
                        }
                      >
                        <X />
                        Dismiss
                      </Button>
                    )}
                    {item.status !== 'proposed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          decide.mutate({ kind: props.kind, id: item.id, status: 'proposed' })
                        }
                        aria-label="Undo decision"
                      >
                        <RotateCcw />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {dismissed > 0 && (
        <Button variant="link" size="sm" onClick={() => setShowDismissed((s) => !s)}>
          {showDismissed ? 'Hide' : 'Show'} {dismissed} dismissed
        </Button>
      )}
    </div>
  );
}

function AddIssueDialog({ graph }: { graph: VersionGraph }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<IssueInput>({
    stepId: null,
    category: 'other',
    severity: 'medium',
    title: '',
    description: '',
  });
  const add = useMutation({
    mutationFn: () =>
      api(`/versions/${graph.id}/issues`, { method: 'POST', body: JSON.stringify(f) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['findings'] });
      toast.success('Issue added');
      setOpen(false);
      setF({ stepId: null, category: 'other', severity: 'medium', title: '', description: '' });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not add the issue'),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Plus />
          Add an issue
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an issue</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="issue-title">Title</Label>
            <Input
              id="issue-title"
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="issue-desc">Description</Label>
            <Textarea
              id="issue-desc"
              rows={3}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="issue-cat">Category</Label>
              <Select
                value={f.category}
                onValueChange={(v) => v && setF({ ...f, category: v as IssueInput['category'] })}
              >
                <SelectTrigger id="issue-cat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {issueCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {humanize(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="issue-sev">Severity</Label>
              <Select
                value={f.severity}
                onValueChange={(v) => v && setF({ ...f, severity: v as Level })}
              >
                <SelectTrigger id="issue-sev" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['high', 'medium', 'low'] as const).map((l) => (
                    <SelectItem key={l} value={l}>
                      {humanize(l)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="issue-step">Step</Label>
            <Select
              value={f.stepId ?? 'process'}
              onValueChange={(v) => v && setF({ ...f, stepId: v === 'process' ? null : v })}
            >
              <SelectTrigger id="issue-step" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="process">Whole process</SelectItem>
                {graph.steps.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.stepKey} · {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => add.mutate()}
            disabled={add.isPending || f.title.trim().length < 3 || f.description.trim().length < 3}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
