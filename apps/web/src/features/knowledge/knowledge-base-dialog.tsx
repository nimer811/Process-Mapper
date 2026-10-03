import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { KnowledgeBase } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { useDepartments } from '@/features/processes/queries';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from '@/components/ui/textarea';

const NONE = 'none';

export function KnowledgeBaseDialog({
  trigger,
  onCreated,
}: {
  trigger: ReactNode;
  onCreated?: (kb: KnowledgeBase) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {open && (
          <KnowledgeBaseForm
            onDone={(kb) => {
              setOpen(false);
              if (kb) onCreated?.(kb);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function KnowledgeBaseForm({ onDone }: { onDone: (kb?: KnowledgeBase) => void }) {
  const queryClient = useQueryClient();
  const departments = useDepartments();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState<string>(NONE);

  const create = useMutation({
    mutationFn: () =>
      api<KnowledgeBase>('/knowledge-bases', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: description || null,
          departmentId: departmentId === NONE ? null : departmentId,
        }),
      }),
    onSuccess: async (kb) => {
      await queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] });
      toast.success(`${kb.name} created`);
      onDone(kb);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not create the knowledge base'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length >= 2 && !create.isPending) create.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>New knowledge base</DialogTitle>
        <DialogDescription>
          A container for reference documents, e.g. "Procurement". Link it to a department so the
          interviewer uses it for that department's processes; leave it unlinked to use it
          everywhere.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="kb-name">Name</Label>
        <Input
          id="kb-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder="Procurement"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="kb-dept">Department</Label>
        <Select value={departmentId} onValueChange={(v) => v && setDepartmentId(v)}>
          <SelectTrigger id="kb-dept" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>All departments (organisation-wide)</SelectItem>
            {departments.data?.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="kb-desc">Description (optional)</Label>
        <Textarea
          id="kb-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={name.trim().length < 2 || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  );
}
