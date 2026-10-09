import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Pencil, Plus, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Control, ControlInput, Readiness, VersionGraph } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { humanize } from '@/lib/format';
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ProvenanceBadge } from '@/features/processes/badges';
import { useRefreshProcess } from '@/features/governance/queries';

export function useControls(versionId: string) {
  return useQuery({
    queryKey: ['controls', versionId],
    queryFn: () => api<Control[]>(`/versions/${versionId}/controls`),
  });
}

/**
 * Controls: how the process makes sure its rules hold (preventive/detective, owner, evidence). The AI
 * can draft the ones the process already contains; they stay "AI inferred" until confirmed.
 */
export function ControlsPanel({
  graph: g,
  readiness: r,
}: {
  graph: VersionGraph;
  readiness: Readiness;
}) {
  const controls = useControls(g.id);
  const refresh = useRefreshProcess();
  const [editing, setEditing] = useState<Control | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const stepKey = new Map(g.steps.map((s) => [s.id, s.stepKey]));

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
  const suggest = () =>
    call(async () => {
      const created = await api<Control[]>(`/versions/${g.id}/controls/suggest`, {
        method: 'POST',
      });
      if (!created.length) toast.info('No new controls found in the map.');
    }, 'Controls drafted — confirm or remove each one');

  const list = controls.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Rules say what must be true; controls are how the process makes sure of it. Each has an
          owner and the evidence that proves it ran. They appear in the SOP's control matrix.
        </p>
        {r.canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={suggest} disabled={busy}>
              <Sparkles />
              {busy ? 'Drafting…' : 'Suggest controls'}
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus />
              Add control
            </Button>
          </div>
        )}
      </div>

      {controls.isPending ? (
        <Skeleton className="h-32" />
      ) : !list.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheck />
            </EmptyMedia>
            <EmptyTitle>No controls yet</EmptyTitle>
            <EmptyDescription>
              {r.canEdit
                ? 'Let the AI draft the controls this process already contains, or add them yourself.'
                : 'Controls can be added while a version is a draft or under validation.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="py-0">
          <CardContent className="px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Control</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id} className="align-top">
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {c.controlKey}
                      {c.isKey && (
                        <Badge variant="secondary" className="ml-1.5">
                          Key
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal">
                      <div className="font-medium">{c.name}</div>
                      {c.description && (
                        <div className="text-muted-foreground text-xs">{c.description}</div>
                      )}
                      {c.risk && (
                        <div className="text-muted-foreground text-xs">Risk: {c.risk}</div>
                      )}
                      <div className="mt-1">
                        <ProvenanceBadge provenance={c.provenance} />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {humanize(c.controlType)}
                      <div className="text-muted-foreground">
                        {humanize(c.mode)}
                        {c.frequency ? ` · ${c.frequency}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{c.ownerRole ?? '—'}</TableCell>
                    <TableCell className="max-w-48 text-xs whitespace-normal">
                      {c.evidence ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.stepIds
                        .map((id) => stepKey.get(id))
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {r.canEdit && (
                        <>
                          {c.provenance === 'inferred' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Confirm"
                              disabled={busy}
                              onClick={() =>
                                call(
                                  () =>
                                    api(`/versions/${g.id}/controls/${c.id}/confirm`, {
                                      method: 'POST',
                                    }),
                                  'Confirmed',
                                )
                              }
                            >
                              <Check />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Edit"
                            onClick={() => setEditing(c)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Remove"
                            disabled={busy}
                            onClick={() =>
                              call(
                                () =>
                                  api(`/versions/${g.id}/controls/${c.id}`, { method: 'DELETE' }),
                                'Removed',
                              )
                            }
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {editing && (
        <ControlDialog
          graph={g}
          control={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ControlDialog({
  graph: g,
  control,
  onClose,
}: {
  graph: VersionGraph;
  control: Control | null;
  onClose: () => void;
}) {
  const refresh = useRefreshProcess();
  const [form, setForm] = useState<ControlInput>({
    name: control?.name ?? '',
    description: control?.description ?? '',
    controlType: control?.controlType ?? 'preventive',
    mode: control?.mode ?? 'manual',
    frequency: control?.frequency ?? '',
    ownerRole: control?.ownerRole ?? '',
    evidence: control?.evidence ?? '',
    isKey: control?.isKey ?? false,
    risk: control?.risk ?? '',
    ruleId: control?.ruleId ?? null,
    stepIds: control?.stepIds ?? [],
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ControlInput>(k: K, v: ControlInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

  const save = async () => {
    setBusy(true);
    const body = {
      ...form,
      description: blankToNull(form.description),
      frequency: blankToNull(form.frequency),
      ownerRole: blankToNull(form.ownerRole),
      evidence: blankToNull(form.evidence),
      risk: blankToNull(form.risk),
    };
    try {
      await api(
        control ? `/versions/${g.id}/controls/${control.id}` : `/versions/${g.id}/controls`,
        {
          method: control ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        },
      );
      await refresh();
      toast.success(control ? 'Control updated' : 'Control added');
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const work = g.steps.filter((s) => s.type !== 'start' && s.type !== 'end');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{control ? `Edit ${control.controlKey}` : 'Add a control'}</DialogTitle>
          <DialogDescription>Saving confirms the control.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
          <Field label="Name" id="c-name">
            <Input id="c-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="What is done" id="c-desc">
            <Textarea
              id="c-desc"
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" id="c-type">
              <Select
                value={form.controlType}
                onValueChange={(v) => v && set('controlType', v as ControlInput['controlType'])}
              >
                <SelectTrigger id="c-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventive">Preventive</SelectItem>
                  <SelectItem value="detective">Detective</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="How it runs" id="c-mode">
              <Select
                value={form.mode}
                onValueChange={(v) => v && set('mode', v as ControlInput['mode'])}
              >
                <SelectTrigger id="c-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automated">Automated</SelectItem>
                  <SelectItem value="it_dependent">IT-dependent manual</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Owner role" id="c-owner">
              <Input
                id="c-owner"
                value={form.ownerRole ?? ''}
                onChange={(e) => set('ownerRole', e.target.value)}
              />
            </Field>
            <Field label="Frequency" id="c-freq">
              <Input
                id="c-freq"
                placeholder="e.g. Every new supplier"
                value={form.frequency ?? ''}
                onChange={(e) => set('frequency', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Evidence (the record that proves it ran)" id="c-evidence">
            <Input
              id="c-evidence"
              value={form.evidence ?? ''}
              onChange={(e) => set('evidence', e.target.value)}
            />
          </Field>
          <Field label="Risk it addresses" id="c-risk">
            <Input
              id="c-risk"
              value={form.risk ?? ''}
              onChange={(e) => set('risk', e.target.value)}
            />
          </Field>
          <Field label="Steps where it happens" id="c-steps">
            <div className="flex flex-wrap gap-1.5" id="c-steps">
              {work.map((s) => {
                const on = form.stepIds?.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      set(
                        'stepIds',
                        on
                          ? form.stepIds!.filter((x) => x !== s.id)
                          : [...(form.stepIds ?? []), s.id],
                      )
                    }
                    className={`rounded-md border px-2 py-1 text-xs ${on ? 'border-sky-500 bg-sky-50 dark:bg-sky-950' : 'text-muted-foreground'}`}
                  >
                    {s.stepKey} {s.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Rule it enforces" id="c-rule">
            <Select
              value={form.ruleId ?? 'none'}
              onValueChange={(v) => v && set('ruleId', v === 'none' ? null : v)}
            >
              <SelectTrigger id="c-rule" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {g.rules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.statement.slice(0, 90)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!form.isKey} onCheckedChange={(v) => set('isKey', v)} />
            Key control (tested first by auditors)
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || form.name.trim().length < 3}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
