import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  executionModes,
  stepTypes,
  type ProcessStep,
  type StepInput,
  type VersionGraph,
} from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { Textarea } from '@/components/ui/textarea';
import { useRefreshProcess } from './queries';

const NONE = 'none';
const split = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** Add or edit a step. Owner edits are recorded as confirmed, with who changed what. */
export function StepDialog({
  graph,
  step,
  open,
  onOpenChange,
}: {
  graph: VersionGraph;
  step: ProcessStep | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open && (
          <StepForm
            key={step?.id ?? 'new'}
            graph={graph}
            step={step}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepForm({
  graph,
  step,
  onDone,
}: {
  graph: VersionGraph;
  step: ProcessStep | null;
  onDone: () => void;
}) {
  const refresh = useRefreshProcess();
  const [f, setF] = useState({
    name: step?.name ?? '',
    type: step?.type ?? 'task',
    description: step?.description ?? '',
    actor: step?.actor?.name ?? '',
    systems: step?.systems.map((s) => s.name).join(', ') ?? '',
    inputs: step?.inputs.join(', ') ?? '',
    outputs: step?.outputs.join(', ') ?? '',
    execution: step?.execution ?? 'unknown',
    expectedDuration: step?.expectedDuration ?? '',
    sla: step?.sla ?? '',
    approvalAuthority: step?.approvalAuthority ?? '',
    accountableRole: step?.accountableRole ?? '',
    consultedRoles: step?.consultedRoles.join(', ') ?? '',
    informedRoles: step?.informedRoles.join(', ') ?? '',
    afterStepId: NONE,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) return;
    const body: StepInput = {
      name: f.name.trim(),
      type: f.type as StepInput['type'],
      description: f.description.trim() || null,
      actor: f.actor.trim() || null,
      systems: split(f.systems),
      inputs: split(f.inputs),
      outputs: split(f.outputs),
      execution: f.execution as StepInput['execution'],
      expectedDuration: f.expectedDuration.trim() || null,
      sla: f.sla.trim() || null,
      approvalAuthority: f.approvalAuthority.trim() || null,
      accountableRole: f.accountableRole.trim() || null,
      consultedRoles: split(f.consultedRoles),
      informedRoles: split(f.informedRoles),
      ...(step ? {} : { afterStepId: f.afterStepId === NONE ? null : f.afterStepId }),
    };
    setBusy(true);
    try {
      await api(step ? `/versions/${graph.id}/steps/${step.id}` : `/versions/${graph.id}/steps`, {
        method: step ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      await refresh();
      toast.success(step ? 'Step updated' : 'Step added');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.problem.title : 'Could not save the step');
    } finally {
      setBusy(false);
    }
  };

  const text = (k: keyof typeof f, label: string, placeholder?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`step-${k}`}>{label}</Label>
      <Input
        id={`step-${k}`}
        value={f[k]}
        onChange={(e) => set(k)(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{step ? `Edit ${step.stepKey}` : 'Add a step'}</DialogTitle>
      </DialogHeader>
      <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
        <div className="sm:col-span-2">{text('name', 'Name', 'e.g. Approve purchase request')}</div>
        <div className="grid gap-1.5">
          <Label htmlFor="step-type">Type</Label>
          <Select value={f.type} onValueChange={(v) => v && set('type')(v)}>
            <SelectTrigger id="step-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stepTypes
                .filter((t) => t !== 'subprocess')
                .map((t) => (
                  <SelectItem key={t} value={t}>
                    {humanize(t)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="step-execution">Execution</Label>
          <Select value={f.execution} onValueChange={(v) => v && set('execution')(v)}>
            <SelectTrigger id="step-execution" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {executionModes.map((t) => (
                <SelectItem key={t} value={t}>
                  {humanize(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {text('actor', 'Responsible (role that does it)', 'e.g. Procurement Officer')}
        {text('accountableRole', 'Accountable (one role)', 'e.g. Procurement Manager')}
        {text('consultedRoles', 'Consulted (comma-separated)')}
        {text('informedRoles', 'Informed (comma-separated)')}
        {text('systems', 'Systems (comma-separated)', 'e.g. SAP S/4HANA')}
        {text('inputs', 'Inputs (comma-separated)')}
        {text('outputs', 'Outputs (comma-separated)')}
        {text('expectedDuration', 'Typical duration', 'e.g. 30 minutes')}
        {text('sla', 'SLA', 'e.g. 2 business days')}
        {f.type === 'approval' && (
          <div className="sm:col-span-2">{text('approvalAuthority', 'Approver / authority')}</div>
        )}
        {!step && (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="step-after">Comes after</Label>
            <Select value={f.afterStepId} onValueChange={(v) => v && set('afterStepId')(v)}>
              <SelectTrigger id="step-after" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not connected yet</SelectItem>
                {graph.steps.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.stepKey} · {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="step-description">Description</Label>
          <Textarea
            id="step-description"
            rows={2}
            value={f.description}
            onChange={(e) => set('description')(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || f.name.trim().length < 2}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}
