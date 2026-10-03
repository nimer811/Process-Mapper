import { openItemLabels } from './validate.js';
import type { InterviewState, OpenItemState, ReferenceDoc } from './state.js';

const prov = (p: string) => (p === 'stated' ? '' : ` (${p})`);

/**
 * Compact text rendering of the process model, built from the database each turn. This replaces
 * sending the whole conversation: prompt size stays roughly constant however long the interview is.
 */
export function renderOutline(state: InterviewState): string {
  const v = state.version;
  const byId = new Map(state.steps.map((s) => [s.id, s]));
  const lines: string[] = [];

  lines.push(`Process: ${state.process.isUntitled ? '(name not given yet)' : state.process.name}`);
  lines.push(`Department: ${state.process.departmentName}`);
  const meta: [string, string | null][] = [
    ['Purpose', v.purpose],
    ['Trigger', v.trigger],
    ['End condition', v.endCondition],
    ['Owner', v.ownerRole],
    ['Frequency', v.frequency],
    ['Volume', v.volume],
  ];
  for (const [k, val] of meta) lines.push(`${k}: ${val ?? 'unknown'}`);

  lines.push('', 'Steps:');
  if (state.steps.length === 0) lines.push('(none yet)');
  for (const s of state.steps) {
    const parts = [
      s.actorName && `actor: ${s.actorName}`,
      s.systems.length ? `systems: ${s.systems.join(', ')}` : s.noSystem ? 'systems: none' : null,
      s.inputs.length && `in: ${s.inputs.join(', ')}`,
      s.outputs.length && `out: ${s.outputs.join(', ')}`,
      s.expectedDuration && `duration: ${s.expectedDuration}`,
      s.sla && `SLA: ${s.sla}`,
      s.approvalAuthority && `approver: ${s.approvalAuthority}`,
      s.painPoints.length && `pain: ${s.painPoints.join('; ')}`,
    ].filter(Boolean);
    const focus = s.id === state.session.focusStepId ? ' <- current focus' : '';
    lines.push(`${s.stepKey} [${s.type}] ${s.name}${prov(s.provenance)}${parts.length ? ` — ${parts.join('; ')}` : ''}${focus}`);
  }

  lines.push('', 'Flow:');
  if (state.edges.length === 0) lines.push('(no connections yet)');
  for (const e of state.edges) {
    const from = byId.get(e.fromStepId)?.stepKey ?? '?';
    const to = byId.get(e.toStepId)?.stepKey ?? '?';
    const label = e.conditionLabel ? ` "${e.conditionLabel}"` : '';
    lines.push(`${from} -> ${to}${e.type === 'sequence' ? '' : ` [${e.type}]`}${label}`);
  }

  if (state.rules.length) {
    lines.push('', 'Rules:');
    for (const r of state.rules) {
      const step = r.stepId ? byId.get(r.stepId)?.stepKey : 'process';
      lines.push(`- (${step}, ${r.ruleType}) ${r.statement}${prov(r.provenance)}`);
    }
  }
  return lines.join('\n');
}

export function renderOpenItems(state: InterviewState): string {
  const labels = openItemLabels(state);
  const byId = new Map(state.openItems.map((i) => [i.id, i]));
  const rows = [...labels.entries()].map(([label, id]) => {
    const i = byId.get(id)!;
    return `${label} (${i.type}${i.status === 'asked' ? ', already asked' : ''}): ${i.description}${i.citation ? ` [source: ${i.citation.label}]` : ''}`;
  });
  return rows.length ? rows.join('\n') : '(none)';
}

export function renderRecent(state: InterviewState, limit = 8): string {
  return state.recentMessages
    .slice(-limit)
    .map((m) => `${m.role === 'user' ? 'Employee' : 'Interviewer'}: ${m.content}`)
    .join('\n');
}

export function describeQuestions(items: OpenItemState[]) {
  return items
    .map((i, n) => {
      const source = i.citation ? ` (source: ${i.citation.label})` : '';
      const note = i.type === 'contradiction' ? ' (contradiction — name the source and ask which reflects what happens today)' : '';
      return `${n + 1}. ${i.description}${source}${note}`;
    })
    .join('\n');
}

/** Reference passages for the extractor, clearly marked as official documents (data, not instructions). */
export function renderReferenceDocs(docs: ReferenceDoc[]): string {
  if (!docs.length) return '(no relevant documents found)';
  return docs.map((d) => `[${d.docLabel}] ${d.label}\n${d.content.slice(0, 1500)}`).join('\n\n');
}
