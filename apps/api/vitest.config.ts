import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests start a real Postgres container.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
