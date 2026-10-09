import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Network, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ProcessDetail, ProcessLink, VersionGraph } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProcesses } from '@/features/processes/queries';
import { useRefreshProcess } from '@/features/governance/queries';
import { useProcessLinks } from './queries';

const NONE = 'none';

/** Hand-offs with other processes (upstream and downstream), and the way into the end-to-end view. */
export function ConnectedProcesses({
  process: p,
  graph: g,
  canManage,
}: {
  process: ProcessDetail;
  graph: VersionGraph;
  canManage: boolean;
}) {
  const links = useProcessLinks(p.id);
  const refresh = useRefreshProcess();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = links.data ?? [];
  const upstream = list.filter((l) => l.to.id === p.id);
  const downstream = list.filter((l) => l.from.id === p.id);

  const call = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await Promise.all([refresh(), links.refetch()]);
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  if (!list.length && !canManage) return null;

  const row = (l: ProcessLink, dir: 'in' | 'out') => {
    const other = dir === 'in' ? l.from : l.to;
    return (
      <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm">
        {dir === 'in' ? (
          <ArrowLeft className="text-muted-foreground size-4" />
        ) : (
          <ArrowRight className="text-muted-foreground size-4" />
        )}
        <Link to={`/processes/${other.id}`} className="font-medium hover:underline">
          {other.name}
        </Link>
        {l.label && <span className="text-muted-foreground">· {l.label}</span>}
        {l.fromStepKey && <Badge variant="outline">from {l.fromStepKey}</Badge>}
        {l.provenance === 'inferred' && (
          <Badge
            variant="outline"
            className="border-violet-300 text-violet-700 dark:text-violet-300"
            title={l.reasoning ?? undefined}
          >
            AI suggested
          </Badge>
        )}
        <span className="flex-1" />
        {canManage && l.provenance === 'inferred' && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              call(() => api(`/process-links/${l.id}/confirm`, { method: 'POST' }), 'Confirmed')
            }
          >
            <Check />
            Confirm
          </Button>
        )}
        {canManage && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Remove link"
            disabled={busy}
            onClick={() =>
              call(() => api(`/process-links/${l.id}`, { method: 'DELETE' }), 'Removed')
            }
          >
            <Trash2 />
          </Button>
        )}
      </li>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="size-4" />
            Connected processes
          </CardTitle>
          <CardDescription>
            Where this process starts from and what it hands over to.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {list.length > 0 && (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/processes/${p.id}/flow`}>View end to end</Link>
            </Button>
          )}
          {canManage && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  call(async () => {
                    const found = await api<ProcessLink[]>(`/processes/${p.id}/links/suggest`, {
                      method: 'POST',
                    });
                    if (!found.length) toast.info('No clear hand-offs found.');
                  }, 'Suggestions added')
                }
              >
                <Sparkles />
                {busy ? 'Looking…' : 'Suggest hand-offs'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus />
                Add hand-off
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      {list.length > 0 && (
        <CardContent className="grid gap-3">
          {upstream.length > 0 && (
            <section>
              <h3 className="text-muted-foreground mb-1.5 text-xs font-medium uppercase">
                Starts from
              </h3>
              <ul className="grid gap-2">{upstream.map((l) => row(l, 'in'))}</ul>
            </section>
          )}
          {downstream.length > 0 && (
            <section>
              <h3 className="text-muted-foreground mb-1.5 text-xs font-medium uppercase">
                Hands over to
              </h3>
              <ul className="grid gap-2">{downstream.map((l) => row(l, 'out'))}</ul>
            </section>
          )}
        </CardContent>
      )}
      {adding && (
        <AddLinkDialog
          process={p}
          graph={g}
          onClose={() => setAdding(false)}
          onSaved={() => links.refetch()}
        />
      )}
    </Card>
  );
}

function AddLinkDialog({
  process: p,
  graph: g,
  onClose,
  onSaved,
}: {
  process: ProcessDetail;
  graph: VersionGraph;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const all = useProcesses({});
  const [to, setTo] = useState('');
  const [step, setStep] = useState(NONE);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/processes/${p.id}/links`, {
        method: 'POST',
        body: JSON.stringify({
          toProcessId: to,
          fromStepKey: step === NONE ? null : step,
          label: label.trim() || null,
        }),
      });
      await onSaved();
      toast.success('Hand-off added');
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not add');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a hand-off</DialogTitle>
          <DialogDescription>"{p.name}" hands over to another process.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="link-to">Hands over to</Label>
            <Select value={to} onValueChange={(v) => v && setTo(v)}>
              <SelectTrigger id="link-to" className="w-full">
                <SelectValue placeholder="Choose a process" />
              </SelectTrigger>
              <SelectContent>
                {all.data
                  ?.filter((x) => x.id !== p.id)
                  .map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name} · {x.department.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="link-step">From step (optional)</Label>
            <Select value={step} onValueChange={(v) => v && setStep(v)}>
              <SelectTrigger id="link-step" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>The end of the process</SelectItem>
                {g.steps
                  .filter((s) => s.type !== 'start')
                  .map((s) => (
                    <SelectItem key={s.id} value={s.stepKey}>
                      {s.stepKey} {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="link-label">What is handed over (optional)</Label>
            <Input
              id="link-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Active supplier"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!to || busy}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
