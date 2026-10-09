import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BestPractice, OwnershipView, ProcessListItem } from '@process-ai/shared';
import { ADMIN, EMPLOYEE, OWNER, startTestApp } from './helpers.js';

describe('Best practices and ownership checks', () => {
  let t: Awaited<ReturnType<typeof startTestApp>>;
  const req = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    email: string,
    payload?: object,
  ) => t.app.inject({ method, url: `/api/v1${url}`, headers: t.as(email), payload });

  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('seeds a starter library that admins can edit', async () => {
    const list = (await req('GET', '/best-practices', EMPLOYEE)).json<BestPractice[]>();
    expect(list.length).toBeGreaterThanOrEqual(10);
    expect(list.map((p) => p.title)).toContain('Separate supplier master data from payments');

    const body = {
      title: 'Dual sign-off above AED 5 million',
      statement: 'Spend above AED 5 million needs two approvers.',
      category: 'delegation_of_authority',
      keywords: ['aed'],
    };
    expect((await req('POST', '/best-practices', OWNER, body)).statusCode).toBe(403);
    const created = await req('POST', '/best-practices', ADMIN, body);
    expect(created.statusCode).toBe(201);
    const id = created.json<BestPractice>().id;
    expect(
      (await req('PATCH', `/best-practices/${id}`, ADMIN, { isActive: false })).json<BestPractice>()
        .isActive,
    ).toBe(false);
    expect((await req('DELETE', `/best-practices/${id}`, ADMIN)).statusCode).toBe(204);
  });

  it('shows the RACI and checks for a version', async () => {
    const vendor = (await req('GET', '/processes', OWNER))
      .json<ProcessListItem[]>()
      .find((p) => p.slug === 'vendor-onboarding')!;
    const view = (
      await req('GET', `/versions/${vendor.versionId}/ownership`, OWNER)
    ).json<OwnershipView>();
    expect(view.raci.length).toBeGreaterThan(5);
    expect(view.raci.every((r) => r.stepKey && 'accountable' in r)).toBe(true);
    // The demo process has no controls yet: the checks say so and point to the practice.
    const noControls = view.checks.find((c) => c.title === 'No controls recorded');
    expect(noControls).toMatchObject({
      kind: 'control_gap',
      practice: 'Every key rule has a control with evidence',
    });
    expect(view.checks.every((c) => ['high', 'medium', 'low'].includes(c.severity))).toBe(true);
  });
});
