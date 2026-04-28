# FRONTEND — livepeer-gateway-console admin SPA

## What this is

A single Lit ^3 + Vite ^6 web app served from `bridge-ui/admin/` and shipped
in the runtime image at `/admin/console/`. Operators paste their bearer token
into a login screen, and the app then talks to the same Fastify process over
`/api/*` with `Authorization: Bearer <token>`.

This is a **build-time** SPA: Vite emits a static bundle into
`bridge-ui/admin/dist/`, which the runtime image copies and `@fastify/static`
serves under the `/admin/console/` URL prefix.

## The routing dashboard is the central screen

Per Plan 0013 §A (Mike, 2026-04-28), the gateway console is **dashboard-heavy**
in a way the orch consoles are not. The default route — `/admin/console/` —
is the **routing dashboard**, not a status pane. Multi-pane:

1. **Left column / top**: orch roster table.
   - Rows = each orch the resolver knows about (`Resolver.ListKnown`),
     enriched by chain reads (BondingManager pool membership for active
     set + stake, ServiceRegistry serviceURI for the per-row manifest URL).
   - Filters: capability, model, tier, signed/unsigned, freshness.
2. **Right column / bottom**: per-orch drill-down panel.
   - Clicked from a roster row.
   - Routing-history chart pulled from the local `routing_observations`
     table (which is hydrated by the periodic-poll worker against
     `Resolver.GetAuditLog` — see DESIGN.md).
   - Last-N `Select` outcomes, signature status, freshness markers.
   - Per-orch `Refresh` button → `POST /api/resolver/refresh/:address`.

Other top-level routes hang off the same shell:

- `/admin/console/login` — bearer-token paste + operator-handle capture
- `/admin/console/orchs/:address` — direct-link drilldown
- `/admin/console/capabilities` — capability/model search via `Resolver.Select`
- `/admin/console/sender` — sender wallet balance + escrow view
- `/admin/console/audit` — bearer-action audit log

Everything else (sender, audit) is a side trip from the dashboard.

## Stack

- **Lit ^3** — web components, plain CSS via shadow DOM
- **Vite ^6** — dev server + build (proxies `/api` and `/admin` to the local
  Fastify in dev; emits static bundle in prod)
- **RxJS ^7** — service-layer reactivity (one BehaviorSubject per service,
  components subscribe via Lit `connectedCallback`)
- **Plain `fetch()`** + `sessionStorage` — auth header injection via the
  shared `bridge-ui/shared/lib/api-base.js` factory

No router library. Hash-based routing via `bridge-ui/shared/lib/route.js` (a
~20-line `onhashchange` wrapper, ported from openai-livepeer-bridge / inherited
from livepeer-orch-coordinator).

## Layout

```
bridge-ui/
├── package.json              # npm-workspace root; hoists lit + rxjs
├── shared/                   # cross-UI primitives
│   ├── lib/api-base.js       # the createApi() fetch wrapper
│   ├── lib/events.js         # GATEWAY_EVENTS + on/emit helpers
│   ├── lib/route.js          # hash router
│   ├── lib/session-storage.js
│   └── package.json
└── admin/                    # the operator console SPA
    ├── index.html
    ├── main.js               # entry; imports admin-app
    ├── admin.css
    ├── vite.config.js        # base = '/admin/console/'
    ├── components/
    │   ├── admin-app.js      # router shell
    │   ├── admin-login.js    # bearer paste screen
    │   └── admin-routing.js  # routing-dashboard placeholder
    └── lib/
        ├── api.js            # binds api-base to /api/* with sessionStorage token
        └── session.js
```

## Build & dev commands

From repo root:

```bash
npm install                  # installs workspaces incl. bridge-ui/*
npm run build:ui             # vite build into bridge-ui/admin/dist
npm run dev:ui               # vite dev server on http://localhost:5174
                             #   proxies /api and /admin to http://localhost:8080
```

The Fastify server in dev runs separately (`npm run dev` at the repo root).
Vite proxies API calls so cookies / CORS aren't an issue.

## Component patterns

- One Lit component per top-level view. File name matches custom-element name
  (`admin-routing.js` defines `<admin-routing>`).
- Use `createRenderRoot() { return this; }` to render in light DOM (lets
  global CSS reach components without `:host` wrappers — matches the
  openai-livepeer-bridge / orch-coordinator convention).
- Reactivity via Lit `static properties = { _foo: { state: true } }`.
- Side effects in `connectedCallback`; teardown in `disconnectedCallback` —
  return values from `on(...)` / `service.subscribe(...)` are functions, push
  them into `this._unsubs` and call them on disconnect.
- Imports relative — never `@/`. Vite resolves from the file.

## Auth flow

1. Login screen accepts a bearer token + an operator handle (used for audit
   attribution).
2. `bridge-ui/admin/lib/api.js` wraps `createApi()` from
   `bridge-ui/shared/lib/api-base.js`, injecting the bearer header.
3. On any `401`, the api-base fires `gateway:unauthorized`; the app shell
   clears sessionStorage and shows the login screen.
4. Token never leaves the browser. We do not set cookies, do not call any
   third-party identity provider, do not store actor handles server-side
   beyond the audit log.

## Anti-patterns to reject

- Adding a router library (react-router, lit-router-equivalent). The
  hash-route helper is enough; if it isn't, that is a design-doc-worthy
  conversation.
- Importing from `src/` in `bridge-ui/`. The SPA is HTTP-only.
- TypeScript inside `bridge-ui/`. Plain JS + JSDoc keeps the build pipeline
  short. (Consistent with sibling consoles.)
- A second SPA (no `portal`). The gateway-console audience is a single
  operator role.
