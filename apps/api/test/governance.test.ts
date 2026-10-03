import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, evidence } from '@process-ai/db';
import type {
  EvidenceItem,
  HistoryEvent,
  ProcessDetail,
  ProcessListItem,
  Readiness,
  UserRef,
  VersionDiff,
  VersionGraph,
} from '@process-ai/shared';
import { ADMIN, EMPLOYEE, OWNER, startTestApp } from './helpers.js';

describe('validation, versioning and provenance', () => {
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let draft: ProcessListItem; // Purchase Requisition to PO (seeded draft, owned by OWNER, has an inferred step)
  let vendor: ProcessListItem; // Vendor Onboarding (seeded, approved)

  beforeAll(async () => {
    t = await startTestApp();
    const all = (
      await t.app.inject({ method: 'GET', url: '/api/v1/processes', headers: t.as(OWNER) })
    ).json<ProcessListItem[]>();
    draft = all.find((p) => p.status === 'draft')!;
    vendor = all.find((p) => p.slug === 'vendor-onboarding')!;
  });
  afterAll(async () => {
    await t?.stop();
  });

  const req = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    email: string,
    payload?: object,
  ) => t.app.inject({ method, url: `/api/v1${url}`, headers: t.as(email), payload });
  const readiness = async (versionId: string, email = OWNER) =>
    (await req('GET', `/versions/${versionId}/readiness`, email)).json<Readiness>();
  const graph = async (versionId: string, email = OWNER) =>
    (await req('GET', `/versions/${versionId}`, email)).json<VersionGraph>();
  const act = (versionId: string, action: string, email = OWNER, comment?: string) =>
    req('POST', `/versions/${versionId}/transitions`, email, { action, comment });

  it('hides drafts from other users and shows the owner what they can do', async () => {
    expect((await req('GET', `/versions/${draft.versionId}/readiness`, EMPLOYEE)).statusCode).toBe(
      404,
    );
    const r = await readiness(draft.versionId);
    expect(r).toMatchObject({ status: 'draft', allowedActions: ['submit'], canEdit: true });
  });

  it('blocks validation until AI inferences are confirmed', async () => {
    expect((await act(draft.versionId, 'submit')).statusCode).toBe(200);
    let r = await readiness(draft.versionId);
    expect(r.status).toBe('under_validation');
    const inferred = r.blockers.find((b) => b.kind === 'inferred')!;
    expect(inferred.description).toMatch(/Run request for quotation/);
    expect(r.allowedActions).toEqual(['return']);
    expect((await act(draft.versionId, 'validate')).statusCode).toBe(409);

    expect(
      (
        await req('POST', `/versions/${draft.versionId}/accept`, OWNER, {
          entityType: 'step',
          entityId: inferred.entityId,
        })
      ).statusCode,
    ).toBe(204);
    r = await readiness(draft.versionId);
    expect(r.blockers.filter((b) => b.blocking)).toEqual([]);
    expect(r.allowedActions).toEqual(['validate', 'return']);
  });

  it('lets owners edit with provenance recorded, and refuses others', async () => {
    const g = await graph(draft.versionId);
    const po = g.steps.find((s) => s.name === 'Create purchase order')!;
    const patch = await req('PATCH', `/versions/${draft.versionId}/steps/${po.id}`, OWNER, {
      actor: 'Buyer',
      systems: ['SAP S/4HANA', 'SAP Ariba'],
      sla: '2 business days',
    });
    expect(patch.statusCode).toBe(204);
    const after = (await graph(draft.versionId)).steps.find((s) => s.id === po.id)!;
    expect(after).toMatchObject({ sla: '2 business days', provenance: 'confirmed' });
    expect(after.systems.map((s) => s.name).sort()).toEqual(['SAP Ariba', 'SAP S/4HANA']);
    const [ev] = await t.db
      .select()
      .from(evidence)
      .where(and(eq(evidence.entityId, po.id), eq(evidence.sourceType, 'manual_edit')));
    expect(ev).toBeDefined();

    const added = await req('POST', `/versions/${draft.versionId}/steps`, OWNER, {
      name: 'Send PO to vendor by email',
      type: 'task',
      afterStepId: po.id,
    });
    expect(added.statusCode).toBe(201);
    const { id: newStep } = added.json<{ id: string }>();
    const rule = await req('POST', `/versions/${draft.versionId}/rules`, OWNER, {
      stepId: po.id,
      ruleType: 'threshold',
      statement: 'POs above AED 50,000 need three quotes.',
    });
    expect(rule.statusCode).toBe(201);
    expect(
      (await req('DELETE', `/versions/${draft.versionId}/steps/${newStep}`, OWNER)).statusCode,
    ).toBe(204);

    expect(
      (await req('PATCH', `/versions/${draft.versionId}`, EMPLOYEE, { purpose: 'x' })).statusCode,
    ).toBe(404);
    expect(
      (
        await req('PATCH', `/versions/${draft.versionId}`, ADMIN, {
          purpose: 'Buy at the right price with proper approval.',
        })
      ).statusCode,
    ).toBe(204);
  });

  it('requires a comment to return, then validates and makes the version current', async () => {
    expect((await act(draft.versionId, 'return')).statusCode).toBe(400);
    expect(
      (await act(draft.versionId, 'return', OWNER, 'Please add the RFQ thresholds')).statusCode,
    ).toBe(200);
    expect((await readiness(draft.versionId)).status).toBe('draft');
    expect((await act(draft.versionId, 'submit')).statusCode).toBe(200);
    expect((await act(draft.versionId, 'validate')).statusCode).toBe(200);

    const g = await graph(draft.versionId);
    expect(g.status).toBe('validated');
    expect(new Set(g.steps.map((s) => s.provenance))).toEqual(new Set(['confirmed']));
    const visible = (await req('GET', '/processes', EMPLOYEE)).json<ProcessListItem[]>();
    expect(visible.find((p) => p.id === draft.id)).toMatchObject({ status: 'validated' });

    const events = (await req('GET', `/versions/${draft.versionId}/history`, OWNER)).json<
      HistoryEvent[]
    >();
    expect(events.map((e) => e.action)).toEqual([
      'submitted',
      'returned',
      'submitted',
      'validated',
    ]);
    expect(events[1]!.comment).toBe('Please add the RFQ thresholds');
  });

  it('lets only admins approve, then locks the version', async () => {
    expect((await act(draft.versionId, 'approve', OWNER)).statusCode).toBe(403);
    expect((await act(draft.versionId, 'approve', ADMIN)).statusCode).toBe(200);
    expect((await graph(draft.versionId)).status).toBe('approved');
    const locked = await req('PATCH', `/versions/${draft.versionId}`, OWNER, {
      purpose: 'changed',
    });
    expect(locked.statusCode).toBe(409);
    expect(locked.json().title).toMatch(/Start a new version/);
  });

  it('creates a new version, compares it, and supersedes the old one on validation', async () => {
    const v1 = vendor.versionId;
    const created = await req('POST', `/versions/${v1}/new-version`, OWNER, {
      changeSummary: 'Automate bank verification',
    });
    expect(created.statusCode).toBe(201);
    const v2 = created.json<{ id: string; versionNumber: number }>();
    expect(v2.versionNumber).toBe(2);
    expect(
      (await req('POST', `/versions/${v1}/new-version`, OWNER, { changeSummary: 'again' }))
        .statusCode,
    ).toBe(409);

    const [g1, g2] = [await graph(v1), await graph(v2.id)];
    expect(g2.steps.map((s) => s.stepKey)).toEqual(g1.steps.map((s) => s.stepKey));
    expect(g2.edges).toHaveLength(g1.edges.length);
    const bank = g2.steps.find((s) => s.stepKey === 'S13')!;
    const ev = (await req('GET', `/versions/${v2.id}/evidence?entityId=${bank.id}`, OWNER)).json<
      EvidenceItem[]
    >();
    expect(ev.length).toBeGreaterThan(0); // provenance travelled with the copy

    await req('PATCH', `/versions/${v2.id}/steps/${bank.id}`, OWNER, {
      name: 'Verify bank details automatically',
      execution: 'automated',
    });
    const diff = (
      await req('GET', `/versions/${v2.id}/compare?with=${v1}`, OWNER)
    ).json<VersionDiff>();
    expect(diff.steps).toEqual([
      expect.objectContaining({
        stepKey: 'S13',
        change: 'changed',
        fields: expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
            before: 'Verify bank details',
            after: 'Verify bank details automatically',
          }),
        ]),
      }),
    ]);

    // The seeded process has an AI-inferred step; the owner must confirm it before validating.
    expect((await act(v2.id, 'submit')).statusCode).toBe(200);
    for (const b of (await readiness(v2.id)).blockers.filter((x) => x.blocking && x.kind === 'inferred')) {
      await req('POST', `/versions/${v2.id}/accept`, OWNER, { entityType: b.entityType, entityId: b.entityId });
    }
    expect((await act(v2.id, 'validate')).statusCode).toBe(200);
    const detail = (await req('GET', `/processes/${vendor.id}`, EMPLOYEE)).json<ProcessDetail>();
    expect(detail.defaultVersionId).toBe(v2.id);
    expect(detail.versions.find((v) => v.id === v1)!.status).toBe('archived');
  });

  it('lets admins assign owners and archive processes', async () => {
    const people = (await req('GET', '/users', ADMIN)).json<UserRef[]>();
    const employee = people.find((u) => u.email === EMPLOYEE)!;
    expect((await req('GET', '/users', OWNER)).statusCode).toBe(403);
    expect(
      (await req('PATCH', `/processes/${draft.id}`, OWNER, { ownerUserId: employee.id }))
        .statusCode,
    ).toBe(403);
    expect(
      (await req('PATCH', `/processes/${draft.id}`, ADMIN, { ownerUserId: employee.id }))
        .statusCode,
    ).toBe(204);
    expect(
      (await req('GET', '/processes?owner=me', EMPLOYEE))
        .json<ProcessListItem[]>()
        .map((p) => p.id),
    ).toEqual([draft.id]);

    expect((await req('POST', `/processes/${draft.id}/archive`, ADMIN, {})).statusCode).toBe(204);
    expect(
      (await req('GET', '/processes', EMPLOYEE))
        .json<ProcessListItem[]>()
        .some((p) => p.id === draft.id),
    ).toBe(false);
  });
});
