import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, UserX } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminSettings, PersonRecord } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/auth/auth';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** People and their data: export everything stored about someone, or erase a person who has left. */
export function PeoplePage() {
  const { user } = useAuth();
  const people = useQuery({
    queryKey: ['people'],
    queryFn: () => api<PersonRecord[]>('/admin/people'),
  });
  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api<AdminSettings>('/admin/settings'),
  });
  const [erasing, setErasing] = useState<PersonRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const runRetention = async () => {
    setBusy(true);
    try {
      const r = await api<{ purged: number }>('/admin/retention/run', { method: 'POST' });
      toast.success(
        r.purged
          ? `Removed ${r.purged} expired transcript${r.purged === 1 ? '' : 's'}`
          : 'Nothing to remove',
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="People and data"
        description={
          settings.data
            ? `Interview transcripts are removed ${settings.data.transcriptRetentionMonths ? `${settings.data.transcriptRetentionMonths} months after an interview ends` : 'never (retention is off)'}; the process facts they produced stay. Access comes from ${settings.data.authMode === 'entra' ? 'Microsoft Entra ID (groups and app roles)' : 'development users'}.`
            : undefined
        }
        actions={
          <Button variant="outline" onClick={runRetention} disabled={busy}>
            Apply retention now
          </Button>
        }
      />
      {people.isPending ? (
        <Skeleton className="h-48" />
      ) : (
        <Card className="py-0">
          <CardContent className="px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Interviews</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.data?.map((p) => (
                  <TableRow key={p.id} className={p.erasedAt ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="font-medium">{p.displayName}</div>
                      <div className="text-muted-foreground text-xs">
                        {p.erasedAt ? `Erased ${formatDate(p.erasedAt)}` : p.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.roles.includes('admin') ? (
                        <Badge variant="secondary">Admin</Badge>
                      ) : (
                        'User'
                      )}
                      {!p.isActive && !p.erasedAt && (
                        <Badge variant="outline" className="ml-1">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.interviews}</TableCell>
                    <TableCell>{formatDate(p.lastLoginAt)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          downloadFile(`/admin/people/${p.id}/export`, `person-${p.id}.json`)
                        }
                      >
                        <Download />
                        Export
                      </Button>
                      {!p.erasedAt && p.id !== user?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setErasing(p)}
                        >
                          <UserX />
                          Erase
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {erasing && (
        <EraseDialog
          person={erasing}
          onClose={() => setErasing(null)}
          onDone={() => people.refetch()}
        />
      )}
    </>
  );
}

function EraseDialog({
  person,
  onClose,
  onDone,
}: {
  person: PersonRecord;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const erase = async () => {
    setBusy(true);
    try {
      await api(`/admin/people/${person.id}/erase`, {
        method: 'POST',
        body: JSON.stringify({ confirm: 'ERASE' }),
      });
      await onDone();
      toast.success(`${person.displayName}'s personal data was erased`);
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not erase');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Erase {person.displayName}?</DialogTitle>
          <DialogDescription>
            Their interview transcripts and quoted words are removed and the account is anonymised
            and deactivated. Processes, approvals and history stay, shown as "Former employee". This
            cannot be undone — export their data first if it is needed.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type ERASE to confirm"
          aria-label="Confirm"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={erase} disabled={busy || confirm !== 'ERASE'}>
            Erase personal data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
