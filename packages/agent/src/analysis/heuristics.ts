import type { IssueCategory, ProcessStep, VersionGraph } from '@process-ai/shared';
import type { Findings, IssueFinding, OpportunityFinding } from './types.js';

type Graph = Pick<VersionGraph, 'steps' | 'edges'> & Partial<Pick<VersionGraph, 'rules'>>;

const isWork = (s: ProcessStep) =>
  s.type === 'task' || s.type === 'approval' || s.type === 'subprocess';
const label = (s: ProcessStep) => `"${s.name}" (${s.stepKey})`;
const list = (steps: ProcessStep[]) => steps.map(label).join(', ');

/** Pain-point wording → issue category. First match wins. */
const PAIN_PATTERNS: [RegExp, IssueCategory][] = [
  [
    /re-?key|re-?enter|retyp|copy(ing)? (data|it)|double entry|duplicate entry|manually enter|enter .* again/i,
    'duplicate_entry',
  ],
  [
    /rework|resubmit|back[- ]and[- ]forth|chas(e|ing)|incomplete|missing (info|document)|correct(ion)?s?/i,
    'rework',
  ],
  [/wait|delay|slow|days|weeks|bottleneck|queue|hand-?off|follow[- ]up/i, 'handoff_delay'],
  [/approv|sign[- ]?off/i, 'unnecessary_approval'],
  [/manual|spreadsheet|excel|paper|print|email/i, 'manual_work'],
  [/who (owns|is responsible)|unclear|not sure who|nobody/i, 'unclear_ownership'],
];

const REVIEW_WORDS = /\b(review|check|verify|screen|validate|assess|evaluate|compare|match)\w*/i;
const EMAIL_SYSTEMS = /outlook|e-?mail|phone|paper|excel|spreadsheet/i;

/** Main path order (BFS from the start, ignoring loop-backs) for handoff counting. */
function mainPath(g: Graph): ProcessStep[] {
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  const start = g.steps.find((s) => s.type === 'start') ?? g.steps[0];
  if (!start) return [];
  const seen = new Set<string>();
  const order: ProcessStep[] = [];
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const step = byId.get(id);
    if (step) order.push(step);
    for (const e of g.edges)
      if (e.fromStepId === id && e.type !== 'loop_back' && e.type !== 'exception')
        queue.push(e.toStepId);
  }
  return order;
}

/**
 * Rule-based checks over the process model. Deterministic and cheap, so they run on every
 * validation. Each finding has a stable key so re-runs don't duplicate or resurrect dismissed items.
 */
export function analyzeProcess(g: Graph): Findings {
  const issues: IssueFinding[] = [];
  const opportunities: OpportunityFinding[] = [];
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  const work = g.steps.filter(isWork);

  // --- Employee pain points become issues (source: the employee) ---
  for (const s of g.steps) {
    s.painPoints.forEach((pain, i) => {
      const category = PAIN_PATTERNS.find(([re]) => re.test(pain))?.[1] ?? 'other';
      issues.push({
        key: `pain:${s.stepKey}:${i}`,
        stepId: s.id,
        category,
        severity: 'medium',
        title: pain.length > 90 ? `${pain.slice(0, 87)}…` : pain,
        description: `Reported by employees at ${label(s)}: "${pain}"`,
        source: 'user',
      });
    });
  }

  // --- Ownership and controls ---
  for (const s of work.filter((x) => !x.actor)) {
    issues.push({
      key: `owner:${s.stepKey}`,
      stepId: s.id,
      category: 'unclear_ownership',
      severity: 'high',
      title: `No owner for ${s.name}`,
      description: `Nobody is recorded as responsible for ${label(s)}. Unowned steps are where work stalls.`,
      source: 'heuristic',
    });
  }
  for (const s of g.steps.filter((x) => x.type === 'approval' && !x.approvalAuthority)) {
    issues.push({
      key: `authority:${s.stepKey}`,
      stepId: s.id,
      category: 'control_gap',
      severity: 'high',
      title: `Approval authority not defined for ${s.name}`,
      description: `${label(s)} has no recorded approver or limit, so it can't be checked against the delegation of authority.`,
      source: 'heuristic',
    });
  }
  for (const s of g.steps.filter((x) => x.type === 'decision')) {
    const exits = g.edges.filter((e) => e.fromStepId === s.id);
    if (exits.length >= 2 && exits.some((e) => !e.conditionLabel)) {
      issues.push({
        key: `criteria:${s.stepKey}`,
        stepId: s.id,
        category: 'control_gap',
        severity: 'medium',
        title: `Decision criteria unclear at ${s.name}`,
        description: `Not every outcome of ${label(s)} has a stated condition, which leads to inconsistent decisions.`,
        source: 'heuristic',
      });
    }
  }

  // --- Missing SLAs (one finding, listing the steps) ---
  const noSla = work.filter((s) => !s.sla);
  if (noSla.length) {
    issues.push({
      key: 'sla:missing',
      stepId: noSla.length === 1 ? noSla[0]!.id : null,
      category: 'missing_sla',
      severity: noSla.length >= work.length / 2 ? 'medium' : 'low',
      title: `${noSla.length} of ${work.length} steps have no SLA`,
      description: `Without target times, delays aren't visible or measurable. Steps without an SLA: ${list(noSla)}.`,
      source: 'heuristic',
    });
  }

  // --- Rework loops ---
  for (const e of g.edges.filter((x) => x.type === 'loop_back')) {
    const from = byId.get(e.fromStepId);
    const to = byId.get(e.toStepId);
    if (!from || !to) continue;
    issues.push({
      key: `rework:${from.stepKey}->${to.stepKey}`,
      stepId: to.id,
      category: 'rework',
      severity: 'medium',
      title: `Rework loop back to ${to.name}`,
      description: `Cases return from ${label(from)} to ${label(to)}${e.conditionLabel ? ` when "${e.conditionLabel}"` : ''}. Each loop adds time and effort.`,
      source: 'heuristic',
    });
    opportunities.push({
      key: `opp:validate-upfront:${to.stepKey}`,
      stepId: to.id,
      kind: 'self_service',
      title: `Catch problems at ${to.name} instead of sending work back`,
      description: `Add required fields, checklists or automatic completeness checks at ${label(to)} so cases don't loop back from ${label(from)}.`,
      expectedBenefit: 'Fewer rework cycles and shorter end-to-end time',
      impact: 'high',
      effort: 'medium',
      source: 'heuristic',
    });
  }

  // --- Handoffs along the main path ---
  const path = mainPath(g).filter(isWork);
  const handoffs = path.filter(
    (s, i) => i > 0 && s.actor && path[i - 1]!.actor && s.actor.id !== path[i - 1]!.actor!.id,
  );
  if (handoffs.length >= 4) {
    issues.push({
      key: 'handoffs:main-path',
      stepId: null,
      category: 'handoff_delay',
      severity: handoffs.length >= 6 ? 'high' : 'medium',
      title: `${handoffs.length} handoffs between teams on the main path`,
      description: `Work changes hands ${handoffs.length} times (${new Set(path.map((s) => s.actor?.name).filter(Boolean)).size} roles involved). Each handoff adds waiting time and risk of things being dropped.`,
      source: 'heuristic',
    });
  }

  // --- Approvals ---
  const approvals = path.filter((s) => s.type === 'approval');
  if (approvals.length >= 3) {
    issues.push({
      key: 'approvals:many',
      stepId: null,
      category: 'unnecessary_approval',
      severity: 'medium',
      title: `${approvals.length} approvals on the main path`,
      description: `Approvals at ${list(approvals)}. Check whether all are required by the delegation of authority, or whether thresholds could remove some.`,
      source: 'heuristic',
    });
  }
  for (const e of g.edges) {
    const a = byId.get(e.fromStepId);
    const b = byId.get(e.toStepId);
    if (a?.type === 'approval' && b?.type === 'approval' && e.type !== 'loop_back') {
      issues.push({
        key: `approvals:sequential:${a.stepKey}-${b.stepKey}`,
        stepId: b.id,
        category: 'unnecessary_approval',
        severity: 'low',
        title: `Sequential approvals: ${a.name} then ${b.name}`,
        description: `Two approvals in a row (${label(a)} → ${label(b)}). Consider parallel approval or a single approver above a threshold.`,
        source: 'heuristic',
      });
    }
  }

  // --- Opportunities from step characteristics ---
  // Steps that carry a control (e.g. an anti-fraud call-back) aren't candidates for AI automation.
  const controlled = new Set(
    (g.rules ?? []).filter((r) => r.ruleType === 'control' && r.stepId).map((r) => r.stepId!),
  );
  for (const s of work) {
    const systems = s.systems.map((x) => x.name);
    const reKeying = s.painPoints.some((p) => PAIN_PATTERNS[0]![0].test(p));
    if (reKeying) {
      opportunities.push({
        key: `opp:integration:${s.stepKey}`,
        stepId: s.id,
        kind: 'integration',
        title: `Integrate systems to stop re-keying at ${s.name}`,
        description: `Employees re-enter data at ${label(s)}${systems.length ? ` (${systems.join(', ')})` : ''}. An integration or API between the systems removes the duplicate entry and its errors.`,
        expectedBenefit: 'Less manual effort and fewer data-entry errors',
        impact: 'high',
        effort: 'medium',
        source: 'heuristic',
      });
    } else if (s.execution === 'manual' && systems.some((n) => EMAIL_SYSTEMS.test(n))) {
      opportunities.push({
        key: `opp:workflow:${s.stepKey}`,
        stepId: s.id,
        kind: 'workflow',
        title: `Move ${s.name} from ${systems.find((n) => EMAIL_SYSTEMS.test(n))} into a workflow`,
        description: `${label(s)} runs on ${systems.join(', ')}. A tracked workflow (forms, routing, reminders) gives visibility and an audit trail.`,
        expectedBenefit: 'Visibility of status, fewer chasers, audit trail',
        impact: 'medium',
        effort: 'low',
        source: 'heuristic',
      });
    }
    if (
      !controlled.has(s.id) &&
      s.execution !== 'automated' &&
      REVIEW_WORDS.test(s.name) &&
      (s.inputs.length > 0 || /document|invoice|form|contract/i.test(s.name))
    ) {
      opportunities.push({
        key: `opp:ai:${s.stepKey}`,
        stepId: s.id,
        kind: 'ai',
        title: `AI-assisted ${s.name.charAt(0).toLowerCase()}${s.name.slice(1)}`,
        description: `${label(s)} is a review of ${s.inputs.length ? s.inputs.join(', ') : 'documents'}. AI can pre-check completeness and flag exceptions so people focus on the cases that need judgement.`,
        expectedBenefit: 'Faster reviews and consistent checks',
        impact: 'medium',
        effort: 'medium',
        source: 'heuristic',
      });
    }
  }

  return { issues, opportunities };
}
