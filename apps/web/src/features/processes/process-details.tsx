import type { ProcessStep, VersionGraph } from '@process-ai/shared';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { humanize } from '@/lib/format';
import { ProvenanceBadge } from './badges';

export function StepTable({
  graph,
  onSelectStep,
  onEdit,
  onDelete,
}: {
  graph: VersionGraph;
  onSelectStep: (id: string) => void;
  onEdit?: (step: ProcessStep) => void;
  onDelete?: (step: ProcessStep) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Key</TableHead>
          <TableHead>Step</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Systems</TableHead>
          <TableHead>SLA</TableHead>
          <TableHead>Source</TableHead>
          {onEdit && <TableHead className="w-20" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {graph.steps.map((s) => (
          <TableRow key={s.id} className="cursor-pointer" onClick={() => onSelectStep(s.id)}>
            <TableCell className="text-muted-foreground font-mono text-xs">{s.stepKey}</TableCell>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell>{humanize(s.type)}</TableCell>
            <TableCell>{s.actor?.name ?? '—'}</TableCell>
            <TableCell>{s.systems.map((x) => x.name).join(', ') || '—'}</TableCell>
            <TableCell>{s.sla ?? '—'}</TableCell>
            <TableCell>
              <ProvenanceBadge provenance={s.provenance} />
            </TableCell>
            {onEdit && (
              <TableCell onClick={(e) => e.stopPropagation()} className="whitespace-nowrap">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${s.stepKey}`}
                  onClick={() => onEdit(s)}
                >
                  <Pencil />
                </Button>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${s.stepKey}`}
                    onClick={() => onDelete(s)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RulesList({ graph }: { graph: VersionGraph }) {
  const stepsById = new Map(graph.steps.map((s) => [s.id, s]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Business rules</CardTitle>
      </CardHeader>
      <CardContent>
        {graph.rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">No business rules recorded.</p>
        ) : (
          <ul className="divide-y">
            {graph.rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                <Badge variant="secondary">{humanize(r.ruleType)}</Badge>
                <span className="min-w-0 flex-1">
                  {r.statement}
                  {r.stepId && (
                    <span className="text-muted-foreground block text-xs">
                      {stepsById.get(r.stepId)?.stepKey} · {stepsById.get(r.stepId)?.name}
                    </span>
                  )}
                </span>
                <ProvenanceBadge provenance={r.provenance} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
