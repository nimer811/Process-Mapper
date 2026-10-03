import type { Provenance, VersionStatus } from '@process-ai/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const statusMeta: Record<VersionStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  under_validation: {
    label: 'Under validation',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  },
  validated: {
    label: 'Validated',
    className: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  },
  approved: {
    label: 'Approved',
    className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground line-through' },
};

export function StatusBadge({ status }: { status: VersionStatus }) {
  const meta = statusMeta[status];
  return (
    <Badge variant="secondary" className={cn('font-medium', meta.className)}>
      {meta.label}
    </Badge>
  );
}

export const provenanceMeta: Record<
  Provenance,
  { label: string; hint: string; className: string }
> = {
  stated: {
    label: 'Stated',
    hint: 'Described by an employee; not yet validated.',
    className: 'border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-300',
  },
  documented: {
    label: 'From SOP',
    hint: 'Taken from an official SOP or policy document.',
    className: 'border-violet-300 text-violet-800 dark:border-violet-800 dark:text-violet-300',
  },
  inferred: {
    label: 'AI inferred',
    hint: 'Deduced by the AI. Not confirmed by anyone yet.',
    className:
      'border-dashed border-amber-400 text-amber-800 dark:border-amber-700 dark:text-amber-300',
  },
  confirmed: {
    label: 'Confirmed',
    hint: 'Confirmed during validation.',
    className: 'border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300',
  },
  disputed: {
    label: 'Disputed',
    hint: 'The employee and the SOP disagree; needs resolution.',
    className: 'border-red-300 text-red-800 dark:border-red-800 dark:text-red-300',
  },
};

export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const meta = provenanceMeta[provenance];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn('cursor-default', meta.className)}>
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{meta.hint}</TooltipContent>
    </Tooltip>
  );
}
