import { DEV_USER_HEADER, type DevUser } from '@process-ai/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { startTestDb } from './setup-db.js';

/** Boots the API against a fresh test database and resolves seeded users by email. */
export async function startTestApp() {
  const testDb = await startTestDb();
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'unused',
    AUTH_MODE: 'dev',
    LOG_LEVEL: 'fatal',
  });
  const app = await buildApp({ config, db: testDb.db });
  const devUsers = (
    await app.inject({ method: 'GET', url: '/api/v1/auth/dev-users' })
  ).json<DevUser[]>();

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
