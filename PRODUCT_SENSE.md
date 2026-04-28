# PRODUCT_SENSE — livepeer-gateway-console

## Who uses this

### The gateway / bridge operator

A daily-ops engineer running a **payer-side** Livepeer deployment — the
opposite end of the network from the orchestrator. Typical incarnations:
`openai-livepeer-bridge`, `vtuber-livepeer-bridge`, or a custom HTTP frontend
that maps end-user requests to Livepeer orchs. They are not the same entity
as the orchestrator; they run a `service-registry-daemon` (mode=resolver) +
`payment-daemon` (mode=sender) + their own bridge app.

They care about:

- **Which orchs are healthy** — the routing dashboard. Multi-pane: orch
  roster with capability filters + per-orch drill-down with routing-history
  chart and signature/freshness indicators.
- **Capability search** — "what would the resolver pick if I ask for this
  capability/model/tier right now?" One screen, one click.
- **Sender wallet headroom** — "is my hot wallet about to dip under
  `MIN_BALANCE_WEI`?" One number, one screen.
- **Escrow status** — TicketBroker deposit + reserve via
  `PayerDaemon.GetDepositInfo`. Plain read view.
- **Cache freshness** — when the on-chain transcoder pool changes, hit
  `Refresh` and wait. Single button for full refresh, per-orch button
  available on the drilldown.
- **Their attack surface is bounded.** This host is internet-facing for
  end-user traffic; the daemon sockets are unix-only; the console binds
  `127.0.0.1` and the operator owns the reverse proxy.

They do **not** care about:

- Per-session payment history. The payment-daemon doesn't have an
  audit-log RPC today (Plan 0013 §Non-goals); deferred to v2 and tracked
  separately if operator demand surfaces.
- Multi-orch hosted-SaaS dashboards. One console = one gateway deployment.
  Routing dashboard shows all orchs the resolver knows about; nothing
  cross-tenant.
- An OIDC/SSO setup. They run this for themselves; bearer token in
  `sessionStorage` is plenty.
- Standing up Postgres. SQLite is the org-wide convention for orch-side
  consoles (Plan 0011 §A) and we inherit it here.

If any of those leak in, we have failed.

### The bridge app

A separate, out-of-monorepo deployment (`openai-livepeer-bridge`,
`vtuber-livepeer-bridge`, etc.) the operator already runs. The bridge mounts
the same daemon sockets read-only (typically) and drives `Resolver.Select` /
`PayerDaemon.StartSession` / `CreatePayment` against them. The console
**observes** that traffic via the resolver's audit log; it does **not** see
into the bridge, and the bridge's deployment surface is the operator's
territory, not ours.

### The public

There is no public surface here, by design. The closest sibling
(`livepeer-orch-coordinator`) serves `/manifest.json` publicly because it
hosts the on-chain `serviceURI` target; the gateway console has no analog —
the bridge app is the public face on this side, and its TLS / routing /
labels are the operator's concern. The console's only unauthenticated route
is `/healthz` for proxy liveness checks.

## What "good" looks like

- An operator opens the dashboard, glances at the orch roster, sees signed
  + fresh markers across the active set, and clicks an orch to read its
  recent routing history without thinking about which RPC was made.
- A pool change on-chain hits the dashboard within one round transition,
  or the operator hits `Refresh` and sees the new state in seconds.
- A capability search ("does anyone serve `whisper-large` in tier 0?") is
  one form, one click, one answer.
- An operator who has never read the codebase can install via
  `docker compose up -d` and get a working stack within ten minutes once
  they have the upstream daemon stack running.
- A compromise of the gateway-console host costs the operator the dashboard
  and the locally-stored audit log + routing observations. It does **not**
  cost them their sender hot-wallet keystore (that's mounted into the
  payment-daemon container, not this one).

## Anti-goals

- **No per-session payment history in v1.** Payment-daemon doesn't expose
  one yet. Defer.
- **No multi-tenant dashboards.** One console per gateway deployment.
- **No actuation power over orchs.** Read-heavy plus the two `Refresh`
  writes; nothing else.
- **No bridge-app pass-through.** The bridge is the operator's territory.
  We do not proxy / labels / TLS for it.
- **No OIDC / SSO / cookies.** Bearer-token via `ADMIN_TOKEN` only, matching
  every other org-standard service.
- **No reverse proxy in compose.** The image binds `127.0.0.1:8080` and
  ships a documented Traefik label snippet for those who want it; everyone
  else uses nginx / Caddy / cloudflared / Tailscale Funnel directly.
- **No Postgres.** SQLite via Drizzle — file-based, embedded, zero-ops.
- **No public unauthenticated route.** `/healthz` is the only thing
  outside bearer auth; deliberate divergence from
  `livepeer-orch-coordinator`'s public `/manifest.json` (Plan 0013 §B).
- **Not a chain explorer.** We read just enough chain to enrich the routing
  dashboard (BondingManager pool, ServiceRegistry serviceURI, TicketBroker
  reserve) and to surface the sender wallet balance. Anything richer
  belongs in a different tool.
- **Not the bridge.** This is operator infrastructure, not the bridge app
  itself. If you find yourself thinking about chat completions, embeddings,
  or end-user request shape — wrong repo.

## Pricing / tiers

n/a — this is operator infrastructure, not a customer-facing product.
