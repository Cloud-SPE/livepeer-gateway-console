---
id: 0001
slug: gateway-console-mvp
title: Implement gateway-console MVP (routing dashboard, capability search, sender wallet+escrow, audit log, Refresh actions, periodic resolver-audit-log poll, viem chain provider)
status: completed
owner: agent
opened: 2026-04-28
closed: 2026-04-28
depends-on: livepeer-modules-project plan 0013 (bootstrap)
---

## Goal

Turn the bootstrap scaffold into a working v1 gateway-console: a gateway /
bridge operator can install via `docker compose up -d`, sign in, and see
the routing dashboard's central multi-pane layout populated with real orch
data sourced from the resolver socket plus chain enrichment. Capability
search returns concrete `Resolver.Select` outcomes; the sender screen
shows the hot-wallet balance + TicketBroker escrow snapshot from the
PayerDaemon; the audit log paginates real bearer-action rows; the two
`Refresh` buttons drive idempotent `Resolver.Refresh` calls.

This plan picks up where livepeer-modules-project plan 0013 left off
(repo bootstrapped with Fastify shell, Lit/Vite SPA shell, schema, the
two daemon-client provider stubs, and the viem chain-provider wiring).
All implementation work happens here in this repo.

## Non-goals

- Per-session payment history. Payment-daemon does not expose an
  audit-log RPC today (Plan 0013 §Non-goals); deferred to a future
  payment-daemon RPC + a v2 here.
- Multi-tenant dashboards. One console per gateway deployment.
- Worker / orch actuation. The `Refresh` writes are the only mutations.
- Periodic Prometheus polling of orchs. Resolver freshness markers are
  enough for v1.
- Postgres. SQLite only.
- Reverse proxy. Operator brings their own.
- OIDC / SSO / cookies. Bearer-token only.
- A second SPA. One operator role, one SPA.

## Approach

Six subsections, in build order. Each lands its own commits.

### 1. Daemon-client gRPC plumbing (real `@grpc/grpc-js`)

- [x] `src/providers/resolver/client.ts` — replace the stub with a real
      `@grpc/grpc-js` client speaking against the unix socket
      `RESOLVER_SOCKET_PATH`. Use the buf-generated `gen/` stubs.
      Wire `ListKnown`, `ResolveByAddress`, `Select`, `Refresh`,
      `GetAuditLog`. Tight per-call deadline (2s default).
- [x] `src/providers/payerDaemon/client.ts` — same shape against
      `SENDER_SOCKET_PATH`. Wires `GetDepositInfo` (the only RPC the
      console actually uses). Wallet-info surface is **not** exposed by
      the daemon proto and is deferred to §4 via ChainReader +
      `SENDER_ADDRESS` env.
- [x] Unit tests for both clients with a stand-up of a fake gRPC server
      over a tmp socket.

### 2. viem chain provider impls

- [x] `bondingManagerListPool` — Controller →
      `getContract("BondingManager")` (already implemented), then walk
      `getFirstTranscoderInPool` / `getNextTranscoderInPool` /
      `getDelegator`. Return a typed `BondingPoolEntry[]`.
- [x] `getReserveInfo(sender)` — Controller →
      `getContract("TicketBroker")`, then `getSenderInfo(sender)` (the
      contract method that returns BOTH deposit and reserve in one
      call; the plan said `getReserveInfo` but that on-chain call only
      returns reserve breakdown — using `getSenderInfo` keeps the
      provider's `{depositWei, reserveWei}` shape honest).
- [x] `readServiceUri(orchAddress)` — Controller →
      `getContract("ServiceRegistry")` (already implemented), then
      `getServiceURI(orch)`.
- [x] Tests stub the viem client; live-RPC verification belongs in
      staging.

### 3. Routing dashboard backend

- [x] `service/routing/listOrchs` — combine resolver `ListKnown` with
      chain enrichment (BondingManager pool walk for active-set + stake;
      ServiceRegistry serviceURI per orch). Cache the chain reads with a
      configurable TTL (env: `CHAIN_READ_TTL_SEC`, default 30s).
- [x] `service/routing/getOrch` — same enrichment for the single-orch
      drilldown; pull recent observations from the local mirror.
- [x] Handlers `handleGetOrch`, `handleCapabilitySearch`. Schemas in
      `src/types/routing.ts` (already present; extend as needed).

### 4. Sender wallet + escrow

- [x] `service/sender` — chain-balance via `ChainReader.getBalance`
      against `SENDER_ADDRESS` (the daemon proto exposes neither
      identity nor balance, so chain is the only path). Escrow stays
      on `PayerDaemon.GetDepositInfo`.
- [x] Handlers `handleGetSenderWallet`, `handleGetSenderEscrow`. The
      wallet handler returns `503 wallet_not_configured` when
      `SENDER_ADDRESS` is unset rather than crashing.

### 5. Audit log + Refresh actions

- [x] Handlers for `/api/audit-log`, `/api/resolver/audit-log`,
      `POST /api/resolver/refresh`, `POST /api/resolver/refresh/:address`.
- [x] Audit-event append on every `Refresh` write — both the success
      path and the failure path append a row attributed to `req.actor`
      (the failure row carries the underlying error message).

### 6. routing_observations hydration loop

- [x] Background worker that polls `Resolver.GetAuditLog` on a
      configurable cadence (env: `RESOLVER_AUDIT_POLL_INTERVAL_SEC`,
      default 30s) and bulk-inserts into `routing_observations`.
      Single-flight: a tick that's still running blocks the next
      interval. `intervalMs=0` disables the worker entirely.
- [x] De-dup by an upstream cursor (since-watermark) so we don't
      double-record entries across polls. Watermark is in-memory
      (`max(occurredAt) + 1ms`); failures don't poison it. Resolver-
      level events with no orch address are skipped.

### 7. SPA shells (the dashboard itself)

- [x] `<admin-routing>` — central multi-pane: filter row, orch roster
      with click-to-drilldown rows, inline detail card showing
      capabilities/models/stake plus routing-observation history,
      Refresh-all button (with `confirm()`).
- [x] `<admin-orch-detail>` — direct-link drilldown
      (`#/orchs/0xabc...`); reuses the same observations history.
- [x] `<admin-capabilities>` — search form + `Resolver.Select` result
      table with picked-node highlight + reason.
- [x] `<admin-sender>` — wallet card + escrow card (parallel loads;
      `503 wallet_not_configured` renders a hint instead of an error).
- [x] `<admin-audit>` — cursor-paginated table; "Older →" derives
      next cursor from the last row id.
- [x] Coverage threshold ratchet from 0 → 75 once tests across §1–§5
      land. Achieved at 96.98% / 76.44% / 97.22% / 96.98% with three
      composition-root files + `src/types/**` excluded; rationale in
      decisions log.

## Decisions log

### 2026-04-28 — Bootstrap from livepeer-modules-project plan 0013

Plan 0013 covered the cross-repo bootstrap; this Plan 0001 starts the
per-repo MVP work. Stack, layout, and conventions inherited from the
bootstrap and from `livepeer-orch-coordinator`'s Plan 0001.

### 2026-04-28 — Actor attribution via `X-Actor` header

Inherited from sibling consoles. The login screen captures an "operator
handle"; SPA sends it on every `/api/*` request via `X-Actor`. Server
Zod-validates against `^[a-z0-9._-]{1,64}$`. Already wired in the
bootstrap.

### 2026-04-28 — Coverage ratchet excludes wiring + Zod-only files

Reason: §7 calls for a 0 → 75 ratchet. Achieved at 96.98% statements
/ 76.44% branches / 97.22% funcs / 96.98% lines after excluding four
file groups:
- `src/runtime/http/server.ts` — composition root that wires every
  service into Fastify routes. Verified by integration in real
  deployments; unit testing it would mean booting the whole stack.
- `src/runtime/http/fastify-augmentation.ts` — type-only declaration
  merge; no runtime code.
- `src/providers/http/fastify.ts` and
  `src/providers/logger/pino.ts` — thin wrappers around fastify and
  pino. Their behavior is the libraries' behavior; testing them is
  testing the libraries.
- `src/types/**` — Zod-schema-only files. Their runtime behavior is
  exercised by every handler's `.parse()` call rather than directly.

Anything outside those exclusions is genuinely tested.

### 2026-04-28 — `SENDER_ADDRESS` is optional; wallet returns 503 when unset

Reason: not every gateway-console deployment has a configured hot
wallet on day one (e.g. operators bringing up the stack against a
test daemon). Making `SENDER_ADDRESS` required would block
`/healthz`-style boot. Instead the env var is optional, the sender
service throws `SenderWalletNotConfiguredError` on `getWallet()`, and
the handler maps that to `503 wallet_not_configured` so the SPA can
render a "set SENDER_ADDRESS to view wallet" tile rather than an
opaque 500. Escrow continues to work because it doesn't need an
address — the daemon already knows whose escrow to look up.

### 2026-04-28 — Chain-read TTL cache lives in routing service, not provider

Reason: §3 calls for memoizing the BondingManager pool walk +
ServiceRegistry serviceURI reads. The cache is plumbed through
`createRoutingService` (taking `chainReadTtlMs`) rather than wrapped
inside `providers/chain/viem.ts`. Keeps the provider thin and pure
(one viem call → one chain read), and lets the service compose the
right caching boundary for its own access pattern. Failed reads are
*not* cached so a single flaky RPC doesn't poison the next 30 seconds
of dashboard hits.

### 2026-04-28 — `getReserveInfo` chain call → `getSenderInfo`

Reason: the plan literal says "TicketBroker → `getReserveInfo(sender)`",
but on-chain that method returns only the reserve struct
(`fundsRemaining`, `claimedInCurrentRound`) — not the deposit. The
provider's `ReserveInfo` interface promises both `depositWei` and
`reserveWei`. `TicketBroker.getSenderInfo(sender)` returns the Sender
struct (with `deposit`) AND the Reserve struct in one call, so the
implementation calls `getSenderInfo` and maps both fields.

### 2026-04-28 — Sender wallet view dropped from PayerDaemon provider

Reason: the bootstrap stub's `getWalletInfo()` had no proto backing —
PayerDaemon exposes `StartSession` / `CreatePayment` / `CloseSession`
/ `GetDepositInfo` and nothing else. The plan §1 already anticipated
this ("if not present, infer balance from chain via ChainReader and
only call `GetDepositInfo` from the daemon"). Provider now exposes
only `getDepositInfo()` + a `ping()` backed by it (PayerDaemon has no
Health RPC). `service/sender/getWallet()` throws
`SenderWalletNotConfiguredError` until §4 wires `SENDER_ADDRESS` env
+ `ChainReader.getBalance`. `getEscrow()` continues to work today.

### 2026-04-28 — Resolver provider `KnownOrch` reshaped to match proto

Reason: the bootstrap stub's `KnownOrch` shape included `serviceUri`,
`capabilities`, `models`, and `signatureStatus`, none of which the
proto's `ListKnown` actually returns — those fields live on
`ResolveResult.nodes[]` (per-orch) or come from chain reads
(`serviceURI` from `ServiceRegistry`). With the real `@grpc/grpc-js`
client wired in §1, `KnownOrch` now mirrors `KnownEntry` (address,
mode, freshnessStatus, cachedAt) and `ResolveByAddress` returns a new
richer `ResolvedOrch` carrying `nodes[]`. `service/routing/listOrchs`
now returns sparse roster rows (capabilities/models empty,
signatureStatus 'unknown'); `getOrch` flattens capabilities + models
across nodes from `ResolveByAddress`. Chain-derived enrichment
(`activePoolMember`, `totalStakeWei`, `serviceUri` for the roster)
still pending §2/§3.

## Open questions

- ~~**Resolver-audit-log poll cadence**. Default 30s? Configurable via
  env. Decide before §6 lands.~~ — Default 30s, env
  `RESOLVER_AUDIT_POLL_INTERVAL_SEC`. Set 0 to disable.
- **Chain-read TTL** for the routing dashboard's enrichment pass. 30s
  default; bump up if the active-set walk gets expensive on operators
  with weak RPC endpoints.
- **Whether the "ticket-success rate" widget on the per-orch drilldown
  ships in v1**. Counted from resolver audit-log alone (per-orch `Select`
  events) or correlated with payment-daemon outcomes? Lean: v1 shows
  resolver-side metrics only; correlation is a v2 derivation that needs
  payment-daemon's audit-log RPC added (Plan 0013 follow-up).

## Artifacts produced

Backend (`src/`):

- `providers/resolver/client.ts` + `client.test.ts` — real `@grpc/grpc-js`
  resolver client over unix socket; covers `ListKnown`,
  `ResolveByAddress`, `Select`, `Refresh`, `GetAuditLog`, plus a
  `Health`-backed `ping()` and 2 s default per-call deadline.
- `providers/payerDaemon/client.ts` + `client.test.ts` — real PayerDaemon
  client; wires `GetDepositInfo` (the only RPC the console uses).
- `providers/chain/viem.ts` + `viem.test.ts` — Controller-resolved
  BondingManager pool walk, TicketBroker `getSenderInfo`, ServiceRegistry
  `getServiceURI`, and `getBalance`. `ChainContractReader` test seam.
- `service/routing/index.ts` + `routing.test.ts` — sparse roster from
  resolver + chain enrichment with TTL cache (no-poison policy).
- `service/sender/index.ts` + `sender.test.ts` — wallet via chain,
  escrow via daemon. Optional `SENDER_ADDRESS`.
- `service/audit/index.ts` + `audit.test.ts` — append + paginated
  listRecent.
- `service/resolver/index.ts` + `resolver.test.ts` — `Resolver.Select`
  search, `Refresh`, `GetAuditLog` pull.
- `runtime/http/handlers/` — 9 handlers: list orchs, get orch, capability
  search, sender wallet, sender escrow, list audit-log, list resolver
  audit-log, two refresh handlers (wildcard + per-orch).
  `handlers.test.ts` + `handleResolverRefresh.test.ts` exercise them.
- `runtime/workers/auditPoll.ts` + `auditPoll.test.ts` — single-flight
  watermark-based hydration loop; in-memory cursor; no-poison-on-error.
- `service/auth/actor.test.ts`, `utils/socketCheck.test.ts` — fill out
  the auth + socket-check coverage.

Frontend (`bridge-ui/admin/`):

- `lib/format.js` — wei / timestamp / address display helpers.
- `components/admin-routing.js` — central multi-pane dashboard.
- `components/admin-orch-detail.js` — direct-link drilldown.
- `components/admin-capabilities.js` — `Resolver.Select` search.
- `components/admin-sender.js` — wallet + escrow cards.
- `components/admin-audit.js` — paginated bearer-action table.
- `components/admin-app.js` — route table updated.
- `admin.css` — table / pill / kv-grid styling.

Config:

- `src/config/env.ts` — added `CHAIN_READ_TTL_SEC`,
  `RESOLVER_AUDIT_POLL_INTERVAL_SEC`, optional `SENDER_ADDRESS`,
  optional `MIN_BALANCE_WEI`.
- `vitest.config.ts` — coverage threshold ratcheted to 75 across
  lines/branches/functions/statements; exclusions documented in
  decisions log.

Final state: lint clean, typecheck clean, 78/78 tests pass, coverage
96.98 % statements / 76.44 % branches / 97.22 % funcs / 96.98 % lines,
SPA builds clean (46 KB JS / 3 KB CSS gzipped).
