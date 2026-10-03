import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { edgeTypes, ruleTypes, type VersionGraph } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProvenanceBadge } from '@/features/processes/badges';
import { useRefreshProcess } from './queries';

function useAction() {
  const refresh = useRefreshProcess();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Edit mode: the flow between steps (sequence, branches, exceptions, loop-backs). */
export function ConnectionsEditor({ graph: g }: { graph: VersionGraph }) {
  const { busy, run } = useAction();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState('sequence');
  const [label, setLabel] = useState('');
  const name = new Map(g.steps.map((s) => [s.id, `${s.stepKey} · ${s.name}`]));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!from || !to) return;
    const ok = await run(
      () =>
        api(`/versions/${g.id}/edges`, {
          method: 'POST',
          body: JSON.stringify({
            fromStepId: from,
            toStepId: to,
            type,
            conditionLabel: label || null,
          }),
        }),
      'Connection added',
    );
    if (ok) setLabel('');
  };

  const stepSelect = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="w-full" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {g.steps.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.stepKey} · {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connections</CardTitle>
        <CardDescription>
          How steps lead to each other. Label branches with their condition.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="divide-y text-sm">
          {g.edges.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                {name.get(e.fromStepId)} → {name.get(e.toStepId)}
                <span className="text-muted-foreground">
                  {' '}
                  · {humanize(e.type)}
                  {e.conditionLabel && ` · "${e.conditionLabel}"`}
                </span>
              </span>
              <ProvenanceBadge provenance={e.provenance} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove connection"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api(`/versions/${g.id}/edges/${e.id}`, { method: 'DELETE' }),
                    'Connection removed',
                  )
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_9rem_10rem_auto]">
          {stepSelect(from, setFrom, 'From step')}
          {stepSelect(to, setTo, 'To step')}
          <Select value={type} onValueChange={(v) => v && setType(v)}>
            <SelectTrigger className="w-full" aria-label="Connection type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {edgeTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {humanize(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Condition (optional)"
            aria-label="Condition"
          />
          <Button type="submit" variant="outline" disabled={busy || !from || !to}>
            <Plus />
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Edit mode: business rules, thresholds and controls. */
export function RulesEditor({ graph: g }: { graph: VersionGraph }) {
  const { busy, run } = useAction();
  const [statement, setStatement] = useState('');
  const [ruleType, setRuleType] = useState('other');
  const [stepId, setStepId] = useState('process');
  const name = new Map(g.steps.map((s) => [s.id, `${s.stepKey} · ${s.name}`]));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (statement.trim().length < 3) return;
    const ok = await run(
      () =>
        api(`/versions/${g.id}/rules`, {
          method: 'POST',
          body: JSON.stringify({
            statement,
            ruleType,
            stepId: stepId === 'process' ? null : stepId,
          }),
        }),
      'Rule added',
    );
    if (ok) setStatement('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Business rules</CardTitle>
        <CardDescription>Thresholds, approval limits, policies and controls.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="divide-y text-sm">
          {g.rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                {r.statement}
                <span className="text-muted-foreground block text-xs">
                  {humanize(r.ruleType)} · {r.stepId ? name.get(r.stepId) : 'Whole process'}
                </span>
              </span>
              <ProvenanceBadge provenance={r.provenance} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove rule"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api(`/versions/${g.id}/rules/${r.id}`, { method: 'DELETE' }),
                    'Rule removed',
                  )
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_10rem_12rem_auto]">
          <Input
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="e.g. POs above AED 50,000 need three quotes"
            aria-label="Rule"
          />
          <Select value={ruleType} onValueChange={(v) => v && setRuleType(v)}>
            <SelectTrigger className="w-full" aria-label="Rule type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ruleTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {humanize(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stepId} onValueChange={(v) => v && setStepId(v)}>
            <SelectTrigger className="w-full" aria-label="Applies to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="process">Whole process</SelectItem>
              {g.steps.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.stepKey} · {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline" disabled={busy || statement.trim().length < 3}>
            <Plus />
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
