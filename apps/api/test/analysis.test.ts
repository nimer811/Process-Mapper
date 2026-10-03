import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockGateway } from '@process-ai/agent';
import type {
  AnalyseResult,
  Findings,
  ProcessListItem,
  Readiness,
  VersionGraph,
} from '@process-ai/shared';
import { ADMIN, EMPLOYEE, OWNER, startTestApp } from './helpers.js';

describe('improvement analysis', () => {
  const llm = new MockGateway();
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let vendor: ProcessListItem;
  let draft: ProcessListItem;

  beforeAll(async () => {
    t = await startTestApp({ llm });
    const all = (
      await t.app.inject({ method: 'GET', url: '/api/v1/processes', headers: t.as(OWNER) })
    ).json<ProcessListItem[]>();
    vendor = all.find((p) => p.slug === 'vendor-onboarding')!;
    draft = all.find((p) => p.status === 'draft')!;
  });
  afterAll(async () => {
    await t?.stop();
  });

  const req = (method: 'GET' | 'POST' | 'PATCH', url: string, email: string, payload?: object) =>
    t.app.inject({ method, url: `/api/v1${url}`, headers: t.as(email), payload });
  const analyse = async (ai: boolean, email = OWNER) =>
    req('POST', `/versions/${vendor.versionId}/analyse`, email, { ai });

  it('lets anyone view findings but only owners/admins run analysis', async () => {
    const view = (
      await req('GET', `/versions/${vendor.versionId}/findings`, EMPLOYEE)
    ).json<Findings>();
    expect(view).toMatchObject({
      issues: [],
      opportunities: [],
      canManage: false,
      aiAvailable: true,
    });
    expect((await analyse(false, EMPLOYEE)).statusCode).toBe(403);
  });

  it('runs rule checks: pain points, rework, review/AI and integration opportunities', async () => {
    const before = (await req('GET', `/versions/${vendor.versionId}`, OWNER)).json<VersionGraph>();
    const res = await analyse(false);
    expect(res.statusCode).toBe(200);
    const r = res.json<AnalyseResult>();
    const titles = r.issues.map((i) => i.title);
    expect(r.issues.find((i) => i.category === 'rework' && i.source === 'heuristic')?.title).toBe(
      'Rework loop back to Vendor submits documents',
    );
    expect(r.issues.filter((i) => i.source === 'user')).toHaveLength(4); // the four pain points
    expect(titles.some((x) => /steps have no SLA/.test(x))).toBe(true);
    const kinds = r.opportunities.map((o) => `${o.kind}:${o.title}`);
    expect(kinds).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^integration:.*Create vendor master record/),
        expect.stringMatching(/^ai:/),
      ]),
    );
    expect(r.opportunities[0]!.impact).toBe('high'); // quick wins / high impact first

    // Recommendations never touch the documented process.
    const after = (await req('GET', `/versions/${vendor.versionId}`, OWNER)).json<VersionGraph>();
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.steps).toEqual(before.steps);
  });

  it('keeps decisions across re-runs and does not resurrect dismissed items', async () => {
    const first = (
      await req('GET', `/versions/${vendor.versionId}/findings`, OWNER)
    ).json<Findings>();
    const target = first.issues.find((i) => i.source === 'heuristic')!;
    expect(
      (
        await req('PATCH', `/issues/${target.id}`, OWNER, {
          status: 'dismissed',
          note: 'Known and accepted',
        })
      ).statusCode,
    ).toBe(204);
    const opp = first.opportunities[0]!;
    await req('PATCH', `/opportunities/${opp.id}`, ADMIN, { status: 'accepted' });

    const again = (await analyse(false)).json<AnalyseResult>();
    expect(again.issues).toHaveLength(first.issues.length);
    expect(again.issues.find((i) => i.id === target.id)).toMatchObject({
      status: 'dismissed',
      decisionNote: 'Known and accepted',
      decidedBy: { email: OWNER },
    });
    expect(again.opportunities.find((o) => o.id === opp.id)!.status).toBe('accepted');
  });

  it('adds AI suggestions, ignoring unknown step keys, and replaces only undecided ones on re-run', async () => {
    llm.enqueue('analyse', {
      issues: [
        {
          step: 'S13',
          category: 'manual_work',
          severity: 'medium',
          title: 'Manual bank call-backs',
          description: 'Call-backs may take days for overseas vendors.',
        },
      ],
      opportunities: [
        {
          step: 'S99',
          kind: 'ai',
          title: 'AI document extraction',
          description: 'Extract fields from trade licences.',
          expected_benefit: 'Faster review',
          impact: 'high',
          effort: 'low',
        },
      ],
    });
    const r = (await analyse(true)).json<AnalyseResult>();
    expect(r.aiError).toBeNull();
    const aiIssue = r.issues.find((i) => i.source === 'ai')!;
    expect(aiIssue.stepId).not.toBeNull();
    const aiOpp = r.opportunities.find((o) => o.source === 'ai')!;
    expect(aiOpp.stepId).toBeNull(); // S99 doesn't exist
    // Accepted items list first; among proposals, quick wins (high impact, low effort) lead.
    expect(r.opportunities.filter((o) => o.status === 'proposed')[0]!.id).toBe(aiOpp.id);
    await req('PATCH', `/issues/${aiIssue.id}`, OWNER, { status: 'accepted' });

    llm.enqueue('analyse', { issues: [], opportunities: [] });
    const rerun = (await analyse(true)).json<AnalyseResult>();
    expect(rerun.issues.find((i) => i.id === aiIssue.id)?.status).toBe('accepted');
    expect(rerun.opportunities.some((o) => o.id === aiOpp.id)).toBe(false);
  });

  it('reports AI failures without losing the rule checks', async () => {
    llm.enqueue('analyse', new Error('timeout'));
    const r = (await analyse(true)).json<AnalyseResult>();
    expect(r.aiError).toMatch(/AI analysis failed/);
    expect(r.issues.some((i) => i.source === 'heuristic')).toBe(true);
  });

  it('lets owners record their own issues', async () => {
    const res = await req('POST', `/versions/${vendor.versionId}/issues`, OWNER, {
      stepId: null,
      category: 'handoff_delay',
      severity: 'high',
      title: 'Requesters chase status by phone',
      description: 'There is no status visibility for requesters.',
    });
    expect(res.statusCode).toBe(201);
    const f = (
      await req('GET', `/versions/${vendor.versionId}/findings`, EMPLOYEE)
    ).json<Findings>();
    expect(f.issues.find((i) => i.title === 'Requesters chase status by phone')).toMatchObject({
      source: 'manual',
      status: 'accepted',
    });
  });

  it('runs rule checks automatically when a version is validated', async () => {
    await req('POST', `/versions/${draft.versionId}/transitions`, OWNER, { action: 'submit' });
    const r = (await req('GET', `/versions/${draft.versionId}/readiness`, OWNER)).json<Readiness>();
    for (const b of r.blockers.filter((x) => x.blocking && x.kind === 'inferred')) {
      await req('POST', `/versions/${draft.versionId}/accept`, OWNER, {
        entityType: b.entityType,
        entityId: b.entityId,
      });
    }
    expect(
      (await req('POST', `/versions/${draft.versionId}/transitions`, OWNER, { action: 'validate' }))
        .statusCode,
    ).toBe(200);
    const f = (await req('GET', `/versions/${draft.versionId}/findings`, OWNER)).json<Findings>();
    expect(f.issues.length).toBeGreaterThan(0);
  });
});
