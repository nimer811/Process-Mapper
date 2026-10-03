import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockGateway } from '@process-ai/agent';
import { and, eq, evidence, interviewSessions, processSteps } from '@process-ai/db';
import type {
  Department,
  InterviewDetail,
  InterviewStreamEvent,
  ProcessListItem,
  VersionGraph,
} from '@process-ai/shared';
import { ADMIN, EMPLOYEE, OWNER, startTestApp } from './helpers.js';

const op = {
  name: (value: string, quote: string) => ({
    op: 'set_process_field',
    field: 'name',
    value,
    provenance: 'stated',
    quote,
  }),
  field: (field: string, value: string, quote: string) => ({
    op: 'set_process_field',
    field,
    value,
    provenance: 'stated',
    quote,
  }),
  step: (ref: string, name: string, extra: Record<string, unknown> = {}) => ({
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
  }),
};

function parseSse(body: string): InterviewStreamEvent[] {
  return body
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((json) => JSON.parse(json) as InterviewStreamEvent);
}

describe('AI interview', () => {
  const llm = new MockGateway({
    respond: ({ prompt }) =>
      `Got it. ${/Ask next \(only these\):\n1\. (.*)/.exec(prompt)?.[1] ?? 'Anything else?'}`,
    summarise: () => 'Here is the summary. Is this right?',
  });
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let procurementId: string;
  let interview: InterviewDetail;

  beforeAll(async () => {
    t = await startTestApp({ llm });
    const depts = (
      await t.app.inject({ method: 'GET', url: '/api/v1/departments', headers: t.as(EMPLOYEE) })
    ).json<Department[]>();
    procurementId = depts.find((d) => d.slug === 'procurement')!.id;
  });
  afterAll(async () => {
    await t?.stop();
  });

  const say = async (text: string, email = EMPLOYEE) => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/v1/interviews/${interview.id}/messages`,
      headers: t.as(email),
      payload: { text },
    });
    return { res, events: res.statusCode === 200 ? parseSse(res.body) : [] };
  };
  const graph = async () =>
    (
      await t.app.inject({
        method: 'GET',
        url: `/api/v1/versions/${interview.versionId}`,
        headers: t.as(EMPLOYEE),
      })
    ).json<VersionGraph>();

  it('starts an interview with a greeting and a draft process', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/interviews',
      headers: t.as(EMPLOYEE),
      payload: { departmentId: procurementId },
    });
    expect(res.statusCode).toBe(201);
    interview = res.json<{ interview: InterviewDetail }>().interview;
    expect(interview.messages).toHaveLength(1);
    expect(interview.messages[0]!.content).toMatch(/Which process/);
    expect(interview.stage).toBe('scoping');
    expect(interview.openItems.some((i) => /name of the process/.test(i.description))).toBe(true);
  });

  it('extracts facts from a message, streams the reply and records evidence', async () => {
    llm.enqueue('extract', {
      user_intent: 'continue',
      ops: [
        op.name('Purchase Requisition', 'purchase requisition process'),
        op.field(
          'trigger',
          'A business user needs to buy something',
          'someone in the business needs to buy something',
        ),
        op.step('new1', 'Purchase need identified', {
          type: 'start',
          quote: 'needs to buy something',
        }),
      ],
    });
    const { res, events } = await say(
      'I want to map our purchase requisition process. It starts when someone in the business needs to buy something.',
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(events[0]).toMatchObject({ type: 'state' });
    expect(events.some((e) => e.type === 'token')).toBe(true);
    const final = events.at(-1)!;
    expect(final.type).toBe('message');

    const g = await graph();
    expect(g.trigger).toBe('A business user needs to buy something');
    expect(g.steps.map((s) => [s.stepKey, s.type, s.provenance])).toEqual([
      ['S1', 'start', 'stated'],
    ]);
    const ev = await t.db
      .select()
      .from(evidence)
      .where(and(eq(evidence.entityType, 'step'), eq(evidence.entityId, g.steps[0]!.id)));
    expect(ev[0]).toMatchObject({ sourceType: 'user_statement', quote: 'needs to buy something' });
    expect(ev[0]!.messageId).not.toBeNull();

    const mine = (
      await t.app.inject({ method: 'GET', url: '/api/v1/processes', headers: t.as(EMPLOYEE) })
    ).json<ProcessListItem[]>();
    expect(mine.find((p) => p.id === interview.processId)).toMatchObject({
      name: 'Purchase Requisition',
      slug: 'purchase-requisition',
      status: 'draft',
    });
  });

  it('downgrades unsupported "stated" claims to inferred and rejects invalid ops', async () => {
    llm.enqueue('extract', {
      user_intent: 'continue',
      ops: [
        op.step('new1', 'Raise purchase requisition', {
          after: 'S1',
          actor: 'Business Requester',
          systems: ['SAP'],
          quote: 'raise a PR in SAP',
        }),
        op.step('new2', 'Finance review', {
          after: 'new1',
          actor: 'Finance',
          quote: 'Finance reviews every request',
        }),
        op.step('new3', 'Ghost step', { after: 'S42' }),
      ],
    });
    const { events } = await say('They raise a PR in SAP and then it goes for review.');
    expect(events.at(-1)!.type).toBe('message');
    const g = await graph();
    const byName = Object.fromEntries(g.steps.map((s) => [s.name, s]));
    expect(byName['Raise purchase requisition']).toMatchObject({
      provenance: 'stated',
      actor: { name: 'Business Requester' },
    });
    expect(byName['Raise purchase requisition']!.systems.map((s) => s.name)).toEqual(['SAP']);
    expect(byName['Finance review']!.provenance).toBe('inferred');
    expect(byName['Ghost step']).toBeUndefined();
    expect(g.edges).toHaveLength(2);
  });

  it('keeps going with a fallback when the model fails', async () => {
    llm.enqueue('extract', new Error('model timeout'));
    llm.enqueue('respond', new Error('model timeout'));
    const { res, events } = await say('Not sure what else to say.');
    expect(res.statusCode).toBe(200);
    const final = events.at(-1)!;
    expect(final.type).toBe('message');
    expect(final.type === 'message' && final.message.content.length).toBeGreaterThan(10);
  });

  it('only lets the interviewee continue, and admins view', async () => {
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: `/api/v1/interviews/${interview.id}`,
          headers: t.as(OWNER),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: `/api/v1/interviews/${interview.id}`,
          headers: t.as(ADMIN),
        })
      ).statusCode,
    ).toBe(200);
    expect((await say('hello', ADMIN)).res.statusCode).toBe(403);
    const all = await t.app.inject({
      method: 'GET',
      url: '/api/v1/interviews?all=true',
      headers: t.as(ADMIN),
    });
    expect(all.json<unknown[]>().length).toBeGreaterThanOrEqual(1);
  });

  it('resumes with a recap built from stored state', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/v1/interviews/${interview.id}/resume`,
      headers: t.as(EMPLOYEE),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ content: string }>().content).toMatch(/Welcome back.*Finance review/);
  });

  it('summarises when the user is done, then completes', async () => {
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: `/api/v1/interviews/${interview.id}/complete`,
          headers: t.as(EMPLOYEE),
        })
      ).statusCode,
    ).toBe(409);

    llm.enqueue('extract', { user_intent: 'finish', ops: [] });
    const { events } = await say("I think that's everything.");
    expect(events[0]).toMatchObject({ type: 'state', stage: 'summary' });
    const final = events.at(-1)!;
    expect(final.type === 'message' && final.message.content).toContain('summary');

    const done = await t.app.inject({
      method: 'POST',
      url: `/api/v1/interviews/${interview.id}/complete`,
      headers: t.as(EMPLOYEE),
    });
    expect(done.statusCode).toBe(200);
    const [session] = await t.db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, interview.id));
    expect(session).toMatchObject({ status: 'completed', stage: 'completed' });
    // Confirming the summary submits the draft for validation.
    expect((await graph()).status).toBe('under_validation');
    expect((await say('one more thing')).res.statusCode).toBe(409);
  });

  it('records model usage for every call', async () => {
    const calls = await t.db.query.llmCalls.findMany();
    expect(calls.length).toBeGreaterThan(4);
    expect(new Set(calls.map((c) => c.purpose))).toEqual(
      expect.objectContaining(new Set(['extract', 'respond'])),
    );
  });

  it('keeps steps in the draft only (nothing else touched)', async () => {
    const steps = await t.db
      .select()
      .from(processSteps)
      .where(eq(processSteps.versionId, interview.versionId));
    expect(steps.length).toBe(3);
  });
});

describe('AI interview without a model configured', () => {
  let t: Awaited<ReturnType<typeof startTestApp>>;
  beforeAll(async () => {
    t = await startTestApp({ llm: null });
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('returns 503 with a clear message', async () => {
    const depts = (
      await t.app.inject({ method: 'GET', url: '/api/v1/departments', headers: t.as(EMPLOYEE) })
    ).json<Department[]>();
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/interviews',
      headers: t.as(EMPLOYEE),
      payload: { departmentId: depts[0]!.id },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().title).toMatch(/LLM_API_KEY/);
  });
});
