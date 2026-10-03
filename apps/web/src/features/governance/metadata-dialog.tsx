import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { VersionGraph, VersionMetaPatch } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useRefreshProcess } from './queries';

const FIELDS: { key: keyof VersionMetaPatch; label: string; long?: boolean }[] = [
  { key: 'description', label: 'Description', long: true },
  { key: 'purpose', label: 'Purpose', long: true },
  { key: 'trigger', label: 'Trigger', long: true },
  { key: 'endCondition', label: 'End condition', long: true },
  { key: 'ownerRole', label: 'Owner (role or team)' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'volume', label: 'Volume' },
];

export function MetadataDialog({
  graph,
  open,
  onOpenChange,
}: {
  graph: VersionGraph;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open && <MetadataForm graph={graph} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function MetadataForm({ graph, onDone }: { graph: VersionGraph; onDone: () => void }) {
  const refresh = useRefreshProcess();
  const [values, setValues] = useState(
    () =>
      Object.fromEntries(FIELDS.map((f) => [f.key, graph[f.key] ?? ''])) as Record<string, string>,
  );
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const changed = Object.fromEntries(
      FIELDS.filter((f) => (graph[f.key] ?? '') !== values[f.key]).map((f) => [
        f.key,
        values[f.key]!.trim() || null,
      ]),
    );
    if (!Object.keys(changed).length) return onDone();
    setBusy(true);
    try {
      await api(`/versions/${graph.id}`, { method: 'PATCH', body: JSON.stringify(changed) });
      await refresh();
      toast.success('Process details updated');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.problem.title : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Process details</DialogTitle>
      </DialogHeader>
      <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={`meta-${f.key}`}>{f.label}</Label>
            {f.long ? (
              <Textarea
                id={`meta-${f.key}`}
                rows={2}
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            ) : (
              <Input
                id={`meta-${f.key}`}
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}
