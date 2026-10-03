import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ProcessDetail, VersionGraph } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFindings } from '@/features/analysis/queries';
import { useRefreshProcess } from '@/features/governance/queries';

/** Owner picks opportunities and goals; the AI designs a To-Be as a new draft version. */
export function DesignToBeButton({
  process: p,
  graph: g,
}: {
  process: ProcessDetail;
  graph: VersionGraph;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Wand2 />
        Design To-Be
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          {open && <ToBeForm process={p} graph={g} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ToBeForm({
  process: p,
  graph: g,
  onDone,
}: {
  process: ProcessDetail;
  graph: VersionGraph;
  onDone: () => void;
}) {
  const findings = useFindings(g.id);
  const navigate = useNavigate();
  const refresh = useRefreshProcess();
  const candidates = (findings.data?.opportunities ?? []).filter((o) => o.status !== 'dismissed');
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const selected =
    picked ?? new Set(candidates.filter((o) => o.status === 'accepted').map((o) => o.id));
  const [goals, setGoals] = useState('');
  const [busy, setBusy] = useState(false);
  const stepName = new Map(g.steps.map((s) => [s.id, `${s.stepKey} · ${s.name}`]));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const design = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: string; applied: number; skipped: number }>(
        `/versions/${g.id}/to-be`,
        {
          method: 'POST',
          body: JSON.stringify({ opportunityIds: [...selected], goals: goals.trim() || undefined }),
        },
      );
      await refresh();
      onDone();
      navigate(`/processes/${p.id}?version=${r.id}`);
      toast.success(
        `To-Be designed with ${r.applied} change${r.applied === 1 ? '' : 's'} — review and confirm each one`,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Design failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Design the To-Be process</DialogTitle>
        <DialogDescription>
          The AI redesigns "{p.name}" to implement the opportunities you choose. It creates a
          separate To-Be draft — the documented As-Is stays as it is. Every change comes with a
          reason, and you confirm each one.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label>Opportunities to implement</Label>
        {findings.isPending ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !candidates.length ? (
          <p className="text-muted-foreground text-sm">
            No opportunities yet. Run the analysis on the Automation tab, or describe your goals
            below.
          </p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border p-2">
            {candidates.map((o) => (
              <li key={o.id}>
                <label className="hover:bg-muted flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(o.id)}
                    onChange={() => toggle(o.id)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{o.title}</span>
                    <span className="text-muted-foreground block text-xs">
                      {o.kind === 'ai' ? 'AI' : humanize(o.kind)} · {humanize(o.impact)} impact ·{' '}
                      {humanize(o.effort)} effort
                      {o.status === 'accepted' && ' · accepted'}
                      {o.stepId && stepName.has(o.stepId) && ` · ${stepName.get(o.stepId)}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="to-be-goals">Goals and constraints (optional)</Label>
        <Textarea
          id="to-be-goals"
          rows={3}
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          placeholder="e.g. Cut onboarding time to 5 days. Keep the bank call-back control and sanctions screening."
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={design} disabled={busy || (!selected.size && !goals.trim())}>
          {busy ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {busy ? 'Designing… (up to a minute)' : 'Design To-Be'}
        </Button>
      </DialogFooter>
    </div>
  );
}
