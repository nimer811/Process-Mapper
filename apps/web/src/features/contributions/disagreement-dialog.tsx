import { useState } from 'react';
import { Check, Combine, MessageSquareReply, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Disagreement } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/auth/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useRefreshProcess } from '@/features/governance/queries';
import { useDisagreements } from './queries';

const CHOICE: Record<NonNullable<Disagreement['recommendation']>['choice'], string> = {
  current: 'Keep the description in the map',
  proposed: 'Use the newer description',
  both: 'Both can be true — combine them',
  unclear: 'Ask one of them to clarify',
};

/** Side by side: what each person said, the AI's recommendation, and the owner's decision. */
export function DisagreementDialog({
  versionId,
  disagreementId,
  onClose,
}: {
  versionId: string;
  disagreementId: string;
  onClose: () => void;
}) {
  const list = useDisagreements(versionId);
  const refresh = useRefreshProcess();
  const { user, hasRole } = useAuth();
  const [note, setNote] = useState('');
  const [combined, setCombined] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = list.data?.find((x) => x.id === disagreementId);
  // Nobody settles a difference they are part of; an admin does.
  const isParty =
    !!d &&
    !hasRole('admin') &&
    (d.current.user?.id === user?.id || d.proposed.user?.id === user?.id);
  const canDecide = d?.status === 'open' && !isParty;

  const call = async (path: string, body: unknown, ok: string, close = true) => {
    setBusy(true);
    try {
      await api(`/versions/${versionId}/disagreements/${disagreementId}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await Promise.all([refresh(), list.refetch()]);
      toast.success(ok);
      if (close) onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  const resolve = (decision: 'keep' | 'accept' | 'combine', value?: string) =>
    call('resolve', { decision, value, ...(note.trim() ? { note } : {}) }, 'Settled');
  const ask = (side: 'current' | 'proposed', name: string) =>
    call('ask', { side }, `Question sent to ${name}`);

  const rec = d?.recommendation;
  const recommended = (side: 'current' | 'proposed') => rec?.choice === side;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Colleagues described this differently</DialogTitle>
          <DialogDescription>{d ? d.subject : 'Loading…'}</DialogDescription>
        </DialogHeader>
        {!d ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(['current', 'proposed'] as const).map((side) => {
                const s = d[side];
                const name = s.user?.displayName ?? 'Unknown';
                return (
                  <div
                    key={side}
                    className={cn(
                      'flex flex-col gap-2 rounded-md border p-3 text-sm',
                      recommended(side) && 'border-sky-400 dark:border-sky-700',
                    )}
                  >
                    <div className="text-muted-foreground text-xs font-medium uppercase">
                      {side === 'current' ? 'In the map' : 'Newer description'}
                    </div>
                    <div className="font-medium">{s.value}</div>
                    <div className="text-muted-foreground text-xs">
                      {name}
                      {s.user?.department ? ` · ${s.user.department}` : ''}
                    </div>
                    {s.quote && (
                      <blockquote className="text-muted-foreground border-l-2 pl-2 text-xs italic">
                        "{s.quote}"
                      </blockquote>
                    )}
                    {canDecide && (
                      <div className="mt-auto flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => resolve(side === 'current' ? 'keep' : 'accept')}
                        >
                          <Check />
                          {side === 'current' ? 'Keep this' : 'Use this'}
                        </Button>
                        {s.user && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => ask(side, name)}
                          >
                            <MessageSquareReply />
                            Ask {name.split(' ')[0]}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="bg-muted/50 rounded-md border p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <Sparkles className="size-4 text-sky-600" />
                AI recommendation
              </div>
              {rec ? (
                <>
                  <div className="font-medium">{CHOICE[rec.choice]}</div>
                  {rec.suggestedValue && rec.choice === 'both' && (
                    <div className="mt-1">Suggested: "{rec.suggestedValue}"</div>
                  )}
                  <p className="text-muted-foreground mt-1">{rec.reasoning}</p>
                  {rec.sources.length > 0 && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Based on: {rec.sources.join('; ')}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Preparing a recommendation…</span>
                  {canDecide && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => call('recommend', {}, 'Recommendation ready', false)}
                    >
                      Ask the AI again
                    </Button>
                  )}
                </div>
              )}
            </div>

            {canDecide && d.field !== 'remove' && (
              <div className="grid gap-2 rounded-md border border-dashed p-3 text-sm">
                {combined === null && rec?.choice !== 'both' ? (
                  <button
                    type="button"
                    className="text-muted-foreground w-fit text-left text-xs underline"
                    onClick={() => setCombined('')}
                  >
                    Both are true in different cases? Write a combined version
                  </button>
                ) : (
                  <>
                    <label htmlFor="combined" className="font-medium">
                      Combine both
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        id="combined"
                        className="min-w-0 flex-1"
                        value={combined ?? rec?.suggestedValue ?? ''}
                        onChange={(e) => setCombined(e.target.value)}
                        placeholder="e.g. Procurement Manager; Head of Procurement for strategic suppliers"
                      />
                      <Button
                        size="sm"
                        disabled={busy || (combined ?? rec?.suggestedValue ?? '').trim().length < 2}
                        onClick={() =>
                          resolve('combine', (combined ?? rec?.suggestedValue ?? '').trim())
                        }
                      >
                        <Combine />
                        Use combined
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {isParty && d.status === 'open' && (
              <p className="text-muted-foreground text-sm">
                You described this yourself, so an admin decides it. You can still see both sides
                and the AI's recommendation.
              </p>
            )}
            {canDecide ? (
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note for the record (optional)"
                aria-label="Decision note"
              />
            ) : (
              d.status === 'resolved' && <p className="text-sm">Settled: {d.resolution}</p>
            )}
            {d.status === 'open' && d.resolution && (
              <p className="text-muted-foreground text-xs">{d.resolution}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
