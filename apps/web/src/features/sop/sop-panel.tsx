import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookCheck, Download, FileText, RefreshCw, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { DocClassification, SopState, SopWording, VersionGraph } from '@process-ai/shared';
import { api, ApiError } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useRefreshProcess } from '@/features/governance/queries';

function useSop(versionId: string) {
  return useQuery({
    queryKey: ['sop', versionId],
    queryFn: () => api<SopState>(`/versions/${versionId}/sop`),
  });
}

/**
 * The SOP for this version: generated from the map (the AI writes the wording, never new facts),
 * reviewed by the owner, downloaded as Word, and published to the knowledge base once approved.
 */
export function SopPanel({ graph: g }: { graph: VersionGraph }) {
  const state = useSop(g.id);
  const refresh = useRefreshProcess();
  const [busy, setBusy] = useState<string | null>(null);
  const sop = state.data?.sop ?? null;
  // Edits apply to the wording they started from; a re-draft or save starts afresh.
  const base = sop ? JSON.stringify(sop.wording) : '';
  const [edits, setEdits] = useState<{ base: string; wording: SopWording } | null>(null);
  const wording = edits?.base === base ? edits.wording : (sop?.wording ?? null);
  const dirty = !!sop && edits?.base === base && JSON.stringify(edits.wording) !== base;
  const editable = !!state.data?.canGenerate;

  const run = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try {
      await fn();
      await Promise.all([refresh(), state.refetch()]);
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.problem.title : 'Action failed');
    } finally {
      setBusy(null);
    }
  };
  const generate = () => {
    if (
      sop &&
      !window.confirm(
        'Re-draft the SOP? The current wording, including your edits, will be replaced.',
      )
    )
      return;
    return run('generate', () => api(`/versions/${g.id}/sop`, { method: 'POST' }), 'SOP drafted');
  };
  const patch = (body: object, ok: string) =>
    run(
      'save',
      () => api(`/versions/${g.id}/sop`, { method: 'PATCH', body: JSON.stringify(body) }),
      ok,
    );
  const download = () =>
    run(
      'download',
      () => downloadFile(`/versions/${g.id}/sop/download`, `${sop?.docId ?? 'sop'}.docx`),
      'SOP downloaded',
    );
  const publish = () =>
    run(
      'publish',
      () => api(`/versions/${g.id}/sop/publish`, { method: 'POST' }),
      'Published to the knowledge base',
    );

  if (state.isPending) return <Skeleton className="h-40" />;
  if (!state.data) return null;

  if (!sop) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" />
            Standard Operating Procedure
          </CardTitle>
          <CardDescription>
            Generate a Word SOP from this process map: document control, roles and RACI, the flow,
            numbered steps, decisions, exceptions, the control matrix, records, risks and sign-off.
            The AI writes the wording only; every fact comes from the map.
            {g.status !== 'approved' &&
              ' You can draft it now; publishing needs an approved version.'}
          </CardDescription>
        </CardHeader>
        {state.data.canGenerate && (
          <CardContent>
            <Button onClick={generate} disabled={!!busy}>
              <Sparkles />
              {busy === 'generate' ? 'Drafting the SOP…' : 'Generate SOP draft'}
            </Button>
          </CardContent>
        )}
      </Card>
    );
  }

  const stepName = new Map(g.steps.map((s) => [s.stepKey, s.name]));
  const update = (fn: (w: SopWording) => SopWording) =>
    wording && setEdits({ base, wording: fn(wording) });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <FileText className="size-4" />
              {sop.docId} · v{sop.docVersion}
              <Badge variant={sop.status === 'published' ? 'secondary' : 'outline'}>
                {sop.status === 'published' ? 'Published' : 'Draft'}
              </Badge>
              {sop.aiDrafted && sop.status === 'draft' && (
                <Badge variant="outline">AI-drafted wording — review</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Generated {formatDate(sop.generatedAt)}
              {sop.generatedBy ? ` by ${sop.generatedBy}` : ''}
              {sop.publishedAt
                ? ` · published ${formatDate(sop.publishedAt)} to the knowledge base`
                : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={download}
              disabled={!!busy || dirty}
              title={dirty ? 'Save your edits first' : undefined}
            >
              <Download />
              Download Word
            </Button>
            {editable && (
              <Button variant="outline" onClick={generate} disabled={!!busy}>
                <RefreshCw />
                {busy === 'generate' ? 'Re-drafting…' : 'Re-draft'}
              </Button>
            )}
            {sop.status === 'draft' && (
              <Button
                onClick={publish}
                disabled={!!busy || dirty || !state.data.canPublish}
                title={state.data.publishBlockedReason ?? undefined}
              >
                <BookCheck />
                {busy === 'publish' ? 'Publishing…' : 'Publish to knowledge base'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4 text-sm">
          <div className="grid gap-1.5">
            <Label htmlFor="sop-class">Classification</Label>
            <Select
              value={sop.classification}
              disabled={!editable}
              onValueChange={(v) =>
                v && patch({ classification: v as DocClassification }, 'Classification updated')
              }
            >
              <SelectTrigger id="sop-class" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="confidential">Confidential</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sop-review">Review every</Label>
            <Select
              value={String(sop.reviewCycleMonths)}
              disabled={!editable}
              onValueChange={(v) =>
                v && patch({ reviewCycleMonths: Number(v) }, 'Review cycle updated')
              }
            >
              <SelectTrigger id="sop-review" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[6, 12, 24, 36].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} months
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state.data.publishBlockedReason && sop.status === 'draft' && (
            <p className="text-muted-foreground text-xs">{state.data.publishBlockedReason}</p>
          )}
        </CardContent>
      </Card>

      {wording && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Wording</CardTitle>
              <CardDescription>
                {editable
                  ? 'Check what the AI wrote. Facts (roles, systems, timings, controls) come from the map and are filled in automatically.'
                  : 'Published wording.'}
              </CardDescription>
            </div>
            {editable && (
              <Button
                onClick={() => patch({ wording }, 'Wording saved')}
                disabled={!dirty || !!busy}
              >
                <Save />
                Save wording
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="grid gap-1.5">
              <Label htmlFor="sop-purpose">1. Purpose</Label>
              <Textarea
                id="sop-purpose"
                rows={3}
                readOnly={!editable}
                value={wording.purpose}
                onChange={(e) => update((w) => ({ ...w, purpose: e.target.value }))}
              />
            </section>
            <section className="grid gap-2">
              <h3 className="text-sm font-medium">5. Roles and responsibilities</h3>
              {wording.roles.map((role, i) => (
                <div key={role.role} className="grid gap-1">
                  <Label htmlFor={`role-${i}`} className="text-muted-foreground text-xs">
                    {role.role}
                  </Label>
                  <Textarea
                    id={`role-${i}`}
                    rows={2}
                    readOnly={!editable}
                    value={role.responsibilities}
                    onChange={(e) =>
                      update((w) => ({
                        ...w,
                        roles: w.roles.map((x, j) =>
                          j === i ? { ...x, responsibilities: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </div>
              ))}
            </section>
            <section className="grid gap-2">
              <h3 className="text-sm font-medium">8. Step instructions</h3>
              {wording.steps.map((s, i) => (
                <div key={s.stepKey} className="grid gap-1">
                  <Label htmlFor={`step-${i}`} className="text-muted-foreground text-xs">
                    {s.stepKey} — {stepName.get(s.stepKey)}
                  </Label>
                  <Textarea
                    id={`step-${i}`}
                    rows={2}
                    readOnly={!editable}
                    value={s.instruction}
                    onChange={(e) =>
                      update((w) => ({
                        ...w,
                        steps: w.steps.map((x, j) =>
                          j === i ? { ...x, instruction: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </div>
              ))}
            </section>
            <p className="text-muted-foreground text-xs">
              Definitions, exceptions, risks and training suggestions are in the Word document; edit
              them there if needed before circulating.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
