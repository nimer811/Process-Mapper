import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Department, ProcessDetail, ProcessListItem, VersionGraph } from '@process-ai/shared';
import { ADMIN, EMPLOYEE, OWNER, startTestApp } from './helpers.js';

describe('process library API', () => {
  let t: Awaited<ReturnType<typeof startTestApp>>;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t?.stop();
  });

  const list = async (email: string, qs = '') => {
    const res = await t.app.inject({ method: 'GET', url: `/api/v1/processes${qs}`, headers: t.as(email) });
    expect(res.statusCode).toBe(200);
    return res.json<ProcessListItem[]>();
  };

  it('hides drafts from employees but shows them to the owner and admins', async () => {
    expect((await list(EMPLOYEE)).map((p) => p.name)).toEqual(['Vendor Onboarding']);
    expect((await list(OWNER)).map((p) => p.name)).toEqual([
      'Purchase Requisition to PO',
      'Vendor Onboarding',
    ]);
    expect(await list(ADMIN)).toHaveLength(2);
  });

  it('filters by department and status, and searches step names', async () => {
    expect(await list(ADMIN, '?department=finance')).toEqual([]);
    expect((await list(ADMIN, '?status=draft')).map((p) => p.slug)).toEqual([
      'purchase-requisition-to-po',
    ]);
    expect((await list(EMPLOYEE, '?q=bank')).map((p) => p.slug)).toEqual(['vendor-onboarding']);
    expect(await list(EMPLOYEE, '?q=quotation')).toEqual([]); // only in a draft the employee can't see
  });

  it('returns a branching version graph with typed edges', async () => {
    const [vendor] = await list(EMPLOYEE);
    const detail = (
      await t.app.inject({ method: 'GET', url: `/api/v1/processes/${vendor!.id}`, headers: t.as(EMPLOYEE) })
    ).json<ProcessDetail>();
    expect(detail.versions[0]).toMatchObject({ versionNumber: 1, status: 'approved' });

    const graph = (
      await t.app.inject({ method: 'GET', url: `/api/v1/versions/${detail.defaultVersionId}`, headers: t.as(EMPLOYEE) })
    ).json<VersionGraph>();
    expect(graph.steps).toHaveLength(15);
    const decisions = graph.steps.filter((s) => s.type === 'decision');
    for (const d of decisions) {
      expect(graph.edges.filter((e) => e.fromStepId === d.id).length).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(graph.edges.map((e) => e.type))).toEqual(
      new Set(['sequence', 'branch', 'exception', 'loop_back']),
    );
    const bank = graph.steps.find((s) => s.stepKey === 'S13')!;
    expect(bank.actor?.name).toBe('Accounts Payable');
    expect(graph.rules.some((r) => r.stepId === bank.id && r.provenance === 'documented')).toBe(true);
  });

  it("returns 404 for a draft version the user can't see", async () => {
    const [draft] = await list(OWNER, '?status=draft');
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/v1/versions/${draft!.versionId}`,
      headers: t.as(EMPLOYEE),
    });
    expect(res.statusCode).toBe(404);
  });

  it('lets only admins manage departments, with an audit trail', async () => {
    const body = { name: 'Finance', slug: 'finance' };
    const denied = await t.app.inject({ method: 'POST', url: '/api/v1/departments', headers: t.as(EMPLOYEE), payload: body });
    expect(denied.statusCode).toBe(403);

    const created = await t.app.inject({ method: 'POST', url: '/api/v1/departments', headers: t.as(ADMIN), payload: body });
    expect(created.statusCode).toBe(201);
    expect(created.json<Department>()).toMatchObject({ name: 'Finance', processCount: 0 });

    const dup = await t.app.inject({ method: 'POST', url: '/api/v1/departments', headers: t.as(ADMIN), payload: body });
    expect(dup.statusCode).toBe(409);

    const bad = await t.app.inject({ method: 'POST', url: '/api/v1/departments', headers: t.as(ADMIN), payload: { name: 'X', slug: 'Bad Slug' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().errors.length).toBeGreaterThan(0);

    const audit = await t.db.query.auditLog.findMany();
    expect(audit.map((a) => a.action)).toContain('department.created');
  });
});
