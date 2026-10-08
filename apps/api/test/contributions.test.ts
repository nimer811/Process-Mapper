import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockGateway } from '@process-ai/agent';
import type {
  Contributor,
  Department,
  Disagreement,
  InterviewDetail,
  Readiness,
  Task,
  VersionGraph,
} from '@process-ai/shared';
import { ADMIN, EMPLOYEE, OWNER, startTestApp } from './helpers.js';

const step = (ref: string, name: string, extra: Record<string, unknown> = {}) => ({
  op: 'add_step',
  ref,
  type: 'task',
  name,
  description: null,
  actor: null,
  systems: [],
  inputs: [],
  outputs: [],
  execution: 'unknown',
  expected_duration: null,
  sla: null,
  approval_authority: null,
  after: null,
  after_label: null,
  provenance: 'stated',
  quote: null,
  ...extra,
});
const updateStep = (key: string, fields: Record<string, unknown>) => ({
  op: 'update_step',
  step: key,
  name: null,
  type: null,
  description: null,
  actor: null,
  add_systems: [],
  no_system: null,
  add_inputs: [],
  add_outputs: [],
  execution: null,
  expected_duration: null,
  sla: null,
  approval_authority: null,
  provenance: 'stated',
  quote: null,
  ...fields,
});
const rule = (statement: string, quote: string) => ({
  op: 'add_rule',
  step: null,
  rule_type: 'approval',
  statement,
  provenance: 'stated',
  source: null,
  quote,
});

describe('Several people, one process', () => {
  const llm = new MockGateway({
    respond: () => 'Thanks, noted.',
    reconcile: () => ({
      choice: 'both',
      suggested_value: 'Procurement Manager; Category Manager for strategic categories',
      reasoning: 'Both roles may approve, depending on the category.',
      sources: ['D9'],
    }),
  });
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let interview: InterviewDetail;
  let contribution: Contributor;

  const get = async <T>(url: string, email: string) =>
    (await t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: t.as(email) })).json<T>();
  const post = (url: string, email: string, payload?: unknown) =>
    t.app.inject({
      method: 'POST',
      url: `/api/v1${url}`,
      headers: t.as(email),
      payload: payload as object,
    });
  const say = (id: string, email: string, text: string) =>
    post(`/interviews/${id}/messages`, email, { text });
  const open = async (email: string) =>
    (await get<Task[]>('/tasks', email)).filter((x) => x.status === 'open');

  beforeAll(async () => {
    t = await startTestApp({ llm });
    const depts = await get<Department[]>('/departments', EMPLOYEE);
    const res = await post('/interviews', EMPLOYEE, {
      departmentId: depts.find((d) => d.slug === 'procurement')!.id,
      processName: 'Supplier Onboarding',
    });
    interview = res.json<{ interview: InterviewDetail }>().interview;
    llm.enqueue('extract', {
      user_intent: 'continue',
      ops: [
        step('new1', 'Supplier registers', { type: 'start' }),
        step('new2', 'Approve supplier', {
          after: 'new1',
          actor: 'Procurement Manager',
          quote: 'the Procurement Manager approves it',
        }),
        rule('Spend above AED 1 million needs Head of Procurement approval', 'above 1 million'),
      ],
    });
    await say(
      interview.id,
      EMPLOYEE,
      'A supplier registers, then the Procurement Manager approves it. Above 1 million the Head of Procurement signs.',
    );
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('lets the owner or an admin invite a colleague, who gets an action and a tailored greeting', async () => {
    const versionUrl = `/versions/${interview.versionId}/contributors`;
    expect(
      (await post(versionUrl, EMPLOYEE, { userId: t.as(OWNER)['x-dev-user-id'] })).statusCode,
    ).toBe(403);
    const res = await post(versionUrl, ADMIN, {
      userId: t.as(OWNER)['x-dev-user-id'],
      focus: 'the approval step',
    });
    expect(res.statusCode).toBe(201);
    contribution = res.json<Contributor>();
    expect(contribution).toMatchObject({
      kind: 'contribution',
      focus: 'the approval step',
      invitedBy: 'Dev Admin',
    });
    expect(
      (await post(versionUrl, ADMIN, { userId: t.as(OWNER)['x-dev-user-id'] })).statusCode,
    ).toBe(409);

    const action = (await open(OWNER)).find((x) => x.kind === 'add_view')!;
    expect(action.title).toBe('Add your view on "Supplier Onboarding"');
    const detail = await get<InterviewDetail>(`/interviews/${contribution.sessionId}`, OWNER);
    expect(detail.kind).toBe('contribution');
    expect(detail.messages[0]!.content).toMatch(/asked for your view on "Supplier Onboarding"/);
    expect(detail.messages[0]!.content).toMatch(/Approve supplier/);
    expect(detail.messages[0]!.content).toMatch(/the approval step/);
    expect((await get<Contributor[]>(versionUrl, ADMIN)).map((c) => c.kind)).toEqual([
      'primary',
      'contribution',
    ]);
  });

  it('holds what contradicts a colleague as a disagreement instead of overwriting it', async () => {
    llm.enqueue('extract', {
      user_intent: 'continue',
      ops: [
        updateStep('S2', {
          actor: 'Category Manager',
          expected_duration: '2 days',
          quote: 'the Category Manager approves',
        }),
        rule('Spend above AED 500,000 needs Head of Procurement approval', 'above 500,000'),
      ],
    });
    const res = await say(
      contribution.sessionId,
      OWNER,
      'Actually the Category Manager approves, within 2 days. The Head signs above 500,000.',
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Noted a difference with Procurement Officer');
    expect(
      llm.calls.find(
        (c) => c.purpose === 'extract' && c.prompt.includes('invited to add their view'),
      ),
    ).toBeTruthy();

    const g = await get<VersionGraph>(`/versions/${interview.versionId}`, ADMIN);
    const approve = g.steps.find((s) => s.name === 'Approve supplier')!;
    expect(approve.actor?.name).toBe('Procurement Manager'); // not overwritten
    expect(approve.expectedDuration).toBe('2 days'); // new information still applied
    expect(g.rules.map((r) => r.statement)).toEqual([
      'Spend above AED 1 million needs Head of Procurement approval',
    ]);

    const list = await get<Disagreement[]>(`/versions/${interview.versionId}/disagreements`, ADMIN);
    expect(
      list.map((d) => [d.field, d.current.value, d.proposed.value, d.current.user?.displayName]),
    ).toEqual([
      ['actor', 'Procurement Manager', 'Category Manager', 'Procurement Officer'],
      [
        'statement',
        'Spend above AED 1 million needs Head of Procurement approval',
        'Spend above AED 500,000 needs Head of Procurement approval',
        'Procurement Officer',
      ],
    ]);
    const readiness = await get<Readiness>(`/versions/${interview.versionId}/readiness`, ADMIN);
    expect(readiness.blockers.filter((b) => b.kind === 'disagreement')).toHaveLength(2);
    expect((await open(ADMIN)).find((x) => x.kind === 'resolve_disagreements')!.title).toMatch(
      /Settle 2 differences/,
    );
  });

  it('adds the AI recommendation, citing only documents it was given', async () => {
    let list: Disagreement[] = [];
    for (let i = 0; i < 40 && !(list.length && list.every((d) => d.recommendation)); i++) {
      await new Promise((r) => setTimeout(r, 50));
      list = await get<Disagreement[]>(`/versions/${interview.versionId}/disagreements`, ADMIN);
    }
    expect(list[0]!.recommendation).toMatchObject({ choice: 'both', sources: [] });
    expect(list[0]!.recommendation!.reasoning).toMatch(/depending on the category/);
  });

  it('can ask one of the two people, then settles each disagreement', async () => {
    const [actor, ruleD] = await get<Disagreement[]>(
      `/versions/${interview.versionId}/disagreements`,
      ADMIN,
    );
    const asked = await post(
      `/versions/${interview.versionId}/disagreements/${actor!.id}/ask`,
      ADMIN,
      { side: 'current' },
    );
    expect(asked.statusCode).toBe(200);
    expect(asked.json<{ content: string }>().content).toMatch(
      /process owner has a question.*"Procurement Manager".*"Category Manager"/,
    );
    expect((await open(EMPLOYEE)).find((x) => x.kind === 'confirm_points')!.link).toBe(
      `/interviews/${interview.id}`,
    );

    expect(
      (
        await post(
          `/versions/${interview.versionId}/disagreements/${actor!.id}/resolve`,
          EMPLOYEE,
          { decision: 'accept' },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post(`/versions/${interview.versionId}/disagreements/${actor!.id}/resolve`, ADMIN, {
          decision: 'accept',
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await post(`/versions/${interview.versionId}/disagreements/${ruleD!.id}/resolve`, ADMIN, {
          decision: 'keep',
          note: 'Policy says 1 million',
        })
      ).statusCode,
    ).toBe(204);

    const g = await get<VersionGraph>(`/versions/${interview.versionId}`, ADMIN);
    const approve = g.steps.find((s) => s.name === 'Approve supplier')!;
    expect(approve.actor?.name).toBe('Category Manager');
    expect(approve.provenance).toBe('confirmed');
    expect(g.rules[0]).toMatchObject({
      statement: 'Spend above AED 1 million needs Head of Procurement approval',
      provenance: 'confirmed',
    });

    const list = await get<Disagreement[]>(`/versions/${interview.versionId}/disagreements`, ADMIN);
    expect(list.map((d) => [d.status, d.resolution])).toEqual([
      ['resolved', 'Accepted: Category Manager'],
      [
        'resolved',
        'Kept: Spend above AED 1 million needs Head of Procurement approval — Policy says 1 million',
      ],
    ]);
    expect((await open(ADMIN)).filter((x) => x.kind === 'resolve_disagreements')).toEqual([]);
    const readiness = await get<Readiness>(`/versions/${interview.versionId}/readiness`, ADMIN);
    expect(readiness.blockers.filter((b) => b.kind === 'disagreement')).toEqual([]);
  });
});
