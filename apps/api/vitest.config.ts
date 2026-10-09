import { defineConfig } from 'vitest/config';

const ci = process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  test: {
    // Integration tests start a real Postgres container.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // CI runners are small: start fewer containers at once, and report failures as annotations.
    ...(ci && { maxWorkers: 2, reporters: ['default', 'github-actions'] }),
  },
});
