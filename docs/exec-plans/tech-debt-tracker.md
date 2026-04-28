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

- **buf-generated stubs are gitignored.** Fresh clones must run
  `npm run proto:gen` before `npm run build`/`test`/`typecheck`. The
  proto path resolution depends on a sibling
  `livepeer-modules-project` checkout being present. CI / docker
  builds need to handle this; documenting the exact bootstrap dance
  on a clean machine is unfinished work. Files:
  `buf.gen.payments.yaml`, `buf.gen.registry.yaml`.
