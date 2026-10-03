import type { ReactNode } from 'react';
import type { ProcessStep, VersionGraph } from '@process-ai/shared';
import { ArrowRight, Lightbulb, TriangleAlert } from 'lucide-react';
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
}

export function StepPanel({ graph, step, onClose, onSelectStep }: StepPanelProps) {
  return (
    <Sheet open={!!step} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        {step && (
          <StepDetails graph={graph} step={step} onSelectStep={onSelectStep} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function StepDetails({
  graph,
  step,
  onSelectStep,
}: {
  graph: VersionGraph;
  step: ProcessStep;
  onSelectStep: (id: string) => void;
}) {
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
        {step.description && <SheetDescription>{step.description}</SheetDescription>}
      </SheetHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2.5 text-sm">
            <Field label="Owner">{step.actor?.name}</Field>
            <Field label="System">{step.systems.map((s) => s.name).join(', ')}</Field>
            <Field label="Input">{list(step.inputs)}</Field>
            <Field label="Output">{list(step.outputs)}</Field>
            <Field label="Execution">{step.execution === 'unknown' ? null : humanize(step.execution)}</Field>
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
                            className={e.type === 'exception' ? 'border-red-300 text-red-700 dark:text-red-300' : ''}
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
            {step.painPoints.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {step.painPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <Muted>No pain points recorded.</Muted>
            )}
          </Section>

          <Section title="Automation opportunities" icon={<Lightbulb className="size-4 text-sky-600" />}>
            <Muted>Identified after validation (Phase 5).</Muted>
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

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
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
