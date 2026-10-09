import { DEV_USER_HEADER, type DevUser } from '@process-ai/shared';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LlmGateway } from '@process-ai/agent';
import type { JWTVerifyGetKey } from 'jose';
import { LocalFileStore } from '@process-ai/knowledge';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { startTestDb } from './setup-db.js';

/** Boots the API against a fresh test database and resolves seeded users by email. */
export async function startTestApp(
  opts: { llm?: LlmGateway | null; env?: Record<string, string>; entraKeys?: JWTVerifyGetKey } = {},
) {
  const testDb = await startTestDb();
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'unused',
    AUTH_MODE: 'dev',
    LOG_LEVEL: 'fatal',
    ...opts.env,
  });
  const store = new LocalFileStore(await mkdtemp(path.join(tmpdir(), 'process-ai-test-')));
  const app = await buildApp({
    config,
    db: testDb.db,
    llm: opts.llm ?? null,
    store,
    jobs: 'inline',
    entraKeys: opts.entraKeys,
  });
  const devUsers =
    config.AUTH_MODE === 'dev'
      ? (await app.inject({ method: 'GET', url: '/api/v1/auth/dev-users' })).json<DevUser[]>()
      : [];

  const as = (email: string) => {
    const user = devUsers.find((u) => u.email === email);
    if (!user) throw new Error(`No seeded user ${email}`);
    return { [DEV_USER_HEADER]: user.id };
  };

  return {
    app,
    db: testDb.db,
    as,
    stop: async () => {
      await app.close();
      await testDb.stop();
    },
  };
}

export const ADMIN = 'admin@processai.local';
export const OWNER = 'owner@processai.local';
export const EMPLOYEE = 'employee@processai.local';
