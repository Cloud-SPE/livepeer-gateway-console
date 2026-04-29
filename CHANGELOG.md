# Changelog

All notable changes to `livepeer-gateway-console` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-29

First release. The bootstrap scaffold is now a working operator console.

### Added

- Per-repo Plan 0001 (gateway-console MVP): the bootstrap scaffold is now a
  working v1.
  - **Daemon clients**: real `@grpc/grpc-js` resolver client (ListKnown,
    ResolveByAddress, Select, Refresh, GetAuditLog, Health-backed ping;
    2 s default per-call deadline) and PayerDaemon client (GetDepositInfo).
  - **Chain reads (viem)**: BondingManager pool walk, TicketBroker
    `getSenderInfo` (deposit + reserve), ServiceRegistry `getServiceURI`,
    native `getBalance`. `ChainContractReader` test seam.
  - **Routing dashboard backend**: `service/routing` enriches resolver
    `ListKnown` with active-set membership + stake from the pool walk and
    per-orch serviceURI. In-memory TTL cache (`CHAIN_READ_TTL_SEC`,
    default 30 s) with no-poison-on-failure policy. New endpoints:
    `GET /api/orchs/:address`, `GET /api/capabilities/search`.
  - **Sender wallet + escrow**: `GET /api/sender/wallet` reads chain
    balance for `SENDER_ADDRESS`; returns `503 wallet_not_configured` when
    the env var is unset. `GET /api/sender/escrow` calls
    `PayerDaemon.GetDepositInfo`.
  - **Audit log + Refresh actions**: `GET /api/audit-log` (cursor
    pagination), `GET /api/resolver/audit-log`,
    `POST /api/resolver/refresh` (wildcard + per-orch). Every refresh
    write appends an `audit_events` row attributed to `req.actor`,
    success or failure.
  - **routing_observations hydration loop**: background worker polls
    `Resolver.GetAuditLog` every `RESOLVER_AUDIT_POLL_INTERVAL_SEC`
    (default 30; 0 disables) with an in-memory `since` watermark; failed
    polls don't poison the cursor.
  - **SPA shells**: five Lit views in `bridge-ui/admin/components/` —
    routing dashboard (multi-pane with inline drilldown), per-orch
    detail, capability search, sender wallet+escrow, paginated audit log.
  - **Coverage ratchet**: vitest threshold raised from 0 → 75 % across
    lines/branches/functions/statements (achieved at 96.98 / 76.44 /
    97.22 / 96.98). Composition-root wiring + `src/types/**` excluded;
    rationale in plan 0001's decisions log.
- New env vars: `CHAIN_READ_TTL_SEC`, `RESOLVER_AUDIT_POLL_INTERVAL_SEC`,
  optional `SENDER_ADDRESS`, optional `MIN_BALANCE_WEI`.

### Initial bootstrap

- Initial bootstrap from livepeer-modules-project plan 0013: Fastify+Lit/Vite
  scaffold, six-rule ESLint plugin, SQLite-via-Drizzle schema with
  `audit_events` + `routing_observations`, viem-based chain provider stubs
  (BondingManager pool walk, TicketBroker reserve, ServiceRegistry serviceURI),
  buf-generated TS stubs from the payment-daemon AND service-registry-daemon
  protos (sender + resolver clients), bridge-ui admin SPA with login + routing
  dashboard placeholder.
