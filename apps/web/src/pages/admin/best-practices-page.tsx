import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { practiceCategories, type BestPractice, type BestPracticeInput } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { humanize } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

/**
 * The organisation's best-practice library: the To-Be designer cites it, and the ownership checks
 * link findings to it. Practices with keywords only apply to processes that mention them.
 */
export function BestPracticesPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['best-practices'],
    queryFn: () => api<BestPractice[]>('/best-practices'),
  });
  const [editing, setEditing] = useState<BestPractice | 'new' | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['best-practices'] });

  const call = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await refresh();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Action failed');
    }
  };

  return (
    <>
      <PageHeader
        title="Best practices"
        description="Good practices the AI applies when designing To-Be processes, and that the ownership checks refer to."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            Add practice
          </Button>
        }
      />
      {list.isPending ? (
        <Skeleton className="h-48" />
      ) : (
        <Card className="py-0">
          <CardContent className="px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Practice</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Applies when the process mentions</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data?.map((p) => (
                  <TableRow key={p.id} className={p.isActive ? '' : 'opacity-60'}>
                    <TableCell className="max-w-xl whitespace-normal">
                      <div className="font-medium">{p.title}</div>
                      <div className="text-muted-foreground text-xs">{p.statement}</div>
                      {p.source && (
                        <div className="text-muted-foreground mt-0.5 text-xs italic">
                          Source: {p.source}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{humanize(p.category)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-48 text-xs whitespace-normal">
                      {p.keywords.length ? p.keywords.join(', ') : 'Every process'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={p.isActive}
                        aria-label="Active"
                        onCheckedChange={(v) =>
                          call(
                            () =>
                              api(`/best-practices/${p.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ isActive: v }),
                              }),
                            v ? 'Practice active' : 'Practice paused',
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit"
                        onClick={() => setEditing(p)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete"
                        onClick={() =>
                          window.confirm(`Delete "${p.title}"?`) &&
                          call(
                            () => api(`/best-practices/${p.id}`, { method: 'DELETE' }),
                            'Deleted',
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {editing && (
        <PracticeDialog
          practice={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

function PracticeDialog({
  practice,
  onClose,
  onSaved,
}: {
  practice: BestPractice | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [form, setForm] = useState({
    title: practice?.title ?? '',
    statement: practice?.statement ?? '',
    category: practice?.category ?? 'control',
    keywords: practice?.keywords.join(', ') ?? '',
    source: practice?.source ?? '',
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const body: BestPracticeInput = {
      title: form.title.trim(),
      statement: form.statement.trim(),
      category: form.category,
      keywords: form.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      source: form.source.trim() || null,
    };
    try {
      await api(practice ? `/best-practices/${practice.id}` : '/best-practices', {
        method: practice ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      await onSaved();
      toast.success(practice ? 'Practice updated' : 'Practice added');
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{practice ? 'Edit practice' : 'Add a practice'}</DialogTitle>
          <DialogDescription>Write it as a rule a process should follow.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bp-title">Title</Label>
            <Input
              id="bp-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bp-statement">Practice</Label>
            <Textarea
              id="bp-statement"
              rows={3}
              value={form.statement}
              onChange={(e) => setForm({ ...form, statement: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bp-category">Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) =>
                v && setForm({ ...form, category: v as BestPractice['category'] })
              }
            >
              <SelectTrigger id="bp-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {practiceCategories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {humanize(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bp-keywords">
              Applies when the process mentions (comma-separated; empty = every process)
            </Label>
            <Input
              id="bp-keywords"
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              placeholder="e.g. supplier, bank, payment"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bp-source">Source (optional)</Label>
            <Input
              id="bp-source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="e.g. COSO; Procurement Policy 4.2"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy || form.title.trim().length < 3 || form.statement.trim().length < 10}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
