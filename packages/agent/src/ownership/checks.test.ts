import { describe, expect, it } from 'vitest';
import type {
  BestPractice,
  BusinessRule,
  Control,
  ProcessEdge,
  ProcessStep,
  VersionGraph,
} from '@process-ai/shared';
import { ownershipView, relevantPractices, runOwnershipChecks } from './checks.js';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const actor = (name: string) => ({ id: `a-${name}`, name });
const step = (stepKey: string, p: Partial<ProcessStep> = {}): ProcessStep => ({
  id: id(),
  stepKey,
  sequence: null,
  type: 'task',
  name: stepKey,
  description: null,
  actor: null,
  systems: [],
  inputs: [],
  outputs: [],
  execution: 'manual',
  expectedDuration: null,
  sla: null,
  approvalAuthority: null,
  accountableRole: null,
  consultedRoles: [],
  informedRoles: [],
  painPoints: [],
  dependsOn: [],
  provenance: 'confirmed',
  confidence: null,
  ...p,
});
const edge = (a: ProcessStep, b: ProcessStep): ProcessEdge => ({
  id: id(),
  fromStepId: a.id,
  toStepId: b.id,
  type: 'sequence',
  conditionLabel: null,
  provenance: 'confirmed',
});
const rule = (
  statement: string,
  ruleType: BusinessRule['ruleType'] = 'approval',
): BusinessRule => ({
  id: id(),
  stepId: null,
  ruleType,
  statement,
  provenance: 'confirmed',
});
const graph = (
  steps: ProcessStep[],
  edges: ProcessEdge[],
  rules: BusinessRule[],
  ownerRole: string | null,
): VersionGraph =>
  ({
    id: id(),
    processId: id(),
    versionNumber: 1,
    kind: 'as_is',
    status: 'draft',
    ownerRole,
    steps,
    edges,
    rules,
  }) as unknown as VersionGraph;
const practice = (
  title: string,
  category: BestPractice['category'],
  keywords: string[] = [],
): BestPractice => ({
  id: id(),
  title,
  statement: title,
  category,
  keywords,
  departmentId: null,
  source: null,
  isActive: true,
});
const PRACTICES = [
  practice('One accountable owner per process', 'ownership'),
  practice('Separate supplier master data from payments', 'segregation_of_duties', ['supplier']),
  practice('Requester is not the approver', 'segregation_of_duties'),
  practice('Approvals follow the delegation of authority', 'delegation_of_authority'),
  practice('Every key rule has a control with evidence', 'control'),
  practice('Conflict-of-interest declaration in sourcing', 'compliance', ['tender']),
];

describe('runOwnershipChecks', () => {
  const start = step('S1', { type: 'start' });
  const prepare = step('S2', {
    name: 'Prepare supplier file',
    actor: actor('Procurement Officer'),
  });
  const approve = step('S3', {
    name: 'Approve supplier',
    type: 'approval',
    actor: actor('Procurement Officer'),
  });
  const activate = step('S4', {
    name: 'Activate supplier in Oracle',
    actor: actor('Finance Officer'),
  });
  const pay = step('S5', {
    name: 'Release first payment to supplier',
    actor: actor('Finance Officer'),
  });
  const notify = step('S6', { name: 'Notify requester' });
  const end = step('S7', { type: 'end' });
  const g = graph(
    [start, prepare, approve, activate, pay, notify, end],
    [
      edge(start, prepare),
      edge(prepare, approve),
      edge(approve, activate),
      edge(activate, pay),
      edge(pay, notify),
      edge(notify, end),
    ],
    [rule('Spend above AED 1 million needs Head of Procurement approval', 'threshold')],
    null,
  );
  const checks = runOwnershipChecks({ graph: g, controls: [], practices: PRACTICES });
  const titles = checks.map((c) => c.title);

  it('flags segregation-of-duties conflicts with the related practice', () => {
    expect(titles).toContain(
      'Same role maintains supplier records and handles payment: Finance Officer',
    );
    expect(titles).toContain('Procurement Officer approves their own work');
    const sod = checks.find((c) => c.title.startsWith('Same role maintains'))!;
    expect(sod).toMatchObject({
      severity: 'high',
      stepKeys: ['S4', 'S5'],
      practice: 'Separate supplier master data from payments',
    });
  });

  it('flags missing authority, an approver no step uses, missing controls and ownership gaps', () => {
    expect(titles).toContain('No accountable process owner');
    expect(titles).toContain('Approval without a stated authority: S3 Approve supplier');
    expect(checks.find((c) => c.title === 'Rule names an approver no step uses')!.detail).toContain(
      'head of procurement',
    );
    expect(titles).toContain('No controls recorded');
    expect(titles).toContain('1 step has no responsible role');
    // Highest severity first.
    expect(checks[0]!.severity).toBe('high');
  });

  it('does not treat a team name as covering a named approver', () => {
    const team = graph(
      [
        start,
        { ...prepare, actor: actor('Procurement') },
        {
          ...approve,
          actor: actor('Procurement Manager'),
          approvalAuthority: 'Procurement Manager',
        },
        end,
      ],
      [edge(start, prepare), edge(prepare, approve), edge(approve, end)],
      [
        rule(
          'Strategic suppliers are approved by the Head of Procurement instead of the Procurement Manager.',
        ),
        // The same rule recorded twice gives one finding.
        rule(
          'Strategic suppliers are approved by the Head of Procurement instead of the Procurement Manager.',
        ),
      ],
      'Procurement',
    );
    const all = runOwnershipChecks({ graph: team, controls: [], practices: PRACTICES }).filter(
      (c) => c.title === 'Rule names an approver no step uses',
    );
    expect(all).toHaveLength(1);
    const found = all[0];
    expect(found!.detail).toMatch(/no step is done or approved by head of procurement\.$/);
  });

  it('is quiet when duties are separated, authority is stated and controls exist', () => {
    const ok = graph(
      [
        start,
        prepare,
        {
          ...approve,
          actor: actor('Procurement Manager'),
          approvalAuthority: 'Head of Procurement',
        },
        { ...activate, actor: actor('Master Data Specialist') },
        pay,
        { ...notify, actor: actor('Procurement Officer') },
        end,
      ],
      g.edges,
      g.rules,
      'Head of Procurement',
    );
    const controls = [
      { id: id(), ruleId: g.rules[0]!.id, stepIds: [approve.id] } as unknown as Control,
    ];
    expect(runOwnershipChecks({ graph: ok, controls, practices: PRACTICES })).toEqual([]);
  });

  it('builds the RACI with the approver or process owner as accountable', () => {
    const view = ownershipView({
      graph: { ...g, ownerRole: 'Head of Procurement' },
      controls: [],
      practices: PRACTICES,
    });
    expect(view.raci.map((r) => [r.stepKey, r.responsible, r.accountable])).toEqual([
      ['S2', 'Procurement Officer', 'Head of Procurement'],
      ['S3', 'Procurement Officer', 'Head of Procurement'],
      ['S4', 'Finance Officer', 'Head of Procurement'],
      ['S5', 'Finance Officer', 'Head of Procurement'],
      ['S6', null, 'Head of Procurement'],
    ]);
  });

  it('picks practices whose keywords appear in the process', () => {
    expect(
      relevantPractices(PRACTICES, g, 'Vendor Onboarding', 'd').map((p) => p.title),
    ).not.toContain('Conflict-of-interest declaration in sourcing');
    expect(relevantPractices(PRACTICES, g, 'Vendor Onboarding', 'd')).toHaveLength(5);
  });
});
