import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { MockGateway } from '@process-ai/agent';
import { documents, eq, processVersions } from '@process-ai/db';
import type {
  Control,
  Department,
  InterviewDetail,
  Readiness,
  SopDocument,
  SopState,
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

describe('Controls and SOP generation', () => {
  const llm = new MockGateway({
    respond: () => 'Thanks.',
    controls: () => ({
      controls: [
        {
          name: 'Bank details call-back verification',
          description: 'AP calls the supplier on a known number to confirm bank details.',
          control_type: 'preventive',
          mode: 'manual',
          frequency: 'Every new supplier',
          owner_role: 'Accounts Payable Officer',
          evidence: 'Call-back log in Oracle',
          is_key: true,
          risk: 'Payment to a fraudulent account',
          step_keys: ['S3', 'S99'],
          rule: 'R1',
        },
        // Same as the control added by hand: skipped.
        {
          name: 'Supplier approval by Procurement Manager',
          description: 'Approval before activation.',
          control_type: 'preventive',
          mode: 'manual',
          frequency: null,
          owner_role: null,
          evidence: null,
          is_key: false,
          risk: null,
          step_keys: ['S2'],
          rule: null,
        },
      ],
    }),
    sop: () => ({
      purpose: 'Ensures new suppliers are verified and approved before use.',
      scope_in: ['All new suppliers'],
      scope_out: [],
      definitions: [{ term: 'Oracle', meaning: 'ERP system' }],
      roles: [{ role: 'Procurement Manager', responsibilities: 'Approves suppliers.' }],
      steps: [
        { step_key: 'S2', instruction: 'Approve the supplier in Oracle.' },
        { step_key: 'S42', instruction: 'Invented step.' },
      ],
      exceptions: [],
      risks: [
        {
          risk: 'Fraud',
          cause: 'Fake bank letter',
          impact: 'Loss',
          control_keys: ['PRC-C-002', 'XX-1'],
        },
      ],
      training: [],
    }),
  });
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let interview: InterviewDetail;
  let v: string;

  const get = async <T>(url: string, email = ADMIN) =>
    (await t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: t.as(email) })).json<T>();
  const send = (
    method: 'POST' | 'PATCH' | 'DELETE',
    url: string,
    email: string,
    payload?: unknown,
  ) =>
    t.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: t.as(email),
      payload: payload as object,
    });

  beforeAll(async () => {
    t = await startTestApp({ llm });
    const depts = await get<Department[]>('/departments', EMPLOYEE);
    const procurement = depts.find((d) => d.slug === 'procurement')!;
    interview = (
      await send('POST', '/interviews', EMPLOYEE, {
        departmentId: procurement.id,
        processName: 'Supplier Onboarding',
      })
    ).json<{ interview: InterviewDetail }>().interview;
    v = interview.versionId;
    llm.enqueue('extract', {
      user_intent: 'continue',
      ops: [
        step('new1', 'Supplier registers', { type: 'start' }),
        step('new2', 'Approve supplier', {
          type: 'approval',
          after: 'new1',
          actor: 'Procurement Manager',
          systems: ['Oracle'],
          outputs: ['Approval record'],
        }),
        step('new3', 'Verify bank details', { after: 'new2', actor: 'Accounts Payable Officer' }),
        {
          op: 'add_rule',
          step: null,
          rule_type: 'control',
          statement: 'Bank details are verified by call-back before activation',
          provenance: 'stated',
          source: null,
          quote: null,
        },
      ],
    });
    await send('POST', `/interviews/${interview.id}/messages`, EMPLOYEE, {
      text: 'Supplier registers, the Procurement Manager approves in Oracle, then AP verifies bank details.',
    });
    await send('POST', '/knowledge-bases', ADMIN, {
      name: 'Procurement',
      departmentId: procurement.id,
    });
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('adds controls with department-wide keys and links to steps and rules', async () => {
    const g = await get<VersionGraph>(`/versions/${v}`);
    const approve = g.steps.find((s) => s.stepKey === 'S2')!;
    const res = await send('POST', `/versions/${v}/controls`, EMPLOYEE, {
      name: 'Supplier approval by Procurement Manager',
      controlType: 'preventive',
      mode: 'manual',
      stepIds: [approve.id],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<Control>()).toMatchObject({ controlKey: 'PRC-C-001', provenance: 'confirmed' });
    expect(
      (
        await send('POST', `/versions/${v}/controls`, EMPLOYEE, {
          name: 'Bad link',
          controlType: 'preventive',
          mode: 'manual',
          stepIds: ['00000000-0000-4000-8000-000000000000'],
        })
      ).statusCode,
    ).toBe(400);
  });

  it('drafts controls with the AI as inferred, dropping repeats and unknown steps, until confirmed', async () => {
    const res = await send('POST', `/versions/${v}/controls/suggest`, EMPLOYEE);
    expect(res.statusCode).toBe(201);
    const created = res.json<Control[]>();
    expect(created.map((c) => [c.controlKey, c.name, c.provenance, c.isKey])).toEqual([
      ['PRC-C-002', 'Bank details call-back verification', 'inferred', true],
    ]);
    const g = await get<VersionGraph>(`/versions/${v}`);
    expect(created[0]!.stepIds).toEqual([g.steps.find((s) => s.stepKey === 'S3')!.id]);
    expect(created[0]!.ruleId).toBe(g.rules[0]!.id);

    const readiness = await get<Readiness>(`/versions/${v}/readiness`);
    expect(
      readiness.blockers.some((b) => b.entityType === 'control' && b.kind === 'inferred'),
    ).toBe(true);
    expect(
      (await send('POST', `/versions/${v}/controls/${created[0]!.id}/confirm`, EMPLOYEE))
        .statusCode,
    ).toBe(204);
    const after = await get<Readiness>(`/versions/${v}/readiness`);
    expect(after.blockers.some((b) => b.entityType === 'control')).toBe(false);
  });

  it('generates an SOP draft with AI wording, keeping only facts from the map', async () => {
    // Only the owner or an admin manages the SOP.
    expect((await send('POST', `/versions/${v}/sop`, EMPLOYEE)).statusCode).toBe(403);
    const res = await send('POST', `/versions/${v}/sop`, ADMIN);
    expect(res.statusCode).toBe(201);
    const sop = res.json<SopDocument>();
    expect(sop).toMatchObject({
      docId: 'ORG-PRC-SOP-001',
      docVersion: '1.0',
      status: 'draft',
      aiDrafted: true,
      classification: 'internal',
    });
    expect(sop.wording.steps).toEqual([
      { stepKey: 'S2', instruction: 'Approve the supplier in Oracle.' },
    ]);
    expect(sop.wording.risks[0]!.controls).toEqual(['PRC-C-002']);

    const state = await get<SopState>(`/versions/${v}/sop`);
    expect(state).toMatchObject({ canGenerate: true, canPublish: false });
    expect(state.publishBlockedReason).toMatch(/approved/);
  });

  it('lets the owner edit the wording and settings, and downloads a Word document', async () => {
    const state = await get<SopState>(`/versions/${v}/sop`);
    const wording = {
      ...state.sop!.wording,
      purpose: 'Edited purpose: only verified suppliers are used.',
    };
    const res = await send('PATCH', `/versions/${v}/sop`, ADMIN, {
      wording,
      classification: 'confidential',
      reviewCycleMonths: 24,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<SopDocument>()).toMatchObject({
      classification: 'confidential',
      reviewCycleMonths: 24,
    });

    const file = await t.app.inject({
      method: 'GET',
      url: `/api/v1/versions/${v}/sop/download`,
      headers: t.as(EMPLOYEE),
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toContain('wordprocessingml');
    expect(file.headers['content-disposition']).toContain('ORG-PRC-SOP-001-v1.0-');
    const xml = strFromU8(unzipSync(new Uint8Array(file.rawPayload))['word/document.xml']!);
    for (const expected of [
      'ORG-PRC-SOP-001',
      'Edited purpose: only verified suppliers are used.',
      'Approve the supplier in Oracle.',
      'PRC-C-002',
      'Bank details call-back verification',
      'Confidential',
      'RACI matrix',
      'DRAFT',
    ])
      expect(xml).toContain(expected);
  });

  it('publishes the SOP of an approved version into the knowledge base, linked to the process', async () => {
    await t.db
      .update(processVersions)
      .set({ status: 'approved', approvedAt: new Date() })
      .where(eq(processVersions.id, v));
    expect((await get<SopState>(`/versions/${v}/sop`)).canPublish).toBe(true);
    const res = await send('POST', `/versions/${v}/sop/publish`, OWNER);
    expect(res.statusCode).toBe(403); // not this process's owner
    const published = await send('POST', `/versions/${v}/sop/publish`, ADMIN);
    expect(published.statusCode).toBe(200);
    const sop = published.json<SopDocument>();
    expect(sop.status).toBe('published');
    const [doc] = await t.db
      .select()
      .from(documents)
      .where(eq(documents.id, sop.knowledgeDocumentId!));
    expect(doc).toMatchObject({
      category: 'sop',
      processId: interview.processId,
      docVersion: '1.0',
      title: 'ORG-PRC-SOP-001 Supplier Onboarding',
    });

    expect((await send('POST', `/versions/${v}/sop`, ADMIN)).statusCode).toBe(409);
    expect(
      (await send('PATCH', `/versions/${v}/sop`, ADMIN, { reviewCycleMonths: 6 })).statusCode,
    ).toBe(409);
  });
});
