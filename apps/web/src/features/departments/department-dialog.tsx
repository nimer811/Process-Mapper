import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DepartmentInput, type Department } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export function DepartmentDialog({
  open,
  department,
  onOpenChange,
}: {
  open: boolean;
  department: Department | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed so the form resets when switching between departments. */}
        {open && (
          <DepartmentForm
            key={department?.id ?? 'new'}
            department={department}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DepartmentForm({ department, onDone }: { department: Department | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(department?.name ?? '');
  const [slug, setSlug] = useState(department?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!department);
  const [description, setDescription] = useState(department?.description ?? '');
  const [isActive, setIsActive] = useState(department?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (body: DepartmentInput) =>
      department
        ? api<Department>(`/departments/${department.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api<Department>('/departments', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: async (d) => {
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success(department ? `${d.name} updated` : `${d.name} created`);
      onDone();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) setErrors({ slug: e.problem.title });
      else toast.error(e instanceof ApiError ? e.problem.title : 'Could not save the department');
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = DepartmentInput.safeParse({
      name,
      slug,
      description: description.trim() || null,
      isActive,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{department ? 'Edit department' : 'New department'}</DialogTitle>
        <DialogDescription>Departments organise the Process Library.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="dept-name">Name</Label>
        <Input
          id="dept-name"
          value={name}
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-destructive text-sm">{errors.name}</p>}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="dept-slug">URL name</Label>
        <Input
          id="dept-slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          aria-invalid={!!errors.slug}
        />
        {errors.slug ? (
          <p className="text-destructive text-sm">{errors.slug}</p>
        ) : (
          <p className="text-muted-foreground text-xs">Used in links, e.g. /library/{slug || 'procurement'}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="dept-description">Description</Label>
        <Textarea
          id="dept-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      {department && (
        <div className="flex items-center gap-3">
          <Switch id="dept-active" checked={isActive} onCheckedChange={setIsActive} />
          <Label htmlFor="dept-active">Active</Label>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}
