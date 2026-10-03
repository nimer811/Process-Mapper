import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockGateway } from '@process-ai/agent';
import type {
  AnalyseResult,
  DesignDetail,
  ProcessDetail,
  ProcessListItem,
  Readiness,
  VersionGraph,
} from '@process-ai/shared';
import { ADMIN, EMPLOYEE, OWNER, startTestApp } from './helpers.js';

describe('To-Be design', () => {
  const llm = new MockGateway();
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let vendor: ProcessListItem;
  let opportunityId: string;
  let toBeId: string;
  const req = (method: 'GET' | 'POST' | 'PATCH', url: string, email: string, payload?: object) =>
    t.app.inject({ method, url: `/api/v1${url}`, headers: t.as(email), payload });
  const graph = async (id: string) =>
    (await req('GET', `/versions/${id}`, OWNER)).json<VersionGraph>();

  beforeAll(async () => {
    t = await startTestApp({ llm });
    vendor = (await req('GET', '/processes', OWNER))
      .json<ProcessListItem[]>()
      .find((p) => p.slug === 'vendor-onboarding')!;
    const r = (
      await req('POST', `/versions/${vendor.versionId}/analyse`, OWNER, { ai: false })
    ).json<AnalyseResult>();
    opportunityId = r.opportunities.find((o) => o.kind === 'self_service')!.id;
    await req('PATCH', `/opportunities/${opportunityId}`, OWNER, { status: 'accepted' });
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('is offered to owners on the current As-Is only', async () => {
    expect(
      (await req('GET', `/versions/${vendor.versionId}/readiness`, OWNER)).json<Readiness>()
        .canDesignToBe,
    ).toBe(true);
    expect(
      (await req('GET', `/versions/${vendor.versionId}/readiness`, EMPLOYEE)).json<Readiness>()
        .canDesignToBe,
    ).toBe(false);
    expect(
      (
        await req('POST', `/versions/${vendor.versionId}/to-be`, EMPLOYEE, {
          opportunityIds: [opportunityId],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await req('POST', `/versions/${vendor.versionId}/to-be`, OWNER, { opportunityIds: [] }))
        .statusCode,
    ).toBe(400);
  });

  it('creates a To-Be draft from AI-designed changes, leaving the As-Is untouched', async () => {
    const asIsBefore = await graph(vendor.versionId);
    llm.enqueue('design', {
      summary:
        'Vendors complete a guided online form with automatic checks, so incomplete submissions are caught before review.',
      expected_benefits: ['Fewer rework loops', 'Faster onboarding'],
      changes: [
        {
          op: 'add_step',
          ref: 'new1',
          type: 'task',
          name: 'Automatic completeness check',
          description: null,
          actor: null,
          systems: ['Supplier Portal'],
          execution: 'automated',
          sla: 'Immediate',
          after: 'S7',
          before: null,
          rationale: 'Catch missing documents at submission.',
          opportunity: 'O1',
        },
        {
          op: 'modify_step',
          step: 'S13',
          name: null,
          type: null,
          description: null,
          actor: null,
          systems: null,
          execution: 'semi_automated',
          sla: '1 business day',
          expected_duration: null,
          approval_authority: null,
          rationale: 'Track call-backs in a workflow.',
          opportunity: null,
        },
        { op: 'remove_step', step: 'S99', rationale: 'Nonsense', opportunity: null },
      ],
    });
    const res = await req('POST', `/versions/${vendor.versionId}/to-be`, OWNER, {
      opportunityIds: [opportunityId],
      goals: 'Keep the bank call-back control.',
    });
    expect(res.statusCode).toBe(201);
    const created = res.json<{
      id: string;
      versionNumber: number;
      applied: number;
      skipped: number;
    }>();
    expect(created).toMatchObject({ versionNumber: 1, applied: 2, skipped: 1 });
    toBeId = created.id;

    const toBe = await graph(toBeId);
    expect(toBe).toMatchObject({ kind: 'to_be', status: 'draft' });
    const check = toBe.steps.find((s) => s.name === 'Automatic completeness check')!;
    expect(check).toMatchObject({ stepKey: 'S16', execution: 'automated', provenance: 'inferred' });
    const s7 = toBe.steps.find((s) => s.stepKey === 'S7')!;
    const s8 = toBe.steps.find((s) => s.stepKey === 'S8')!;
    // Inserted between S7 and its next step S8.
    expect(toBe.edges.some((e) => e.fromStepId === s7.id && e.toStepId === check.id)).toBe(true);
    expect(toBe.edges.some((e) => e.fromStepId === check.id && e.toStepId === s8.id)).toBe(true);
    expect(toBe.edges.some((e) => e.fromStepId === s7.id && e.toStepId === s8.id)).toBe(false);
    expect(toBe.steps.find((s) => s.stepKey === 'S13')).toMatchObject({
      execution: 'semi_automated',
      provenance: 'inferred',
    });

    // As-Is untouched and still current.
    expect(await graph(vendor.versionId)).toEqual(asIsBefore);
    const detail = (await req('GET', `/processes/${vendor.id}`, EMPLOYEE)).json<ProcessDetail>();
    expect(detail.defaultVersionId).toBe(vendor.versionId);
  });

  it('explains every change with its rationale and opportunity', async () => {
    const d = (await req('GET', `/versions/${toBeId}/design`, OWNER)).json<DesignDetail>();
    expect(d.basedOn).toMatchObject({ id: vendor.versionId, versionNumber: 1 });
    expect(d.goals).toBe('Keep the bank call-back control.');
    expect(d.summary).toContain('Expected benefits:\n• Fewer rework loops');
    expect(d.changes.map((c) => [c.changeType, c.stepKey])).toEqual([
      ['added', 'S16'],
      ['modified', 'S13'],
    ]);
    expect(d.changes[0]!.opportunity?.id).toBe(opportunityId);
    expect(d.changes[1]!.description).toMatch(/execution → semi automated; SLA → 1 business day/);
    expect((await req('GET', `/versions/${vendor.versionId}/design`, OWNER)).statusCode).toBe(404);
  });

  it('allows one To-Be in progress, requires confirming AI changes, and never replaces the As-Is', async () => {
    expect(
      (
        await req('POST', `/versions/${vendor.versionId}/to-be`, OWNER, {
          opportunityIds: [opportunityId],
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await req('GET', `/versions/${vendor.versionId}/readiness`, OWNER)).json<Readiness>()
        .canDesignToBe,
    ).toBe(false);
    // An As-Is new version is still possible alongside the To-Be.
    expect(
      (await req('GET', `/versions/${vendor.versionId}/readiness`, OWNER)).json<Readiness>()
        .canCreateVersion,
    ).toBe(true);

    await req('POST', `/versions/${toBeId}/transitions`, OWNER, { action: 'submit' });
    const r = (await req('GET', `/versions/${toBeId}/readiness`, OWNER)).json<Readiness>();
    const inferred = r.blockers.filter((b) => b.kind === 'inferred');
    expect(inferred.length).toBeGreaterThanOrEqual(3); // new step, its connections, modified step
    for (const b of r.blockers.filter((x) => x.blocking && x.entityId && x.kind === 'inferred')) {
      await req('POST', `/versions/${toBeId}/accept`, OWNER, {
        entityType: b.entityType,
        entityId: b.entityId,
      });
    }
    expect(
      (await req('POST', `/versions/${toBeId}/transitions`, OWNER, { action: 'validate' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await req('POST', `/versions/${toBeId}/transitions`, ADMIN, { action: 'approve' }))
        .statusCode,
    ).toBe(200);

    const detail = (await req('GET', `/processes/${vendor.id}`, EMPLOYEE)).json<ProcessDetail>();
    expect(detail.defaultVersionId).toBe(vendor.versionId);
    expect(detail.versions.find((v) => v.id === vendor.versionId)!.status).toBe('approved');
    expect(detail.versions.find((v) => v.id === toBeId)).toMatchObject({
      kind: 'to_be',
      status: 'approved',
    });
  });
});
