---
id: 0002
slug: v3-offerings-rename
title: v3.0.0 offerings rename (proto regen, capability-search, SPA labels)
status: active
owner: agent
opened: 2026-04-29
depends-on: livepeer-network-suite plan 0003 §G (livepeer-gateway-console row)
---

## Goal

Bring the gateway-console into the v3.0.0 contract: regenerate
resolver proto stubs against modules v3.0.0, rename `models` →
`offerings` in the capability-search code paths, and update SPA labels
to use "Offering" wherever capability/pricing UI surfaces today.

## Non-goals

- No backwards-compat parsing for pre-v3 manifests.
- No new routes or admin surfaces.
- No payer-daemon / sender-wallet changes.

## Approach

- [ ] Regenerate resolver proto stubs against modules v3.0.0 under
      `src/providers/resolver/` (the gen dir mirrors vtuber-gateway's
      layout).
- [ ] Rename `models` → `offerings` and `Model` → `Offering` in the
      capability-search service under `src/service/` and in the
      resolver client under `src/providers/resolver/`.
- [ ] Update `SelectRequest` call sites — the `model` parameter
      becomes `offering` per modules v3.0.0 proto rename.
- [ ] Update SPA labels in `admin-ui/` (or equivalent SPA path) so
      the capability-search and pricing UI surfaces show "Offering"
      / "Offerings" wherever they currently say "Model" / "Models".
- [ ] Update Vitest fixtures and any resolver-mocked tests under
      `tests/` to the new shape.
- [ ] Update `DESIGN.md`: confirm archetype A is the canonical
      deploy pattern on the gateway-operator side; "Offering"
      vocabulary in any capability descriptions.
- [ ] Update `FRONTEND.md` if it documents the capability-search SPA
      shape.
- [ ] Smoke: capability search against a v3.0.0 resolver socket
      returns offerings + prices that match the published manifest.
- [ ] Tag `v3.0.0`.

## Decisions log

## Open questions

- **Modules-project version tag** — assume `v3.0.0`; confirm with
  modules-project plan 0004 before regenerating proto stubs.
- **Manifest `schema_version` integer** — CONFIRMED `3` (operator answered 2026-04-29).
- **Daemon image pinning** — CONFIRMED hardcoded `v3.0.0` (every component lands at v3.0.0 in this wave; no tech-debt entry needed).
- Are there any drizzle migrations referencing `model_id` columns
  that need a rename to `offering_id`? Confirm by reading
  `migrations/` against the v3.0.0 cut.

## Artifacts produced
