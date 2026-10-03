import type { VersionGraph } from '@process-ai/shared';

/** Compact text rendering of a stored process version for the analysis prompt. */
export function graphOutline(g: VersionGraph): string {
  const key = new Map(g.steps.map((s) => [s.id, s.stepKey]));
  const lines = [
    `Purpose: ${g.purpose ?? 'unknown'}`,
    `Trigger: ${g.trigger ?? 'unknown'}`,
    `End: ${g.endCondition ?? 'unknown'}`,
    `Volume/frequency: ${[g.volume, g.frequency].filter(Boolean).join(', ') || 'unknown'}`,
    '',
    'Steps:',
    ...g.steps.map((s) => {
      const parts = [
        s.actor && `owner: ${s.actor.name}`,
        s.systems.length && `systems: ${s.systems.map((x) => x.name).join(', ')}`,
        s.execution !== 'unknown' && s.execution,
        s.inputs.length && `in: ${s.inputs.join(', ')}`,
        s.outputs.length && `out: ${s.outputs.join(', ')}`,
        s.expectedDuration && `duration: ${s.expectedDuration}`,
        s.sla && `SLA: ${s.sla}`,
        s.approvalAuthority && `approver: ${s.approvalAuthority}`,
        s.painPoints.length && `pain points: ${s.painPoints.join('; ')}`,
      ].filter(Boolean);
      return `${s.stepKey} [${s.type}] ${s.name}${parts.length ? ` — ${parts.join('; ')}` : ''}`;
    }),
    '',
    'Flow:',
    ...g.edges.map(
      (e) =>
        `${key.get(e.fromStepId)} -> ${key.get(e.toStepId)}${e.type === 'sequence' ? '' : ` [${e.type}]`}${e.conditionLabel ? ` "${e.conditionLabel}"` : ''}`,
    ),
    '',
    'Rules:',
    ...(g.rules.length ? g.rules.map((r) => `- ${r.statement}`) : ['(none)']),
  ];
  return lines.join('\n');
}
