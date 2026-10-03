import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Archive,
  CheckCheck,
  CopyPlus,
  Pencil,
  PencilOff,
  Send,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { LifecycleAction, ProcessDetail, Readiness, VersionGraph } from '@process-ai/shared';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRefreshProcess } from './queries';

const fail = (e: unknown, fallback: string) =>
  toast.error(e instanceof ApiError ? e.problem.title : fallback);

/** Lifecycle actions for the version being viewed, shown according to state and role. */
export function GovernanceBar({
  process: p,
  graph: g,
  readiness: r,
  editing,
  onToggleEdit,
}: {
  process: ProcessDetail;
  graph: VersionGraph;
  readiness: Readiness;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  const refresh = useRefreshProcess();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'return' | 'version' | 'archive' | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const blocking = r.blockers.filter((b) => b.blocking).length;

  const run = async (action: LifecycleAction, comment?: string) => {
    setBusy(true);
    try {
      await api(`/versions/${g.id}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ action, comment }),
      });
      await refresh();
      toast.success(
        {
          submit: 'Submitted for validation',
          validate: 'Validated — this is now the current version',
          return: 'Returned to draft',
          approve: 'Approved',
        }[action],
      );
      setDialog(null);
    } catch (e) {
      fail(e, 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const newVersion = async () => {
    setBusy(true);
    try {
      const v = await api<{ id: string }>(`/versions/${g.id}/new-version`, {
        method: 'POST',
        body: JSON.stringify({ changeSummary: text }),
      });
      await refresh();
      setDialog(null);
      navigate(`/processes/${p.id}?version=${v.id}`);
      toast.success('New draft version created');
    } catch (e) {
      fail(e, 'Could not create a new version');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await api(`/processes/${p.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ comment: text || undefined }),
      });
      await refresh();
      setDialog(null);
      toast.success('Process archived');
    } catch (e) {
      fail(e, 'Could not archive');
    } finally {
      setBusy(false);
    }
  };

  const open = (d: typeof dialog) => {
    setText('');
    setDialog(d);
  };
  const can = (a: LifecycleAction) => r.allowedActions.includes(a);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {r.canEdit && (
        <Button variant={editing ? 'secondary' : 'outline'} onClick={onToggleEdit}>
          {editing ? <PencilOff /> : <Pencil />}
          {editing ? 'Done editing' : 'Edit'}
        </Button>
      )}
      {can('submit') && (
        <Button onClick={() => run('submit')} disabled={busy}>
          <Send />
          Submit for validation
        </Button>
      )}
      {can('return') && (
        <Button variant="outline" onClick={() => open('return')} disabled={busy}>
          <Undo2 />
          Return
        </Button>
      )}
      {g.status === 'under_validation' && (can('validate') || blocking > 0) && (
        <Gate
          reason={
            blocking
              ? `${blocking} item${blocking === 1 ? '' : 's'} to resolve first (see Review)`
              : null
          }
        >
          <Button onClick={() => run('validate')} disabled={busy || !can('validate')}>
            <CheckCheck />
            Validate
          </Button>
        </Gate>
      )}
      {can('approve') && (
        <Button onClick={() => run('approve')} disabled={busy}>
          <ShieldCheck />
          Approve
        </Button>
      )}
      {r.canCreateVersion && (
        <Button variant="outline" onClick={() => open('version')} disabled={busy}>
          <CopyPlus />
          New version
        </Button>
      )}
      {r.canArchive && (
        <Button
          variant="ghost"
          onClick={() => open('archive')}
          disabled={busy}
          aria-label="Archive process"
        >
          <Archive />
        </Button>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          {dialog === 'return' && (
            <DialogBody
              title="Return to draft"
              description="Explain what needs to change. The comment is kept in the version history."
              label="Comment"
              action="Return"
              busy={busy}
              disabled={text.trim().length < 3}
              onConfirm={() => run('return', text)}
              onCancel={() => setDialog(null)}
            >
              <Textarea
                id="dialog-text"
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoFocus
              />
            </DialogBody>
          )}
          {dialog === 'version' && (
            <DialogBody
              title="Start a new version"
              description={`Creates version ${p.versions.length + 1} as a draft copy of version ${g.versionNumber}. The current version stays in use until the new one is validated.`}
              label="What is changing?"
              action="Create draft"
              busy={busy}
              disabled={text.trim().length < 3}
              onConfirm={newVersion}
              onCancel={() => setDialog(null)}
            >
              <Input
                id="dialog-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Automate bank verification"
                autoFocus
              />
            </DialogBody>
          )}
          {dialog === 'archive' && (
            <DialogBody
              title={`Archive "${p.name}"?`}
              description="The process is removed from the library. Its versions and history are kept."
              label="Reason (optional)"
              action="Archive"
              busy={busy}
              disabled={false}
              destructive
              onConfirm={archive}
              onCancel={() => setDialog(null)}
            >
              <Input id="dialog-text" value={text} onChange={(e) => setText(e.target.value)} />
            </DialogBody>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Gate({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function DialogBody(props: {
  title: string;
  description: string;
  label: string;
  action: string;
  busy: boolean;
  disabled: boolean;
  destructive?: boolean;
  children: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="dialog-text">{props.label}</Label>
        {props.children}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          onClick={props.onConfirm}
          disabled={props.busy || props.disabled}
          className={
            props.destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined
          }
        >
          {props.action}
        </Button>
      </DialogFooter>
    </div>
  );
}
