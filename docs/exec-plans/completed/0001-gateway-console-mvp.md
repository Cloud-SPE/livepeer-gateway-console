---
id: 0001
slug: gateway-console-mvp
title: Implement gateway-console MVP (routing dashboard, capability search, sender wallet+escrow, audit log, Refresh actions, periodic resolver-audit-log poll, viem chain provider)
status: active
owner: agent
opened: 2026-04-28
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

- [ ] `src/providers/resolver/client.ts` — replace the stub with a real
      `@grpc/grpc-js` client speaking against the unix socket
      `RESOLVER_SOCKET_PATH`. Use the buf-generated `gen/` stubs.
      Wire `ListKnown`, `ResolveByAddress`, `Select`, `Refresh`,
      `GetAuditLog`. Tight per-call deadline (2s default).
- [ ] `src/providers/payerDaemon/client.ts` — same shape against
      `SENDER_SOCKET_PATH`. Wire `GetDepositInfo` and the wallet-info
      surface (whichever RPC exposes hot-wallet identity + balance — see
      payment-daemon proto; if not present, infer balance from chain via
      ChainReader and only call `GetDepositInfo` from the daemon).
- [ ] Unit tests for both clients with a stand-up of a fake gRPC server
      over a tmp socket.

### 2. viem chain provider impls

- [ ] `bondingManagerListPool` — Controller →
      `getContract("BondingManager")` (already implemented), then walk
      `getFirstTranscoderInPool` / `getNextTranscoderInPool` /
      `getDelegator`. Return a typed `BondingPoolEntry[]`.
- [ ] `getReserveInfo(sender)` — Controller →
      `getContract("TicketBroker")`, then `getReserveInfo(sender)`.
- [ ] `readServiceUri(orchAddress)` — Controller →
      `getContract("ServiceRegistry")` (already implemented), then
      `getServiceURI(orch)`.
- [ ] Tests stub the viem client; live-RPC verification belongs in
      staging.

### 3. Routing dashboard backend

- [ ] `service/routing/listOrchs` — combine resolver `ListKnown` with
      chain enrichment (BondingManager pool walk for active-set + stake;
      ServiceRegistry serviceURI per orch). Cache the chain reads with a
      configurable TTL (env: `CHAIN_READ_TTL_SEC`, default 30s).
- [ ] `service/routing/getOrch` — same enrichment for the single-orch
      drilldown; pull recent observations from the local mirror.
- [ ] Handlers `handleGetOrch`, `handleCapabilitySearch`. Schemas in
      `src/types/routing.ts` (already present; extend as needed).

### 4. Sender wallet + escrow

- [ ] `service/sender` — already shaped. Add chain-balance fallback path
      if PayerDaemon doesn't expose it natively.
- [ ] Handlers `handleGetSenderWallet`, `handleGetSenderEscrow`.

### 5. Audit log + Refresh actions

- [ ] Handlers for `/api/audit-log`, `/api/resolver/audit-log`,
      `POST /api/resolver/refresh`, `POST /api/resolver/refresh/:address`.
- [ ] Audit-event append on every `Refresh` write.

### 6. routing_observations hydration loop

- [ ] Background worker that polls `Resolver.GetAuditLog` on a
      configurable cadence (env: `RESOLVER_AUDIT_POLL_INTERVAL_SEC`,
      default 30s) and bulk-inserts into `routing_observations`.
- [ ] De-dup by an upstream cursor (since-watermark) so we don't
      double-record entries across polls.

### 7. SPA shells (the dashboard itself)

- [ ] `<admin-routing>` — replace the placeholder with the central
      multi-pane dashboard: orch roster table, capability filter row,
      per-orch drilldown panel with a routing-history chart drawn from
      `routing_observations` for the selected orch.
- [ ] `<admin-orch-detail>` — direct-link drilldown.
- [ ] `<admin-capabilities>` — capability/model search form +
      `Resolver.Select` results.
- [ ] `<admin-sender>` — wallet card + escrow card.
- [ ] `<admin-audit>` — paginated table.
- [ ] Coverage threshold ratchet from 0 → 75 once tests across §1–§5
      land.

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

## Open questions

- **Resolver-audit-log poll cadence**. Default 30s? Configurable via
  env. Decide before §6 lands.
- **Chain-read TTL** for the routing dashboard's enrichment pass. 30s
  default; bump up if the active-set walk gets expensive on operators
  with weak RPC endpoints.
- **Whether the "ticket-success rate" widget on the per-orch drilldown
  ships in v1**. Counted from resolver audit-log alone (per-orch `Select`
  events) or correlated with payment-daemon outcomes? Lean: v1 shows
  resolver-side metrics only; correlation is a v2 derivation that needs
  payment-daemon's audit-log RPC added (Plan 0013 follow-up).

## Artifacts produced

(Filled at plan completion.)
