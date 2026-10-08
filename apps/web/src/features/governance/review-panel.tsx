import { useState } from 'react';
import { AlertTriangle, Check, CircleAlert, MessageSquareReply, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Blocker, Readiness, VersionGraph } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRefreshProcess } from './queries';

/**
 * What stands between this version and validation: AI inferences to confirm, SOP contradictions to
 * resolve, a missing owner. Warnings (structure) are shown but don't block.
 */
export function ReviewPanel({
  graph: g,
  readiness: r,
}: {
  graph: VersionGraph;
  readiness: Readiness;
}) {
  const blocking = r.blockers.filter((b) => b.blocking);
  const warnings = r.blockers.filter((b) => !b.blocking);
  if (!blocking.length && !warnings.length) return null;
  if (g.status !== 'draft' && g.status !== 'under_validation') return null;

  return (
    <Card className="border-amber-300 dark:border-amber-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleAlert className="size-4 text-amber-600" />
          Review before validation
        </CardTitle>
        <CardDescription>
          {blocking.length
            ? `${blocking.length} item${blocking.length === 1 ? '' : 's'} must be resolved before this version can be validated. AI inferences are never treated as fact until someone confirms them.`
            : 'Nothing blocks validation. A few things are worth a look.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {blocking.map((b) => (
          <BlockerRow
            key={`${b.kind}-${b.entityId}`}
            versionId={g.id}
            blocker={b}
            canEdit={r.canEdit}
          />
        ))}
        {r.canSendBack && blocking.some((b) => b.kind === 'inferred' || b.kind === 'disputed') && (
          <SendBack versionId={g.id} />
        )}
        {warnings.map((b, i) => (
          <div key={i} className="text-muted-foreground flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {b.description}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Sends the AI's unconfirmed points back to the interviewee, who confirms them in the interview. */
function SendBack({ versionId }: { versionId: string }) {
  const refresh = useRefreshProcess();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api(`/versions/${versionId}/send-back`, {
        method: 'POST',
        body: JSON.stringify(comment.trim() ? { comment } : {}),
      });
      await refresh();
      toast.success('Sent back. The interviewee will be asked to confirm these points.');
      setComment('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not send back');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2.5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <span className="text-muted-foreground min-w-0 flex-1">
        Not sure? Ask the person interviewed to confirm the AI's inferences in their interview.
      </span>
      <Input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Note for them (optional)"
        className="h-8 sm:w-56"
        aria-label="Note for the interviewee"
      />
      <Button size="sm" type="submit" variant="outline" disabled={busy}>
        <MessageSquareReply />
        Ask the interviewee
      </Button>
    </form>
  );
}

function BlockerRow({
  versionId,
  blocker: b,
  canEdit,
}: {
  versionId: string;
  blocker: Blocker;
  canEdit: boolean;
}) {
  const refresh = useRefreshProcess();
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const call = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  const element = b.entityType === 'step' || b.entityType === 'edge' || b.entityType === 'rule';
  const removePath =
    b.entityType === 'step' ? 'steps' : b.entityType === 'edge' ? 'edges' : 'rules';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm">
      <span className="min-w-0 flex-1">{b.description}</span>
      {canEdit && element && (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              call(
                () =>
                  api(`/versions/${versionId}/accept`, {
                    method: 'POST',
                    body: JSON.stringify({ entityType: b.entityType, entityId: b.entityId }),
                  }),
                'Confirmed',
              )
            }
          >
            <Check />
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              call(
                () =>
                  api(`/versions/${versionId}/${removePath}/${b.entityId}`, { method: 'DELETE' }),
                'Removed',
              )
            }
          >
            <Trash2 />
            Remove
          </Button>
        </>
      )}
      {canEdit && b.kind === 'contradiction' && (
        <form
          className="flex w-full gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            if (resolution.trim().length >= 2) {
              void call(
                () =>
                  api(`/versions/${versionId}/open-items/${b.entityId}/resolve`, {
                    method: 'POST',
                    body: JSON.stringify({ resolution }),
                  }),
                'Resolved',
              );
            }
          }}
        >
          <Input
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="What actually happens today?"
            className="h-8 sm:w-64"
            aria-label="Resolution"
          />
          <Button size="sm" type="submit" disabled={busy || resolution.trim().length < 2}>
            Resolve
          </Button>
        </form>
      )}
    </div>
  );
}
