# livepeer-gateway-console

Public-facing operator console for Livepeer **gateway / bridge** entities — the
payer side of the network. Operators run a `service-registry-daemon`
(mode=resolver) + `payment-daemon` (mode=sender) + their own bridge app; this
console gives them a routing dashboard, capability search, sender wallet
status, audit log, and manual cache `Refresh` actions on top of those two
daemons.

This repo is a sibling of [`livepeer-orch-coordinator`][orch-coordinator] and
[`livepeer-secure-orch-console`][secure-orch] — all three are operator
consoles bootstrapped from
[livepeer-modules-project plan 0013][plan-0013] (and its parent plan 0011
for the orch consoles). Different audience, same TS stack and conventions.

[plan-0013]: ../livepeer-modules-project/docs/exec-plans/active/0013-gateway-console-and-installer-role.md
[orch-coordinator]: ../livepeer-orch-coordinator
[secure-orch]: ../livepeer-secure-orch-console

## What this is

The gateway-console is the operator's **routing dashboard** for a payer-side
deployment:

- **Routing dashboard is the central screen.** Multi-pane: orch roster with
  capability filters + per-orch drill-down panels (signatures, freshness,
  routing history charts derived from the resolver's audit log).
- **Capability search** via `Resolver.Select` — preview which orch the
  resolver would pick for a given capability/model/tier.
- **Sender wallet status** — wallet balance from chain, escrow / reserve
  details from `PayerDaemon.GetDepositInfo`.
- **Audit log** — both the resolver's own (`Resolver.GetAuditLog`) and the
  console's own bearer-action log.
- **Manual cache refreshes** — `POST /api/resolver/refresh` (`*`, force=true)
  and `POST /api/resolver/refresh/:address`. Idempotent; the only writes the
  console fires.

For audience, anti-goals, and the full task matrix see
[PRODUCT_SENSE.md](PRODUCT_SENSE.md). For architecture and the layer-stack
diagram see [DESIGN.md](DESIGN.md). For UI architecture see
[FRONTEND.md](FRONTEND.md).

## Prereqs

- Node.js 20+
- npm (the repo uses npm workspaces; do **not** use pnpm)
- Docker + Docker Compose for local stack-up
- An Ethereum-mainnet (Arbitrum One by default) HTTPS RPC endpoint
- The two upstream daemons running and exposing their unix sockets:
  - `service-registry-daemon` in resolver mode →
    `/var/run/livepeer/resolver/service-registry.sock`
  - `payment-daemon` in sender mode → `/var/run/livepeer/sender/payment.sock`

  In a typical deployment those are named volumes from
  [`livepeer-modules-project/deploy/gateway/compose.yaml`][gateway-compose].

[gateway-compose]: ../livepeer-modules-project/deploy/gateway/compose.yaml

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Generate buf stubs (consumes both daemon protos via relative path)
npm run proto:gen

# 3. Lint + test + build
npm run lint
npm run test
npm run build

# 4. Local stack — binds 127.0.0.1:8080
cp .env.example .env       # edit ADMIN_TOKEN, CHAIN_RPC
docker compose up -d

curl http://127.0.0.1:8080/healthz                            # 200
curl http://127.0.0.1:8080/api/health                         # 401 — bearer required
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:8080/api/health                            # 200 (or 503 if daemon sockets aren't mounted yet)
curl http://127.0.0.1:8080/admin/console/                     # 200 — Lit SPA shell

docker compose down
```

## What good looks like

A single Fastify process serves both the auth'd `/api/*` operator surface
**and** the static SPA at `/admin/console/*`, on the same port
(`127.0.0.1:8080` by default). No public unauthenticated routes — `/healthz`
is the only thing without bearer auth, and that's for proxies. Bring your
own reverse proxy for TLS / public ingress.

## Repository layout

```
src/
├── types/        # Zod schemas, domain types
├── config/       # validated env config
├── repo/         # Drizzle queries against SQLite (audit_events, routing_observations)
├── service/      # business logic (auth, routing, sender, resolver, audit)
├── runtime/      # Fastify HTTP server + route handlers
├── providers/    # cross-cutting (better-sqlite3, viem, fastify, pino, @grpc/grpc-js)
└── utils/        # zero-dep helpers
bridge-ui/admin/  # Lit + Vite SPA (operator console; routing dashboard is the central screen)
lint/             # custom ESLint plugin (six rules with remediation hints)
docs/             # design docs, exec-plans, references (incl. openai-harness.pdf)
```

## Further reading

- [AGENTS.md](AGENTS.md) — entry point for agents working in this repo
- [DESIGN.md](DESIGN.md) — top-level architecture
- [FRONTEND.md](FRONTEND.md) — UI architecture (routing dashboard is the central screen)
- [PRODUCT_SENSE.md](PRODUCT_SENSE.md) — audience + anti-goals
- [PLANS.md](PLANS.md) — exec-plan format
- [`docs/exec-plans/active/0001-gateway-console-mvp.md`](docs/exec-plans/active/0001-gateway-console-mvp.md) —
  the per-repo MVP scope picked up after this bootstrap
