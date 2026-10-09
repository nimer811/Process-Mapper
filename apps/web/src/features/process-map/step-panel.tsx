import type { ReactNode } from 'react';
import type { Findings, ProcessStep, VersionGraph } from '@process-ai/shared';
import { ArrowRight, History, Lightbulb, Pencil, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EvidenceList } from '@/features/governance/evidence-list';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { humanize } from '@/lib/format';
import { ProvenanceBadge } from '@/features/processes/badges';

interface StepPanelProps {
  graph: VersionGraph;
  step: ProcessStep | null;
  onClose: () => void;
  onSelectStep: (stepId: string) => void;
  /** Present when the viewer may edit this version. */
  onEdit?: (step: ProcessStep) => void;
  findings?: Findings;
}

export function StepPanel({
  graph,
  step,
  onClose,
  onSelectStep,
  onEdit,
  findings,
}: StepPanelProps) {
  return (
    <Sheet open={!!step} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        {step && (
          <StepDetails
            graph={graph}
            step={step}
            onSelectStep={onSelectStep}
            onEdit={onEdit}
            findings={findings}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function StepDetails({
  graph,
  step,
  onSelectStep,
  onEdit,
  findings,
}: {
  graph: VersionGraph;
  step: ProcessStep;
  onSelectStep: (id: string) => void;
  onEdit?: (step: ProcessStep) => void;
  findings?: Findings;
}) {
  const stepIssues = (findings?.issues ?? []).filter(
    (i) => i.stepId === step.id && i.status !== 'dismissed',
  );
  const stepOpps = (findings?.opportunities ?? []).filter(
    (o) => o.stepId === step.id && o.status !== 'dismissed',
  );
  const rules = graph.rules.filter((r) => r.stepId === step.id);
  const stepsById = new Map(graph.steps.map((s) => [s.id, s]));
  const outgoing = graph.edges.filter((e) => e.fromStepId === step.id);

  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {step.stepKey}
          </Badge>
          <Badge variant="secondary">{humanize(step.type)}</Badge>
          <ProvenanceBadge provenance={step.provenance} />
        </div>
        <SheetTitle className="text-lg">{step.name}</SheetTitle>
        {onEdit && (
          <Button variant="outline" size="sm" className="w-fit" onClick={() => onEdit(step)}>
            <Pencil />
            Edit step
          </Button>
        )}
        {step.description && <SheetDescription>{step.description}</SheetDescription>}
      </SheetHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2.5 text-sm">
            <Field label="Responsible">{step.actor?.name}</Field>
            <Field label="Accountable">{step.accountableRole ?? step.approvalAuthority}</Field>
            {step.consultedRoles.length > 0 && (
              <Field label="Consulted">{step.consultedRoles.join(', ')}</Field>
            )}
            {step.informedRoles.length > 0 && (
              <Field label="Informed">{step.informedRoles.join(', ')}</Field>
            )}
            <Field label="System">{step.systems.map((s) => s.name).join(', ')}</Field>
            <Field label="Input">{list(step.inputs)}</Field>
            <Field label="Output">{list(step.outputs)}</Field>
            <Field label="Execution">
              {step.execution === 'unknown' ? null : humanize(step.execution)}
            </Field>
            <Field label="Duration">{step.expectedDuration}</Field>
            <Field label="SLA">{step.sla}</Field>
            {step.type === 'approval' && <Field label="Approver">{step.approvalAuthority}</Field>}
          </dl>

          <Section title="Business rules">
            {rules.length === 0 ? (
              <Muted>None recorded.</Muted>
            ) : (
              <ul className="space-y-2">
                {rules.map((r) => (
                  <li key={r.id} className="rounded-md border p-2.5 text-sm">
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge variant="secondary">{humanize(r.ruleType)}</Badge>
                      <ProvenanceBadge provenance={r.provenance} />
                    </div>
                    {r.statement}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Next">
            {outgoing.length === 0 ? (
              <Muted>End of process.</Muted>
            ) : (
              <ul className="space-y-1">
                {outgoing.map((e) => {
                  const target = stepsById.get(e.toStepId);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onSelectStep(e.toStepId)}
                        className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
                      >
                        <ArrowRight className="text-muted-foreground size-3.5 shrink-0" />
                        {e.conditionLabel && (
                          <Badge
                            variant="outline"
                            className={
                              e.type === 'exception'
                                ? 'border-red-300 text-red-700 dark:text-red-300'
                                : ''
                            }
                          >
                            {e.conditionLabel}
                          </Badge>
                        )}
                        <span className="truncate">{target?.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Separator />

          <Section title="Issues" icon={<TriangleAlert className="size-4 text-amber-600" />}>
            {stepIssues.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {stepIssues.map((i) => (
                  <li key={i.id}>
                    <span className="font-medium">{i.title}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {i.severity}
                      {i.status === 'accepted' ? ' · accepted' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : step.painPoints.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {step.painPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <Muted>No issues recorded.</Muted>
            )}
          </Section>

          <Section
            title="Automation opportunities"
            icon={<Lightbulb className="size-4 text-sky-600" />}
          >
            {stepOpps.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {stepOpps.map((o) => (
                  <li key={o.id}>
                    <span className="font-medium">{o.title}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {o.impact} impact, {o.effort} effort
                      {o.status === 'accepted' ? ' · accepted' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Muted>None identified yet. See the Automation tab.</Muted>
            )}
          </Section>

          <Separator />

          <Section title="Where did this come from?" icon={<History className="size-4" />}>
            <EvidenceList versionId={graph.id} entityId={step.id} />
          </Section>
        </div>
      </ScrollArea>
    </>
  );
}

function list(items: string[]) {
  return items.length ? items.join(', ') : null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children || <span className="text-muted-foreground/70 italic">Not captured</span>}</dd>
    </>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}
