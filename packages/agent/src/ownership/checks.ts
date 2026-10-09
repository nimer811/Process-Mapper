import type {
  BestPractice,
  Control,
  DesignCheck,
  OwnershipView,
  VersionGraph,
} from '@process-ai/shared';

type Step = VersionGraph['steps'][number];
type Duty =
  'request' | 'master_data' | 'bank_verify' | 'approve' | 'order' | 'receive' | 'invoice' | 'pay';

const isWork = (s: Step) => s.type !== 'start' && s.type !== 'end';
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
/** External parties and systems don't hold internal duties. */
const EXTERNAL = /\b(supplier|vendor|customer|system|bank)\b/i;

const DUTY_PATTERNS: [Duty, RegExp][] = [
  [
    'master_data',
    /\b(activat\w*|set ?up|create|maintain|update|change|register)\b.*\b(supplier|vendor)\b.*\b(record|master|oracle|system|account)?|\b(supplier|vendor) (master|record|activation)|\bbank details? (entry|update|change)/,
  ],
  ['bank_verify', /\bbank\b.*\b(verif\w*|call-?back|confirm\w*)|\b(call-?back)\b/],
  ['request', /\b(raise|submit|request|requisition)\w*\b/],
  ['order', /\bpurchase order\b|\bcreate (a )?po\b|\bissue (the )?po\b/],
  [
    'receive',
    /\b(goods receipt|grn|receive goods|confirm receipt|receiv\w* (the )?(goods|services))\b/,
  ],
  ['invoice', /\b(approve|match|verify) (the )?invoice\b/],
  ['pay', /\b(payment|pay the|release funds|pay supplier)\b/],
];

function duties(s: Step): Set<Duty> {
  const text = norm(`${s.name} ${s.description ?? ''}`);
  const out = new Set<Duty>();
  for (const [duty, re] of DUTY_PATTERNS) if (re.test(text)) out.add(duty);
  if (s.type === 'approval' || /\bapprov\w*\b/.test(text)) out.add('approve');
  return out;
}

/** Who answers for a step: its accountable role, its approver, else the process owner. */
const accountableOf = (s: Step, owner: string | null) =>
  s.accountableRole ?? s.approvalAuthority ?? owner;

const INCOMPATIBLE: {
  a: Duty;
  b: Duty;
  severity: DesignCheck['severity'];
  title: string;
  practice: string;
  why: string;
}[] = [
  {
    a: 'master_data',
    b: 'pay',
    severity: 'high',
    practice: 'Separate supplier master data from payments',
    title: 'Same role maintains supplier records and handles payment',
    why: 'Someone who can set up a supplier (or its bank details) and also pay it can create and pay a fictitious supplier.',
  },
  {
    a: 'master_data',
    b: 'bank_verify',
    severity: 'high',
    practice: 'Independent verification of bank details',
    title: 'Same role enters supplier details and verifies the bank account',
    why: 'Bank details should be verified by someone other than the person who entered them.',
  },
  {
    a: 'order',
    b: 'receive',
    severity: 'medium',
    practice: 'Separate ordering, receiving and paying',
    title: 'Same role orders and confirms receipt',
    why: 'Ordering and confirming receipt should be separate so receipts cannot be confirmed for goods never delivered.',
  },
  {
    a: 'receive',
    b: 'pay',
    severity: 'medium',
    practice: 'Separate ordering, receiving and paying',
    title: 'Same role confirms receipt and approves payment',
    why: 'Receipt confirmation and payment approval should be done by different roles.',
  },
  {
    a: 'order',
    b: 'invoice',
    severity: 'medium',
    practice: 'Separate ordering, receiving and paying',
    title: 'Same role orders and approves the invoice',
    why: 'The person who ordered should not approve the supplier invoice.',
  },
];

const ROLE_IN_TEXT =
  /\b(head of [a-z][a-z ]*?(?=\b(?:approval|approves|signs|for|instead|and|or|above|below|$))|[a-z]+ (?:manager|director|officer|lead|controller|analyst|specialist)|cfo|ceo|coo|cpo)\b/gi;

/**
 * Ownership and control checks on a process version: segregation of duties, delegation of authority,
 * control gaps and ownership. Deterministic (no AI), so the same map always gives the same findings.
 */
export function runOwnershipChecks(input: {
  graph: VersionGraph;
  controls: Control[];
  practices: BestPractice[];
}): DesignCheck[] {
  const { graph: g, controls } = input;
  const practices = input.practices.filter((p) => p.isActive);
  const practice = (title: string, category: BestPractice['category']) =>
    practices.find((p) => p.title === title)?.title ??
    practices.find((p) => p.category === category)?.title ??
    null;
  const owner = g.ownerRole;
  const work = g.steps.filter(isWork);
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  const checks: DesignCheck[] = [];

  // --- Ownership
  if (!owner)
    checks.push({
      kind: 'ownership',
      severity: 'high',
      title: 'No accountable process owner',
      detail: 'The process has no owner role, so nobody answers for its performance and controls.',
      stepKeys: [],
      recommendation: 'Name one accountable owner role, senior enough to change the process.',
      practice: practice('One accountable owner per process', 'ownership'),
    });
  const noDoer = work.filter((s) => !s.actor);
  if (noDoer.length)
    checks.push({
      kind: 'ownership',
      severity: 'medium',
      title: `${noDoer.length} step${noDoer.length === 1 ? ' has' : 's have'} no responsible role`,
      detail: noDoer.map((s) => `${s.stepKey} ${s.name}`).join('; '),
      stepKeys: noDoer.map((s) => s.stepKey),
      recommendation: 'Assign the role that performs each step.',
      practice: practice('One accountable role per activity', 'ownership'),
    });

  // --- Segregation of duties (internal roles only)
  const byRole = new Map<string, { name: string; steps: Step[] }>();
  for (const s of work) {
    if (!s.actor || EXTERNAL.test(s.actor.name)) continue;
    const key = norm(s.actor.name);
    byRole.set(key, { name: s.actor.name, steps: [...(byRole.get(key)?.steps ?? []), s] });
  }
  for (const { name, steps } of byRole.values()) {
    for (const rule of INCOMPATIBLE) {
      const a = steps.filter((s) => duties(s).has(rule.a));
      const b = steps.filter((s) => duties(s).has(rule.b) && !a.includes(s));
      if (!a.length || !b.length) continue;
      checks.push({
        kind: 'segregation_of_duties',
        severity: rule.severity,
        title: `${rule.title}: ${name}`,
        detail: `${name} does ${a.map((s) => `${s.stepKey} ${s.name}`).join(', ')} and ${b.map((s) => `${s.stepKey} ${s.name}`).join(', ')}. ${rule.why}`,
        stepKeys: [...a, ...b].map((s) => s.stepKey),
        recommendation: `Give one of these steps to a different role (or add an independent review).`,
        practice: practice(rule.practice, 'segregation_of_duties'),
      });
    }
  }
  // Approving your own work: an approval whose approver also did the step just before it.
  for (const s of work.filter((x) => duties(x).has('approve'))) {
    const approver = norm(s.approvalAuthority ?? s.actor?.name);
    if (!approver || EXTERNAL.test(approver)) continue;
    const prepared = g.edges
      .filter((e) => e.toStepId === s.id)
      .map((e) => byId.get(e.fromStepId)!)
      .filter(
        (p) =>
          p &&
          isWork(p) &&
          p.type !== 'decision' &&
          !duties(p).has('approve') &&
          norm(p.actor?.name) === approver,
      );
    if (prepared.length)
      checks.push({
        kind: 'segregation_of_duties',
        severity: 'high',
        title: `${s.actor?.name ?? s.approvalAuthority} approves their own work`,
        detail: `${s.stepKey} ${s.name} is approved by the same role that did ${prepared.map((p) => `${p.stepKey} ${p.name}`).join(', ')}.`,
        stepKeys: [s.stepKey, ...prepared.map((p) => p.stepKey)],
        recommendation:
          'Have a different role approve, or add an independent check before approval.',
        practice: practice('Requester is not the approver', 'segregation_of_duties'),
      });
  }

  // --- Delegation of authority
  for (const s of work.filter((x) => x.type === 'approval')) {
    if (!s.approvalAuthority && !s.accountableRole)
      checks.push({
        kind: 'delegation_of_authority',
        severity: 'medium',
        title: `Approval without a stated authority: ${s.stepKey} ${s.name}`,
        detail:
          'The step approves something but the map does not say under which authority or limit.',
        stepKeys: [s.stepKey],
        recommendation:
          'State the approving role and the limit it covers (amount, category or risk) from the delegation of authority.',
        practice: practice(
          'Approvals follow the delegation of authority',
          'delegation_of_authority',
        ),
      });
  }
  const holders = work
    .flatMap((s) => [s.actor?.name, s.approvalAuthority, s.accountableRole])
    .filter(Boolean)
    .map(norm);
  for (const r of g.rules.filter(
    (x) => x.ruleType === 'approval' || x.ruleType === 'threshold' || /\bapprov/i.test(x.statement),
  )) {
    const named = [...new Set((r.statement.match(ROLE_IN_TEXT) ?? []).map((m) => norm(m)))];
    // A holder covers the role only if it names it ("Procurement" does not cover "Head of Procurement").
    const missing = named.filter((role) => !holders.some((h) => h.includes(role)));
    if (missing.length)
      checks.push({
        kind: 'delegation_of_authority',
        severity: 'high',
        title: `Rule names an approver no step uses`,
        detail: `"${r.statement}" — but no step is done or approved by ${missing.join(', ')}.`,
        stepKeys: r.stepId ? [byId.get(r.stepId)?.stepKey ?? ''].filter(Boolean) : [],
        recommendation: `Add the approval by ${missing.join(', ')} to the flow (with its threshold), or correct the rule.`,
        practice: practice(
          'Approvals follow the delegation of authority',
          'delegation_of_authority',
        ),
      });
  }

  // --- Control gaps
  const keyRules = g.rules.filter((r) =>
    ['approval', 'threshold', 'compliance', 'control'].includes(r.ruleType),
  );
  if (!controls.length && keyRules.length) {
    checks.push({
      kind: 'control_gap',
      severity: 'medium',
      title: 'No controls recorded',
      detail: `${keyRules.length} approval, threshold or compliance rule${keyRules.length === 1 ? '' : 's'} with no control that enforces ${keyRules.length === 1 ? 'it' : 'them'}.`,
      stepKeys: [],
      recommendation:
        'Record the controls on the Controls tab (the AI can draft them from the map).',
      practice: practice('Every key rule has a control with evidence', 'control'),
    });
  } else if (controls.length) {
    for (const r of keyRules.filter((x) => !controls.some((c) => c.ruleId === x.id))) {
      checks.push({
        kind: 'control_gap',
        severity: 'low',
        title: 'Rule without a linked control',
        detail: `"${r.statement}"`,
        stepKeys: r.stepId ? [byId.get(r.stepId)?.stepKey ?? ''].filter(Boolean) : [],
        recommendation: 'Link the control that enforces it, or add one with an owner and evidence.',
        practice: practice('Every key rule has a control with evidence', 'control'),
      });
    }
    for (const s of work.filter(
      (x) => x.type === 'approval' || /\b(screen|sanction|verif)/i.test(x.name),
    )) {
      if (!controls.some((c) => c.stepIds.includes(s.id)))
        checks.push({
          kind: 'control_gap',
          severity: 'low',
          title: `Key step without a control: ${s.stepKey} ${s.name}`,
          detail:
            'Approvals, screenings and verifications are usually controls an auditor will test.',
          stepKeys: [s.stepKey],
          recommendation: 'Record it as a control with its owner and evidence.',
          practice: practice('Every key rule has a control with evidence', 'control'),
        });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  // The same finding twice (e.g. a rule recorded twice) is shown once.
  const unique = [...new Map(checks.map((c) => [`${c.title}|${c.detail}`, c])).values()];
  return unique.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** RACI per work step plus the checks: what the Ownership tab shows. */
export function ownershipView(input: {
  graph: VersionGraph;
  controls: Control[];
  practices: BestPractice[];
}): OwnershipView {
  const owner = input.graph.ownerRole;
  return {
    processOwnerRole: owner,
    raci: input.graph.steps.filter(isWork).map((s) => ({
      stepId: s.id,
      stepKey: s.stepKey,
      name: s.name,
      responsible: s.actor?.name ?? null,
      accountable: accountableOf(s, owner),
      consulted: s.consultedRoles,
      informed: s.informedRoles,
    })),
    checks: runOwnershipChecks(input),
  };
}

/** Practices relevant to a process: no keywords (general) or a keyword in its name or steps. */
export function relevantPractices(
  practices: BestPractice[],
  graph: VersionGraph,
  processName: string,
  departmentId: string,
) {
  const text = norm(
    `${processName} ${graph.steps.map((s) => `${s.name} ${s.description ?? ''}`).join(' ')} ${graph.rules.map((r) => r.statement).join(' ')}`,
  );
  return practices.filter(
    (p) =>
      p.isActive &&
      (!p.departmentId || p.departmentId === departmentId) &&
      (!p.keywords.length || p.keywords.some((k) => text.includes(norm(k)))),
  );
}
