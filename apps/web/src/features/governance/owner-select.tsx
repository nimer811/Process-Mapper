import { toast } from 'sonner';
import type { ProcessDetail } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRefreshProcess, useUsers } from './queries';

const NONE = 'none';

/** Admins pick the accountable process owner (the person who validates). */
export function OwnerSelect({ process: p }: { process: ProcessDetail }) {
  const users = useUsers(true);
  const refresh = useRefreshProcess();
  const change = async (value: string) => {
    try {
      await api(`/processes/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ownerUserId: value === NONE ? null : value }),
      });
      await refresh();
      toast.success('Process owner updated');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not change the owner');
    }
  };
  return (
    <Select value={p.owner?.id ?? NONE} onValueChange={(v) => v && change(v)}>
      <SelectTrigger size="sm" className="h-7 w-auto" aria-label="Process owner">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Unassigned</SelectItem>
        {users.data?.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
