# Changelog

All notable changes to `livepeer-gateway-console` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed (BREAKING for in-tree contributors; no runtime impact)

- Renamed `bridge-ui/` → `admin-ui/` to align with sibling consoles
  (`livepeer-secure-orch-console`, `livepeer-orch-coordinator`). The
  bootstrap (Plan 0013) literally specified `bridge-ui/`; the siblings
  diverged to `admin-ui/` later, and we'd been the inconsistent one.
- Restructured the SPA tree as a separate npm install root (its own
  `package-lock.json`) instead of a workspace of the repo root —
  matches sibling shape exactly. The repo-root `package.json`
  workspaces field is now `["lint/eslint-plugin-livepeer-gateway-console"]`.
  Build/dev/test scripts updated: `build:ui` runs
  `cd admin-ui && npm ci && npm run build:admin`; `test:ui` similar.
- Internal package names: `admin` → `gateway-console-admin`;
  `@gateway-console-ui/shared` → `gateway-console-shared`. Workspace
  root: `gateway-console-admin-ui`.
- Documentation: forward-references to "per-repo Plan 0001 will…" /
  "bootstrap stub" cleaned up (Plan 0001 shipped in v0.1.0; the work is
  now live, not pending).
- Documentation: payment-daemon v2.0.0+ compatibility note added
  (README + AGENTS). The v2.0.0 breaking changes (`worker.yaml`
  rename, `payee_daemon.proto` field deletion) sit on surfaces this
  console doesn't consume; we're wire-compatible without code changes.

### Fixed

- `.prettierignore` excludes the buf-generated `gen/` directories so
  `npm run fmt` can't corrupt them (which would render `npm run
proto:check` useless against any fresh regen).

## [0.1.1] - 2026-04-29

Tooling + dependency modernization. No runtime behavior change.

### Added

- GitHub Actions CI: lint / fmt:check / typecheck / test (with the
  coverage gate enforced) / build on every push to `main` and every
  PR. Coverage report uploaded as an artifact.
- GitHub Actions deploy: on `v*.*.*` tag push, re-validates and then
  builds + pushes the runtime image to Docker Hub
  (`tztcloud/livepeer-gateway-console`) with semver +`:latest` tags.
- Dependabot config: weekly grouped-minor PRs across npm / docker /
  github-actions ecosystems; coupled-pair upgrades (fastify ↔
  @fastify/\*, vitest ↔ @vitest/coverage-v8) excluded from the auto-PR
  flow.
- `.nvmrc` (`20`) so CI + dev environments stay aligned with the
  `Dockerfile` `node:20-bookworm-slim` base.
- `npm run proto:check` script — re-runs `proto:gen` and errors via
  `git diff --exit-code` if the committed `gen/` has drifted from the
  upstream daemon proto.

### Changed

- buf-generated stubs (`src/providers/{payerDaemon,resolver}/gen/`)
  are now committed rather than gitignored, so CI doesn't need a
  sibling `livepeer-modules-project` checkout to typecheck / test.
  The `proto:check` script is the drift guard.
- Prettier applied repo-wide; CI's `fmt:check` step enforces the
  baseline going forward.
- `npm test` now runs with `--coverage` so the threshold gate fires;
  added `test:nocov` for fast local iteration.
- Coverage thresholds: 75% lines / functions / statements; branches
  softened from 75 → 70 because vitest 4's v8 instrumentation tightened
  branch counting (~3 pp fewer branches covered for the same code vs
  vitest 1). Logged in `tech-debt-tracker.md` as a follow-up to add
  4–5 targeted tests and ratchet back up.

### Dependency bumps (coordinated)

No code changes required beyond zod deprecation cleanup.

- `zod` 3.25 → 4.3 (cleaned up `.strict()` → `z.strictObject()` and
  `z.string().url()` → `z.url()`)
- `vitest` 1.6 → 4.1 + `@vitest/coverage-v8` 1.6 → 4.1 (coupled)
- `vite` 6.3 → 8.0 (in `bridge-ui/admin/`)
- `better-sqlite3` 11.5 → 12.9
- `drizzle-orm` 0.36 → 0.45 (security fix in 0.45.2; we're not on the
  vulnerable APIs but on the patched version regardless)
- `drizzle-kit` 0.28 → 0.31

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
