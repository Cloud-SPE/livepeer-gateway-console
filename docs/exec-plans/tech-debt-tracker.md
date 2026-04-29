# Tech-debt tracker — livepeer-gateway-console

Append-only. Strike through items when resolved; do not delete.

## Surfaced by Plan 0001 (2026-04-28 — gateway-console MVP)

- **Chain ABIs need live verification.** `TicketBroker.getSenderInfo`
  (returns Sender struct + Reserve struct in one call) and the
  `BondingManager.getDelegator` 8-tuple shape were inferred from
  Livepeer's protocol contracts. Both will throw loudly on first
  contact with the real chain if the inference is wrong; needs a
  staging run against a real Arbitrum One RPC + a real deployment
  with at least one orchestrator in the pool. Files:
  `src/providers/chain/viem.ts` lines 38–82.

- **Composition-root files are coverage-excluded.** §7 ratcheted
  vitest to 75 % by excluding `src/runtime/http/server.ts`,
  `src/runtime/http/fastify-augmentation.ts`,
  `src/providers/http/fastify.ts`, and `src/providers/logger/pino.ts`.
  These should grow integration tests that boot the server (with a
  fake `ResolverClient` / `PayerDaemonClient` / `ChainReader`) so the
  exclusions can be removed. Spec:
  `vitest.config.ts` `coverage.exclude`.

- **Audit-poll watermark is in-memory.** On restart the worker
  re-fetches from `since=undefined` (no upper bound) and re-inserts
  events that already landed in `routing_observations`. Persisting
  the cursor to a tiny `state.kv` table (or reusing `audit_events` to
  derive `max(observedAt)` for a given source) would make the dedup
  durable across restarts. File: `src/runtime/workers/auditPoll.ts`.

- **`getReserveInfo` provider name is misleading.** The chain method
  the impl actually calls is `getSenderInfo`; the provider keeps the
  bootstrap-stub name to avoid scope creep. Worth renaming if/when
  another caller wants the same data. File:
  `src/providers/chain/viem.ts` `ChainReader.getReserveInfo`.

- ~~**buf-generated stubs are gitignored.** Fresh clones must run
  `npm run proto:gen` before `npm run build`/`test`/`typecheck`.~~ —
  Resolved 2026-04-29: `gen/` is now committed; CI doesn't need the
  sibling repo. The `proto:check` script (re-run + `git diff --exit-code`)
  is the drift guard; run it locally before pushing if you've edited a
  daemon proto upstream.

## Surfaced by major-version sweep (2026-04-29 — zod 4 / vitest 4 / vite 8 / better-sqlite3 12)

- **Coverage `branches` floor softened to 70%.** Vitest 4's v8
  instrumentation tightened branch counting (~3 percentage points
  fewer branches covered for the same code vs vitest 1). Lines /
  statements / functions stayed at 75. Plan: add 4–5 targeted
  branch-coverage tests to push the absolute number back over 75 %,
  then ratchet the threshold back up. Highest-leverage targets: the
  optional-field spread paths in `handleListAuditLog`,
  `handleListResolverAuditLog`, `handleGetSenderEscrow` (each
  currently at 50 % branches).
