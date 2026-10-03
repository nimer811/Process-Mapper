import { defineConfig } from 'tsup';

// Bundle the API with our workspace packages (they ship as TS source); every third-party package
// stays external and is loaded from node_modules at runtime (see the hoisted deploy in the Dockerfile).
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  skipNodeModulesBundle: true,
  noExternal: [/^@process-ai\//],
});
