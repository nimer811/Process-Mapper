import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { ProcessDetail } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRefreshProcess } from '@/features/governance/queries';
import { flattenTree, useCategories } from './queries';

const NONE = 'none';

/** The process's place in the classification (APQC-style), changeable by its owner or an admin. */
export function ClassificationPicker({
  process: p,
  canManage,
}: {
  process: ProcessDetail;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = p.category ? (
    <Badge variant="outline" className="font-normal" title={p.category.name}>
      {p.category.code} · <span className="max-w-40 truncate">{p.category.name}</span>
    </Badge>
  ) : (
    <span className="text-muted-foreground">Not classified</span>
  );
  if (!canManage) return label;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hover:opacity-80"
        aria-label="Change process level"
      >
        {label}
      </button>
      {open && <ClassifyDialog process={p} onClose={() => setOpen(false)} />}
    </>
  );
}

function ClassifyDialog({ process: p, onClose }: { process: ProcessDetail; onClose: () => void }) {
  const categories = useCategories();
  const refresh = useRefreshProcess();
  const [value, setValue] = useState(p.category?.id ?? NONE);
  const [busy, setBusy] = useState<'save' | 'suggest' | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const tree = flattenTree(categories.data ?? []);

  const suggest = async () => {
    setBusy('suggest');
    try {
      const s = await api<{ category: { id: string } | null; reasoning: string }>(
        `/processes/${p.id}/category/suggest`,
        { method: 'POST' },
      );
      if (s.category) setValue(s.category.id);
      setReason(s.reasoning);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'No suggestion');
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    setBusy('save');
    try {
      await api(`/processes/${p.id}/category`, {
        method: 'PUT',
        body: JSON.stringify({ categoryId: value === NONE ? null : value }),
      });
      await refresh();
      toast.success('Process level updated');
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Where does this process sit?</DialogTitle>
          <DialogDescription>
            Place it in the process classification (APQC-based) so the library, coverage and
            end-to-end views can group it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={value} onValueChange={(v) => v && setValue(v)}>
            <SelectTrigger className="w-full" aria-label="Process level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not classified</SelectItem>
              {tree.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span style={{ paddingLeft: c.depth * 12 }}>
                    {c.code} {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="w-fit" onClick={suggest} disabled={!!busy}>
            <Sparkles />
            {busy === 'suggest' ? 'Thinking…' : 'Suggest with AI'}
          </Button>
          {reason && <p className="text-muted-foreground text-sm">{reason}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!!busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
