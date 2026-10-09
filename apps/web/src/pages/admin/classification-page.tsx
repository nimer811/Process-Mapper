import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ProcessCategory } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
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
import { useDepartments } from '@/features/processes/queries';
import { flattenTree, useCategories } from '@/features/architecture/queries';

const NONE = 'none';
type Editing =
  { mode: 'add'; parent: ProcessCategory | null } | { mode: 'edit'; node: ProcessCategory };

/**
 * The process classification (APQC-based): levels used to browse the library, place processes and
 * measure each department's coverage (a department owns the nodes assigned to it and everything below).
 */
export function ClassificationPage() {
  const categories = useCategories();
  const departments = useDepartments();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const tree = flattenTree(categories.data ?? []);
  const deptName = new Map((departments.data ?? []).map((d) => [d.id, d.name]));

  const remove = async (c: ProcessCategory) => {
    if (
      !window.confirm(
        `Delete ${c.code} ${c.name} and everything under it? Processes placed there become unclassified.`,
      )
    )
      return;
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Deleted');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not delete');
    }
  };

  return (
    <>
      <PageHeader
        title="Process classification"
        description="Levels from the APQC Process Classification Framework, extended with your own. Check the codes against your licensed PCF version."
        actions={
          <Button onClick={() => setEditing({ mode: 'add', parent: null })}>
            <Plus />
            Add category
          </Button>
        }
      />
      {categories.isPending ? (
        <Skeleton className="h-48" />
      ) : (
        <Card className="py-0">
          <CardContent className="divide-y px-0">
            {tree.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <div className="min-w-0 flex-1" style={{ paddingLeft: c.depth * 20 }}>
                  <span className="text-muted-foreground font-mono text-xs">{c.code}</span>{' '}
                  <span className={c.level === 1 ? 'font-semibold' : ''}>{c.name}</span>
                  {c.departmentId && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      · {deptName.get(c.departmentId)}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">L{c.level}</span>
                {c.level < 4 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Add below"
                    onClick={() => setEditing({ mode: 'add', parent: c })}
                  >
                    <Plus />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit"
                  onClick={() => setEditing({ mode: 'edit', node: c })}
                >
                  <Pencil />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove(c)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {editing && (
        <CategoryDialog
          editing={editing}
          departments={departments.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['categories'] })}
        />
      )}
    </>
  );
}

function CategoryDialog({
  editing,
  departments,
  onClose,
  onSaved,
}: {
  editing: Editing;
  departments: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const node = editing.mode === 'edit' ? editing.node : null;
  const parent = editing.mode === 'add' ? editing.parent : null;
  const [form, setForm] = useState({
    code: node?.code ?? (parent ? `${parent.code}.` : ''),
    name: node?.name ?? '',
    departmentId: node?.departmentId ?? NONE,
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      departmentId: form.departmentId === NONE ? null : form.departmentId,
      ...(node ? {} : { parentId: parent?.id ?? null, source: 'Custom' }),
    };
    try {
      await api(node ? `/categories/${node.id}` : '/categories', {
        method: node ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      await onSaved();
      toast.success(node ? 'Updated' : 'Added');
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {node
              ? `Edit ${node.code}`
              : parent
                ? `Add below ${parent.code}`
                : 'Add a top-level category'}
          </DialogTitle>
          <DialogDescription>
            Assign a department to make it responsible for this branch in the coverage dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cat-code">Code</Label>
              <Input
                id="cat-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cat-dept">Department in charge</Label>
            <Select
              value={form.departmentId}
              onValueChange={(v) => v && setForm({ ...form, departmentId: v })}
            >
              <SelectTrigger id="cat-dept" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Inherit / none</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy || !form.code.trim() || form.name.trim().length < 2}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
