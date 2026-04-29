import { defineConfig } from "vitest/config";

// Coverage gate: 75% across lines/branches/functions/statements (org standard,
// inherited from sibling consoles per livepeer-modules-project plan 0011 §A).
// Seeded at 0 during bootstrap; per-repo Plan 0001 §1 ratchets to 75 once the
// real handler + service tests land.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "bridge-ui/**/*.test.js"],
    // Default to node-env; bridge-ui SPA tests opt into happy-dom per-file
    // via `// @vitest-environment happy-dom`. Keeps backend tests fast.
    environment: "node",
    globals: false,
    reporters: "default",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/index.ts",
        "src/main.ts",
        "src/scripts/**",
        "src/providers/payerDaemon/gen/**",
        "src/providers/resolver/gen/**",
        // Pure composition-root + thin library wrappers; verified by
        // integration in real deployments, not by unit tests. See
        // Plan 0001 §7 decisions-log for the exclusion rationale.
        "src/runtime/http/server.ts",
        "src/runtime/http/fastify-augmentation.ts",
        "src/providers/http/fastify.ts",
        "src/providers/logger/pino.ts",
        // Zod-schema-only files; their runtime behavior is exercised
        // by every handler's .parse() call rather than directly.
        "src/types/**",
      ],
      thresholds: {
        // Vitest 4's v8 coverage tightened branch counting vs vitest 1
        // (same code, ~3 percentage points fewer covered branches).
        // Lines / statements / functions stayed at the same instrumentation
        // shape, so they keep the 75% floor. Branches softened to 70%
        // until we add more targeted branch-coverage tests; see
        // docs/exec-plans/tech-debt-tracker.md.
        lines: 75,
        branches: 70,
        functions: 75,
        statements: 75,
      },
    },
  },
});
