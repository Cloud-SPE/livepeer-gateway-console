import { defineConfig } from 'vitest/config';

// Coverage gate: 75% across lines/branches/functions/statements (org standard,
// inherited from sibling consoles per livepeer-modules-project plan 0011 §A).
// Seeded at 0 during bootstrap; per-repo Plan 0001 §1 ratchets to 75 once the
// real handler + service tests land.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'bridge-ui/**/*.test.js'],
    // Default to node-env; bridge-ui SPA tests opt into happy-dom per-file
    // via `// @vitest-environment happy-dom`. Keeps backend tests fast.
    environment: 'node',
    globals: false,
    reporters: 'default',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/main.ts',
        'src/scripts/**',
        'src/providers/payerDaemon/gen/**',
        'src/providers/resolver/gen/**',
      ],
      thresholds: {
        lines: 0,
        branches: 0,
        functions: 0,
        statements: 0,
      },
    },
  },
});
