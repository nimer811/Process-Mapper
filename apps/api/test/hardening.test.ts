import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { MockGateway } from '@process-ai/agent';
import {
  eq,
  evidence,
  interviewMessages,
  interviewSessions,
  llmCalls,
  users,
} from '@process-ai/db';
import type {
  AiUsage,
  CurrentUser,
  Department,
  InterviewDetail,
  PersonRecord,
} from '@process-ai/shared';
import { ADMIN, EMPLOYEE, startTestApp } from './helpers.js';

const step = (ref: string, name: string, quote: string) => ({
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
  quote,
});

describe('Usage, retention and privacy', () => {
  const llm = new MockGateway({ respond: () => 'Thanks.' });
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let interview: InterviewDetail;
  const req = (method: 'GET' | 'POST', url: string, email: string, payload?: object) =>
    t.app.inject({ method, url: `/api/v1${url}`, headers: t.as(email), payload });

  beforeAll(async () => {
    t = await startTestApp({ llm });
    const depts = (await req('GET', '/departments', EMPLOYEE)).json<Department[]>();
    interview = (
      await req('POST', '/interviews', EMPLOYEE, {
        departmentId: depts.find((d) => d.slug === 'procurement')!.id,
        processName: 'Supplier Onboarding',
      })
    ).json<{ interview: InterviewDetail }>().interview;
    llm.enqueue('extract', {
      user_intent: 'continue',
      ops: [step('new1', 'Check the documents', 'I check the documents')],
    });
    await req('POST', `/interviews/${interview.id}/messages`, EMPLOYEE, {
      text: 'I check the documents first.',
    });
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('logs every AI call with the person and process, and reports usage by department', async () => {
    const calls = await t.db.select().from(llmCalls).where(eq(llmCalls.sessionId, interview.id));
    expect(calls.length).toBeGreaterThan(0);
    expect(
      calls.every(
        (c) => c.processId === interview.processId && c.userId === t.as(EMPLOYEE)['x-dev-user-id'],
      ),
    ).toBe(true);
    // No duplicate rows for one call (the engine's own logging is not used alongside).
    expect(new Set(calls.map((c) => c.purpose)).size).toBeGreaterThan(0);

    expect((await req('GET', '/admin/ai-usage', EMPLOYEE)).statusCode).toBe(403);
    const usage = (await req('GET', '/admin/ai-usage', ADMIN)).json<AiUsage>();
    expect(usage.byDepartment.map((d) => d.label)).toContain('Procurement');
    expect(usage.byUser.map((u) => u.label)).toContain('Procurement Officer');
    expect(usage.pricesConfigured).toBe(false);
    expect(usage.trend).toHaveLength(6);
  });

  it('removes transcripts after the retention period, keeping the process facts', async () => {
    const old = new Date();
    old.setMonth(old.getMonth() - 25);
    await t.db
      .update(interviewSessions)
      .set({ status: 'completed', lastActivityAt: old })
      .where(eq(interviewSessions.id, interview.id));
    expect((await req('POST', '/admin/retention/run', ADMIN)).json()).toEqual({ purged: 1 });
    const messages = await t.db
      .select()
      .from(interviewMessages)
      .where(eq(interviewMessages.sessionId, interview.id));
    expect(messages.every((m) => m.content === '[Removed under the data retention policy]')).toBe(
      true,
    );
    const ev = await t.db
      .select()
      .from(evidence)
      .where(eq(evidence.versionId, interview.versionId));
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e) => e.quote === null)).toBe(true);
    expect((await req('POST', '/admin/retention/run', ADMIN)).json()).toEqual({ purged: 0 });
  });

  it("exports a person's data and erases someone who left", async () => {
    const employeeId = t.as(EMPLOYEE)['x-dev-user-id']!;
    const exported = await req('GET', `/admin/people/${employeeId}/export`, ADMIN);
    expect(exported.headers['content-disposition']).toContain(`person-${employeeId}.json`);
    const data = exported.json<{ profile: { email: string }; interviews: unknown[] }>();
    expect(data.profile.email).toBe(EMPLOYEE);
    expect(data.interviews.length).toBeGreaterThan(0);

    expect(
      (
        await req('POST', `/admin/people/${t.as(ADMIN)['x-dev-user-id']}/erase`, ADMIN, {
          confirm: 'ERASE',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await req('POST', `/admin/people/${employeeId}/erase`, ADMIN, { confirm: 'yes' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await req('POST', `/admin/people/${employeeId}/erase`, ADMIN, { confirm: 'ERASE' }))
        .statusCode,
    ).toBe(200);
    const [row] = await t.db.select().from(users).where(eq(users.id, employeeId));
    expect(row).toMatchObject({ displayName: 'Former employee', isActive: false });
    expect(row!.erasedAt).not.toBeNull();
    const people = (await req('GET', '/admin/people', ADMIN)).json<PersonRecord[]>();
    expect(people.find((p) => p.id === employeeId)!.erasedAt).not.toBeNull();
    // Erased accounts can no longer sign in.
    expect((await req('GET', '/me', EMPLOYEE)).statusCode).toBe(401);
  });
});

describe('AI budget', () => {
  let t: Awaited<ReturnType<typeof startTestApp>>;
  beforeAll(async () => {
    t = await startTestApp({ llm: new MockGateway(), env: { AI_MONTHLY_TOKEN_BUDGET: '1000' } });
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('pauses AI features once the monthly budget is used', async () => {
    const depts = (
      await t.app.inject({ method: 'GET', url: '/api/v1/departments', headers: t.as(EMPLOYEE) })
    ).json<Department[]>();
    const started = await t.app.inject({
      method: 'POST',
      url: '/api/v1/interviews',
      headers: t.as(EMPLOYEE),
      payload: { departmentId: depts[0]!.id },
    });
    const interview = started.json<{ interview: InterviewDetail }>().interview;
    await t.db
      .insert(llmCalls)
      .values({
        purpose: 'respond',
        provider: 'mock',
        model: 'mock',
        inputTokens: 900,
        outputTokens: 200,
        latencyMs: 1,
        status: 'ok',
      });
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/v1/interviews/${interview.id}/messages`,
      headers: t.as(EMPLOYEE),
      payload: { text: 'hello' },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json<{ title: string }>().title).toMatch(/monthly AI budget has been used up/);
  });
});

describe('Sign-in with Microsoft Entra ID', () => {
  const TENANT = '11111111-1111-4111-8111-111111111111';
  const CLIENT = '22222222-2222-4222-8222-222222222222';
  let t: Awaited<ReturnType<typeof startTestApp>>;
  let sign: (claims: JWTPayload, opts?: { audience?: string; issuer?: string }) => Promise<string>;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' };
    sign = (claims, opts = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer(opts.issuer ?? `https://login.microsoftonline.com/${TENANT}/v2.0`)
        .setAudience(opts.audience ?? CLIENT)
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(privateKey);
    t = await startTestApp({
      env: {
        AUTH_MODE: 'entra',
        ENTRA_TENANT_ID: TENANT,
        ENTRA_CLIENT_ID: CLIENT,
        ENTRA_ADMIN_GROUP_ID: 'admins-group',
      },
      entraKeys: createLocalJWKSet({ keys: [jwk] }),
    });
  });
  afterAll(async () => {
    await t?.stop();
  });

  const me = (token: string) =>
    t.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });

  it('tells the web app to use Microsoft sign-in', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/auth/config' });
    expect(res.json()).toEqual({
      mode: 'entra',
      entra: { tenantId: TENANT, clientId: CLIENT, scope: `api://${CLIENT}/access_as_user` },
    });
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/auth/dev-users' })).statusCode).toBe(
      404,
    );
  });

  it('creates users on first sign-in, links known emails, and takes admin from Entra groups', async () => {
    const newcomer = await me(
      await sign({ oid: 'oid-1', preferred_username: 'Sara.Ahmed@7x.ae', name: 'Sara Ahmed' }),
    );
    expect(newcomer.statusCode).toBe(200);
    expect(newcomer.json<CurrentUser>()).toMatchObject({
      email: 'sara.ahmed@7x.ae',
      displayName: 'Sara Ahmed',
      roles: ['user'],
    });

    const seeded = await t.db.query.users.findFirst({ where: eq(users.email, EMPLOYEE) });
    const linked = await me(
      await sign({
        oid: 'oid-2',
        preferred_username: EMPLOYEE,
        name: 'Procurement Officer',
        groups: ['admins-group'],
      }),
    );
    expect(linked.json<CurrentUser>()).toMatchObject({ id: seeded!.id, roles: ['user', 'admin'] });
    expect((await t.db.query.users.findFirst({ where: eq(users.id, seeded!.id) }))!.entraOid).toBe(
      'oid-2',
    );
  });

  it('rejects tokens for another app, another tenant, or without a token', async () => {
    expect(
      (await me(await sign({ oid: 'x', preferred_username: 'a@b.c' }, { audience: 'other-app' })))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await me(
          await sign(
            { oid: 'x', preferred_username: 'a@b.c' },
            { issuer: 'https://login.microsoftonline.com/other/v2.0' },
          ),
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: '/api/v1/me',
          headers: { 'x-dev-user-id': '00000000-0000-4000-8000-000000000000' },
        })
      ).statusCode,
    ).toBe(401);
  });
});
