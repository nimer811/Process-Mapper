import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import type { ReviewState } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRefreshProcess } from '@/features/governance/queries';

export function useReview(processId: string) {
  return useQuery({
    queryKey: ['review', processId],
    queryFn: () => api<ReviewState>(`/processes/${processId}/review`),
  });
}

/**
 * Shown when the periodic review is due or a document the process relies on changed: the owner
 * confirms it is still accurate (or starts a new version) and checks each change.
 */
export function ReviewCard({ processId }: { processId: string }) {
  const review = useReview(processId);
  const qc = useQueryClient();
  const refresh = useRefreshProcess();
  const [busy, setBusy] = useState(false);
  const r = review.data;
  const openAlerts = r?.alerts.filter((a) => a.status === 'open') ?? [];
  if (!r || (r.status !== 'due_soon' && r.status !== 'overdue' && !openAlerts.length)) return null;

  const call = async (fn: () => Promise<ReviewState>, ok: string) => {
    setBusy(true);
    try {
      qc.setQueryData(['review', processId], await fn());
      await refresh();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  const due = r.status === 'due_soon' || r.status === 'overdue';

  return (
    <Card
      className={cn(
        r.status === 'overdue' || openAlerts.length ? 'border-amber-300 dark:border-amber-900' : '',
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-amber-600" />
          {due
            ? r.status === 'overdue'
              ? 'Review overdue'
              : 'Review due soon'
            : 'Check recent changes'}
        </CardTitle>
        <CardDescription>
          {due
            ? `Due ${formatDate(r.dueAt)} (every ${r.cycleMonths} months; last reviewed ${formatDate(r.lastReviewedAt)}). Confirm it still reflects how the work is done, or start a new version to change it.`
            : 'Documents this process relies on changed. Check whether the process or its SOP needs updating.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {openAlerts.map((a) => (
          <AlertRow
            key={a.id}
            title={a.documentTitle}
            change={a.change}
            canResolve={r.canReview}
            busy={busy}
            onResolve={(resolution) =>
              call(
                () =>
                  api<ReviewState>(`/process-alerts/${a.id}/resolve`, {
                    method: 'POST',
                    body: JSON.stringify({ resolution }),
                  }),
                'Marked as checked',
              )
            }
          />
        ))}
        {due && r.canReview && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                call(
                  () =>
                    api<ReviewState>(`/processes/${processId}/review`, {
                      method: 'POST',
                      body: '{}',
                    }),
                  'Marked as reviewed',
                )
              }
            >
              <Check />
              Still accurate — mark reviewed
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertRow({
  title,
  change,
  canResolve,
  busy,
  onResolve,
}: {
  title: string;
  change: string;
  canResolve: boolean;
  busy: boolean;
  onResolve: (resolution: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <div className="grid gap-2 rounded-md border p-2.5 text-sm">
      <div className="flex items-start gap-2">
        <FileWarning className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div>
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground"> — {change}</span>
        </div>
      </div>
      {canResolve && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onResolve(note.trim() || 'Checked — no impact on the process');
          }}
        >
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What you checked (optional)"
            className="h-8 min-w-0 flex-1"
            aria-label="Resolution note"
          />
          <Button size="sm" variant="outline" type="submit" disabled={busy}>
            Checked
          </Button>
        </form>
      )}
    </div>
  );
}
