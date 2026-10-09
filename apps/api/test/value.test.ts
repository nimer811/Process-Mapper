import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockGateway } from '@process-ai/agent';
import type { ProcessListItem, ValueView, VersionGraph } from '@process-ai/shared';
import { EMPLOYEE, OWNER, startTestApp } from './helpers.js';

describe('Timings and value', () => {
  const llm = new MockGateway();
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let v: string;
  let graph: VersionGraph;
  const req = (method: 'GET' | 'POST' | 'PUT', url: string, email: string, payload?: object) =>
    t.app.inject({ method, url: `/api/v1${url}`, headers: t.as(email), payload });

  beforeAll(async () => {
    t = await startTestApp({ llm });
    const vendor = (await req('GET', '/processes', OWNER))
      .json<ProcessListItem[]>()
      .find((p) => p.slug === 'vendor-onboarding')!;
    v = vendor.versionId;
    graph = (await req('GET', `/versions/${v}`, OWNER)).json<VersionGraph>();
    await req('POST', `/versions/${v}/analyse`, OWNER, { ai: false });
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('computes timings from the map, and lets only the owner change figures', async () => {
    const value = (await req('GET', `/versions/${v}/value`, EMPLOYEE)).json<ValueView>();
    expect(value.steps.length).toBe(
      graph.steps.filter((s) => s.type !== 'start' && s.type !== 'end').length,
    );
    expect(value.canEstimate).toBe(false);
    expect(value.opportunities.length).toBeGreaterThan(0);

    const step = value.steps[0]!;
    expect(
      (
        await req('PUT', `/versions/${v}/value/figures`, EMPLOYEE, {
          stepId: step.stepId,
          effortMinutes: 20,
        })
      ).statusCode,
    ).toBe(403);
    const set = await req('PUT', `/versions/${v}/value/figures`, OWNER, {
      stepId: step.stepId,
      effortMinutes: 20,
    });
    expect(set.statusCode).toBe(200);
    expect(set.json<ValueView>().steps[0]!.effort).toEqual({ value: 20, source: 'owner' });
    const vol = (
      await req('PUT', `/versions/${v}/value/figures`, OWNER, { stepId: null, volumePerMonth: 50 })
    ).json<ValueView>();
    expect(vol.volumePerMonth).toEqual({ value: 50, source: 'owner' });
    expect(vol.effortHoursPerMonth).not.toBeNull();
  });

  it('fills gaps with AI estimates, never overriding the owner', async () => {
    const value = (await req('GET', `/versions/${v}/value`, OWNER)).json<ValueView>();
    expect(value.canEstimate).toBe(true);
    const [first, second] = value.steps;
    llm.enqueue('analyse', {
      steps: [
        {
          step_key: first!.stepKey,
          effort_minutes: 999,
          duration_minutes: null,
          reasoning: 'ignored: owner set it',
        },
        {
          step_key: second!.stepKey,
          effort_minutes: 15,
          duration_minutes: 240,
          reasoning: 'A quick check.',
        },
        { step_key: 'S99', effort_minutes: 5, duration_minutes: 5, reasoning: 'unknown step' },
      ],
      volume_per_month: 80,
      volume_reasoning: 'ignored: owner set it',
    });
    const res = await req('POST', `/versions/${v}/value/estimate`, OWNER);
    expect(res.statusCode).toBe(200);
    const after = res.json<ValueView>();
    expect(after.steps[0]!.effort).toEqual({ value: 20, source: 'owner' });
    expect(after.steps[1]!.effort).toEqual({ value: 15, source: 'ai' });
    expect(after.volumePerMonth).toEqual({ value: 50, source: 'owner' });
    // Clearing the owner's figure falls back to what is known.
    const cleared = (
      await req('PUT', `/versions/${v}/value/figures`, OWNER, {
        stepId: first!.stepId,
        effortMinutes: null,
      })
    ).json<ValueView>();
    expect(cleared.steps[0]!.effort.source).not.toBe('owner');
  });
});
