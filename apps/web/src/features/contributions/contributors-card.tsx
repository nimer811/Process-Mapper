import { useState } from 'react';
import { Link } from 'react-router';
import { UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Readiness, VersionGraph } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/auth/auth';
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
import { formatDate } from '@/lib/format';
import { stageLabel } from '@/features/interviews/queries';
import { useRefreshProcess, useUsers } from '@/features/governance/queries';
import { useContributors } from './queries';

/** Who described this process, and inviting a colleague to add their view. */
export function ContributorsCard({
  graph: g,
  readiness: r,
}: {
  graph: VersionGraph;
  readiness: Readiness;
}) {
  const contributors = useContributors(g.id);
  const { user, hasRole } = useAuth();
  const [inviting, setInviting] = useState(false);
  const list = contributors.data ?? [];
  if (!list.length && !r.canInvite) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            People who described this process
          </CardTitle>
          <CardDescription>
            Each person's statements are kept with their name. Where people differ, you decide.
          </CardDescription>
        </div>
        {r.canInvite && (
          <Button size="sm" variant="outline" onClick={() => setInviting(true)}>
            <UserPlus />
            Invite a colleague
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-2">
        {list.map((c) => {
          const canOpen = hasRole('admin') || c.user.id === user?.id;
          const status =
            c.status === 'completed' || c.stage === 'completed'
              ? 'Finished'
              : c.status === 'paused'
                ? 'Paused'
                : stageLabel[c.stage];
          return (
            <div
              key={c.sessionId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {c.user.displayName}
                  {c.user.department && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      · {c.user.department}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground text-xs">
                  {c.kind === 'primary'
                    ? 'First interview'
                    : `Invited by ${c.invitedBy ?? 'someone'}${c.focus ? ` · focus: ${c.focus}` : ''}`}
                  {' · '}
                  {formatDate(c.lastActivityAt)}
                </div>
              </div>
              <Badge variant={status === 'Finished' ? 'secondary' : 'outline'}>{status}</Badge>
              {canOpen && (
                <Button size="sm" variant="ghost" asChild>
                  <Link to={`/interviews/${c.sessionId}`}>Open</Link>
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
      {inviting && (
        <InviteDialog
          versionId={g.id}
          busyUserIds={list.filter((c) => c.status !== 'completed').map((c) => c.user.id)}
          onClose={() => setInviting(false)}
        />
      )}
    </Card>
  );
}

function InviteDialog({
  versionId,
  busyUserIds,
  onClose,
}: {
  versionId: string;
  busyUserIds: string[];
  onClose: () => void;
}) {
  const users = useUsers(true);
  const refresh = useRefreshProcess();
  const [userId, setUserId] = useState('');
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState(false);
  const invite = async () => {
    setBusy(true);
    try {
      await api(`/versions/${versionId}/contributors`, {
        method: 'POST',
        body: JSON.stringify({ userId, ...(focus.trim() ? { focus } : {}) }),
      });
      await refresh();
      toast.success('Invited. They will find it under My actions.');
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not invite');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a colleague</DialogTitle>
          <DialogDescription>
            They get a short interview that starts from the map so far and asks about their part.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invitee">Colleague</Label>
            <Select value={userId} onValueChange={(v) => v && setUserId(v)}>
              <SelectTrigger id="invitee" className="w-full">
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {users.data
                  ?.filter((u) => !busyUserIds.includes(u.id))
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="focus">What should they focus on? (optional)</Label>
            <Input
              id="focus"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. the approval and bank verification steps"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={invite} disabled={!userId || busy}>
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
