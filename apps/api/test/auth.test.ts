import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEV_USER_HEADER, type DevUser } from '@process-ai/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { startTestDb } from './setup-db.js';

describe('auth (dev mode) and health', () => {
  let testDb: Awaited<ReturnType<typeof startTestDb>>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    testDb = await startTestDb();
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'unused',
      AUTH_MODE: 'dev',
      LOG_LEVEL: 'fatal',
    });
    app = await buildApp({ config, db: testDb.db });
  });

  afterAll(async () => {
    await app?.close();
    await testDb?.stop();
  });

  it('reports readiness when the database is reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
  });

  it('rejects /me without a user as problem details', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ status: 401, title: 'Sign in required' });
  });

  it('lists seeded dev users and resolves /me for the selected one', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/auth/dev-users' });
    expect(list.statusCode).toBe(200);
    const devUsers = list.json<DevUser[]>();
    const admin = devUsers.find((u) => u.email === 'admin@processai.local');
    expect(admin?.roles).toContain('admin');

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { [DEV_USER_HEADER]: admin!.id },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: 'admin@processai.local', displayName: 'Dev Admin' });
  });

  it('ignores a malformed dev user header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { [DEV_USER_HEADER]: 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('refuses dev auth in production', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'x', AUTH_MODE: 'dev' }),
    ).toThrow(/not allowed in production/);
  });
});
