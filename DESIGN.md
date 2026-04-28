# DESIGN — livepeer-gateway-console

## What this is

A public-facing operator console for the **gateway / bridge** side of a
Livepeer deployment. The single Fastify process answers one caller:

- **The gateway operator** — humans logging in via the Lit/Vite admin SPA at
  `/admin/console/` with a bearer token. They watch the routing dashboard
  (orch roster + per-orch drill-down + capability filters), search
  capabilities, view sender wallet status + escrow, read the resolver's
  audit log, and fire manual `Refresh` actions on the resolver cache when
  on-chain state changes.

What makes the gateway console different from `livepeer-orch-coordinator`
(its closest sibling): it is the **payer side**. The console mounts two
daemon unix sockets read-write — `service-registry-daemon` (resolver) and
`payment-daemon` (sender) — and routes operator clicks into RPC calls
against those daemons. It does **not** sign anything itself; the
payment-daemon owns the hot-wallet keystore via its own bind-mount, the
console only ever calls `GetDepositInfo` for read-only escrow visibility.

## Layer stack

(From the openai-harness reference, page 10.)

```
┌──────────────────────────────────────────────────────────┐
│  ui/             admin SPA (bridge-ui/admin/, Lit + Vite) │
├──────────────────────────────────────────────────────────┤
│  runtime/        HTTP server + handlers (Fastify shell)   │
├──────────────────────────────────────────────────────────┤
│  service/        business logic (auth, routing, sender,   │
│                  resolver, audit)                         │
├──────────────────────────────────────────────────────────┤
│  repo/           Drizzle queries against SQLite           │
├──────────────────────────────────────────────────────────┤
│  config/         validated env config                     │
├──────────────────────────────────────────────────────────┤
│  types/          Zod schemas, domain types                │
└──────────────────────────────────────────────────────────┘
                        +
┌──────────────────────────────────────────────────────────┐
│  utils/          zero-dep helpers (reachable by all)      │
└──────────────────────────────────────────────────────────┘
                        +
┌──────────────────────────────────────────────────────────┐
│  providers/      cross-cutting (reachable by all)         │
│  better-sqlite3, viem, fastify, pino, @grpc/grpc-js       │
│  (resolver + payerDaemon clients live under providers/)   │
└──────────────────────────────────────────────────────────┘
```

Dependency rule: each layer may import only layers **below** it, plus
`providers/` and `utils/`. Enforced by
`eslint-plugin-livepeer-gateway-console/layer-check`.

`bridge-ui/` is **not** part of the `src/` layer stack. The SPA talks to the
backend over HTTP only and may not import from `src/`.

## Domains

| Domain               | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `service/auth`       | Bearer-token validation against `ADMIN_TOKEN`                    |
| `service/audit`      | Read + append the console's own bearer-action audit log          |
| `service/routing`    | Orch roster (resolver `ListKnown` + chain enrich), per-orch detail (`ResolveByAddress`), routing-history pull from `routing_observations` |
| `service/sender`     | Sender wallet balance (chain) + escrow (`PayerDaemon.GetDepositInfo`) |
| `service/resolver`   | Capability search (`Resolver.Select`), audit-log pull (`Resolver.GetAuditLog`), Refresh actions (`Resolver.Refresh`) |

## Runtime surfaces

| Path                                       | Auth      | Purpose                                                |
| ------------------------------------------ | --------- | ------------------------------------------------------ |
| `GET /healthz`                             | none      | Liveness for proxies                                   |
| `GET /api/health`                          | bearer    | Console self-status; pings both daemon sockets         |
| `GET /api/orchs`                           | bearer    | Routing dashboard roster (resolver `ListKnown` + chain enrich) |
| `GET /api/orchs/:address`                  | bearer    | Per-orch drilldown (resolver `ResolveByAddress` + slice of `routing_observations`) |
| `GET /api/capabilities/search`             | bearer    | Capability/model search via `Resolver.Select`          |
| `GET /api/sender/wallet`                   | bearer    | Hot-wallet address + chain balance                     |
| `GET /api/sender/escrow`                   | bearer    | TicketBroker deposit + reserve via `PayerDaemon.GetDepositInfo` |
| `GET /api/resolver/audit-log`              | bearer    | Resolver-side audit log via `Resolver.GetAuditLog`     |
| `GET /api/audit-log`                       | bearer    | Console's own bearer-action log                        |
| `POST /api/resolver/refresh`               | bearer    | `Resolver.Refresh(*, force=true)` — confirm modal      |
| `POST /api/resolver/refresh/:address`      | bearer    | `Resolver.Refresh(addr, force=true)` — idempotent      |
| `GET /admin/console/*`                     | none      | The Lit/Vite SPA static bundle                         |

## Providers

| Provider           | Interface role                                          | Default impl                |
| ------------------ | ------------------------------------------------------- | --------------------------- |
| `Database`         | SQLite handle (single `state.db` file)                  | `better-sqlite3` + Drizzle  |
| `ChainReader`      | Read-only chain calls (BondingManager pool walk, TicketBroker reserve, ServiceRegistry serviceURI) | `viem` |
| `ResolverClient`   | gRPC client for service-registry-daemon (resolver mode) | `@grpc/grpc-js` over unix socket |
| `PayerDaemonClient`| gRPC client for payment-daemon (sender mode)            | `@grpc/grpc-js` over unix socket |
| `Logger`           | Structured log                                          | `pino`                      |
| `HttpServer`       | Fastify instance + plugin registration                  | `fastify` ^4                |

## State model

SQLite, single `state.db` file (path = `STATE_PATH`). Two tables; full SQL in
`migrations/0001_init.sql`:

- **`audit_events`** — every operator action (login, resolver refresh, etc.),
  append-only.
- **`routing_observations`** — periodic-poll snapshots of the resolver's
  audit-log entries; per-orch drilldown panels query this for routing-history
  charts. Hydrated by a worker that pulls `Resolver.GetAuditLog` on a
  configurable cadence (per-repo Plan 0001).

Filesystem state: **none**. Unlike `livepeer-orch-coordinator`, the gateway
console serves nothing publicly and does not own a manifest file.

## Chain reads

Outbound HTTPS to `CHAIN_RPC` (Arbitrum One by default):

- `Controller.getContract(keccak256("BondingManager"))` — resolve
  BondingManager.
- `BondingManager.getFirstTranscoderInPool` /
  `getNextTranscoderInPool` / `getDelegator` — pool walk for the active set
  + stake info on the routing dashboard.
- `Controller.getContract(keccak256("TicketBroker"))` →
  `getReserveInfo(senderAddress)` — sender escrow view.
- `ServiceRegistry.getServiceURI(orchAddress)` — per-orch row's manifest URL
  for the dashboard.

## What this does NOT do

- Does **not** sign anything. The payment-daemon owns the sender keystore
  via its own bind-mount; the console only reads from it.
- Does **not** drive `payment-daemon.StartSession` / `CreatePayment`. Those
  are bridge-app concerns; the console is observation-only.
- Does **not** edit fleet configuration, push-config, or restart anything.
  The two `Refresh` writes against the resolver cache are the only writes.
- Does **not** ship a public unauthenticated route. The closest sibling
  (`orch-coordinator`) serves `/manifest.json` publicly; the gateway
  console does not, by design (deliberate divergence — Plan 0013 §B).
- Does **not** ship a reverse proxy. Operator runs their own. Image binds
  `127.0.0.1:8080`.
- Does **not** support OIDC / SSO / cookies. Bearer-token via `ADMIN_TOKEN`
  only.
- Does **not** use Postgres. SQLite via `better-sqlite3` + Drizzle —
  matches the org-wide orch-side console convention (Plan 0011 §A).
