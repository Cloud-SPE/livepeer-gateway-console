# AGENTS.md — livepeer-gateway-console

Public-facing operator console for **gateway / bridge** entities (the payer
side of the network — different audience than the orch operators). Mounts two
unix daemon sockets read-write (resolver + sender), reads chain over HTTPS RPC,
serves a Lit/Vite admin SPA. **Holds the operator's hot-wallet keystore via
the payment-daemon mount only — the console process itself never sees it.**

**Humans steer. Agents execute. Scaffolding is the artifact.**

## Start here

- Design & domains: [DESIGN.md](DESIGN.md)
- UI architecture: [FRONTEND.md](FRONTEND.md) (routing dashboard is the central screen)
- How to plan work: [PLANS.md](PLANS.md)
- Product mental model: [PRODUCT_SENSE.md](PRODUCT_SENSE.md)
- Cross-repo bootstrap context: [livepeer-modules-project plan 0013](../livepeer-modules-project/docs/exec-plans/active/0013-gateway-console-and-installer-role.md)
- Sibling consoles for pattern reference:
  - [`livepeer-orch-coordinator`](../livepeer-orch-coordinator) — closest sibling (same architecture, different audience)
  - [`livepeer-secure-orch-console`](../livepeer-secure-orch-console) — LAN-only cold-key console
- Org philosophical foundation: [docs/references/openai-harness.pdf](docs/references/openai-harness.pdf)

## Knowledge base layout

- `docs/design-docs/` — design decisions
- `docs/exec-plans/active/` — in-flight work (start here for current scope)
- `docs/exec-plans/completed/` — archived plans; do not modify
- `docs/exec-plans/tech-debt-tracker.md` — known debt, append-only
- `docs/product-specs/` — operator-facing behaviors
- `docs/generated/` — auto-generated; never hand-edit
- `docs/operations/` — operator runbooks
- `docs/references/` — external material (incl. the harness PDF)
- `bridge-ui/` — browser apps (sibling to `src/`, not under it)

## The layer rule (non-negotiable)

Source under `src/` follows a strict dependency stack:

```
types → config → repo → service → runtime → ui
```

Cross-cutting concerns (`better-sqlite3`, `viem`, `fastify`, `pino`,
`@grpc/grpc-js`) enter through a single layer: `src/providers/`. Nothing in
`service/` or `runtime/` may import those libraries directly.

`bridge-ui/` is **not** part of the `src/` layer stack. It is a sibling
deliverable that talks to the gateway console over HTTP only and may not
import from `src/`.

Lints enforce this. See [DESIGN.md](DESIGN.md) and `lint/eslint-plugin-livepeer-gateway-console/`.

## Toolchain

- Node.js 20+
- TypeScript 5.4+ (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- ESLint 9 (flat config) with custom plugin `eslint-plugin-livepeer-gateway-console`
- Zod at every HTTP boundary
- SQLite via Drizzle (`better-sqlite3`)
- Lit ^3 + Vite for the SPA
- gRPC: `@grpc/grpc-js` + `buf` ^1.68 + `ts-proto` ^2.11. **Two** proto trees
  consumed: `payment-daemon` (sender) AND `service-registry-daemon` (resolver).

## Commands

- `npm run build` — compile TypeScript **and** build the admin SPA
- `npm run build:server` — TypeScript server only
- `npm run build:ui` — Lit/Vite admin SPA only
- `npm run test` — Vitest with v8 coverage; **75% floor** ratcheted in Plan 0001
- `npm run lint` — ESLint + the six custom rules
- `npm run typecheck` — `tsc --noEmit`
- `npm run db:generate` — drizzle-kit generate (regenerate `migrations/`)
- `npm run proto:gen` — regenerate buf stubs from BOTH daemons
- `npm run proto:gen:payments` — payment-daemon stubs only
- `npm run proto:gen:registry` — service-registry-daemon stubs only

## Invariants (do not break without a design-doc)

1. **No public unauthenticated routes.** Only `/healthz` (for proxies) lives
   outside bearer auth. Unlike orch-coordinator, the gateway console serves
   nothing publicly.
2. **Bearer-token only.** No OIDC, no sessions, no cookies. `ADMIN_TOKEN` is
   the only auth scheme. Validation is constant-time.
3. **Daemon sockets are unix-only.** Resolver socket + sender socket are
   mounted as docker named volumes; the console binds `127.0.0.1:8080`.
4. **Zod at boundaries.** Every HTTP body / query / params and every gRPC
   response that reaches `service/` parses through a Zod schema first.
5. **Providers boundary.** No cross-cutting library is imported outside
   `src/providers/`.
6. **Test coverage ≥ 75%** across lines/branches/functions/statements
   (ratcheted in Plan 0001 §1).
7. **Refresh actions are idempotent.** The two `POST /api/resolver/refresh*`
   routes are the only writes; they're safe to retry, and the SPA confirms
   the wildcard-refresh via a modal.

## Where to look for X

| Question                       | Go to                                                          |
| ------------------------------ | -------------------------------------------------------------- |
| What does the console do?      | [DESIGN.md](DESIGN.md)                                         |
| Why is X done this way?        | `docs/design-docs/`                                            |
| What's in flight?              | `docs/exec-plans/active/`                                      |
| How does the SPA work?         | [FRONTEND.md](FRONTEND.md)                                     |
| How do I add a route?          | `src/runtime/http/handlers/` + `src/types/` schemas            |
| How do I add a DB column?      | edit `src/repo/schema.ts`, run `npm run db:generate`           |
| How do I update daemon protos? | run `npm run proto:gen` after the upstream daemon proto change |
| Known debt?                    | `docs/exec-plans/tech-debt-tracker.md`                         |
