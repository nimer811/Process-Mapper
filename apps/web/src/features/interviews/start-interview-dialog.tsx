import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { InterviewDetail } from '@process-ai/shared';
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

/** `basePath` decides where the new interview opens: the workspace (/interviews) or the PoC chat (/chat). */
export function StartInterviewDialog({
  trigger,
  basePath = '/interviews',
}: {
  trigger: ReactNode;
  basePath?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {open && <StartForm basePath={basePath} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function StartForm({ onDone, basePath }: { onDone: () => void; basePath: string }) {
  const departments = useDepartments();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [processName, setProcessName] = useState('');
  const selected =
    departmentId ??
    departments.data?.find((d) => d.slug === 'procurement')?.id ??
    departments.data?.[0]?.id;

  const start = useMutation({
    mutationFn: () =>
      api<{ interview: InterviewDetail }>('/interviews', {
        method: 'POST',
        body: JSON.stringify({ departmentId: selected, processName: processName.trim() || null }),
      }),
    onSuccess: async ({ interview }) => {
      await queryClient.invalidateQueries({ queryKey: ['interviews'] });
      queryClient.setQueryData(['interview', interview.id], interview);
      onDone(); // the page behind may stay mounted (e.g. the /chat list), so close explicitly
      navigate(`${basePath}/${interview.id}`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not start the interview'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (selected && !start.isPending) start.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Map a process</DialogTitle>
        <DialogDescription>
          Talk the AI interviewer through how the process works today. It asks a few questions at a
          time and builds the process map as you go. You can stop and continue later.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="interview-dept">Department</Label>
        <Select value={selected ?? ''} onValueChange={(v) => v && setDepartmentId(v)}>
          <SelectTrigger id="interview-dept" className="w-full">
            <SelectValue placeholder="Choose a department" />
          </SelectTrigger>
          <SelectContent>
            {departments.data?.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="interview-name">Process name (optional)</Label>
        <Input
          id="interview-name"
          placeholder="e.g. Vendor onboarding"
          value={processName}
          onChange={(e) => setProcessName(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!selected || start.isPending}>
          {start.isPending ? 'Starting…' : 'Start interview'}
        </Button>
      </DialogFooter>
    </form>
  );
}
