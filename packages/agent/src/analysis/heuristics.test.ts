import { describe, expect, it } from 'vitest';
import type { ProcessEdge, ProcessStep } from '@process-ai/shared';
import { analyzeProcess } from './heuristics.js';

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
  execution: 'unknown',
  expectedDuration: null,
  sla: '1 day',
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
const edge = (
  a: ProcessStep,
  b: ProcessStep,
  type: ProcessEdge['type'] = 'sequence',
  conditionLabel: string | null = null,
): ProcessEdge => ({
  id: id(),
  fromStepId: a.id,
  toStepId: b.id,
  type,
  conditionLabel,
  provenance: 'confirmed',
});

describe('analyzeProcess', () => {
  const start = step('S1', { type: 'start', sla: null });
  const submit = step('S2', {
    name: 'Vendor submits documents',
    actor: actor('Vendor'),
    systems: [{ id: 's', name: 'Supplier Portal' }],
    painPoints: ['Vendors submit incomplete documents and are chased by email.'],
  });
  const review = step('S3', {
    name: 'Review documents',
    actor: actor('Procurement Officer'),
    inputs: ['Trade licence'],
    execution: 'manual',
  });
  const approve = step('S4', {
    type: 'approval',
    name: 'Approve vendor',
    actor: actor('Procurement Manager'),
  });
  const finance = step('S5', {
    type: 'approval',
    name: 'Finance approval',
    actor: actor('Finance'),
    approvalAuthority: 'CFO',
  });
  const create = step('S6', {
    name: 'Create vendor in SAP',
    actor: null,
    sla: null,
    execution: 'manual',
    systems: [{ id: 'x', name: 'SAP' }],
    painPoints: ['Data is re-keyed from the portal into SAP.'],
  });
  const notify = step('S7', {
    name: 'Notify requester',
    actor: actor('Master Data Team'),
    systems: [{ id: 'o', name: 'Outlook' }],
    execution: 'manual',
  });
  const end = step('S8', { type: 'end', sla: null });
  const g = {
    steps: [start, submit, review, approve, finance, create, notify, end],
    edges: [
      edge(start, submit),
      edge(submit, review),
      edge(review, approve),
      edge(review, submit, 'loop_back', 'Incomplete'),
      edge(approve, finance),
      edge(finance, create),
      edge(create, notify),
      edge(notify, end),
    ],
  };
  const { issues, opportunities } = analyzeProcess(g);
  const keys = issues.map((i) => i.key);

  it('turns pain points into categorised issues from the employee', () => {
    expect(issues.find((i) => i.key === 'pain:S2:0')).toMatchObject({
      source: 'user',
      category: 'rework',
    });
    expect(issues.find((i) => i.key === 'pain:S6:0')).toMatchObject({
      source: 'user',
      category: 'duplicate_entry',
    });
  });

  it('flags missing owners, approval authority, SLAs, rework and stacked approvals', () => {
    expect(keys).toEqual(
      expect.arrayContaining([
        'owner:S6',
        'authority:S4',
        'sla:missing',
        'rework:S3->S2',
        'approvals:sequential:S4-S5',
      ]),
    );
    expect(issues.find((i) => i.key === 'sla:missing')!.description).toContain(
      'Create vendor in SAP',
    );
    expect(keys).not.toContain('authority:S5');
  });

  it('suggests integration, workflow, AI and upfront-validation opportunities', () => {
    expect(opportunities.map((o) => o.key)).toEqual(
      expect.arrayContaining([
        'opp:integration:S6',
        'opp:workflow:S7',
        'opp:ai:S3',
        'opp:validate-upfront:S2',
      ]),
    );
  });

  it('does not suggest AI for steps that carry a control', () => {
    const withControl = {
      ...g,
      rules: [
        {
          id: 'r',
          stepId: review.id,
          ruleType: 'control' as const,
          statement: 'Four-eyes check',
          provenance: 'confirmed' as const,
        },
      ],
    };
    expect(analyzeProcess(withControl).opportunities.map((o) => o.key)).not.toContain('opp:ai:S3');
  });

  it('produces stable keys so re-runs are idempotent', () => {
    const again = analyzeProcess(g);
    expect(again.issues.map((i) => i.key)).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
