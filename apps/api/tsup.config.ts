import { defineConfig } from 'tsup';

// Bundle the API together with workspace packages (they ship as TS source).
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@process-ai\//],
});
