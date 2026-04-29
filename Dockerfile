# syntax=docker/dockerfile:1.6

# ------------------------------------------------------------------------------
# deps: install runtime deps (prod + dev) for the build stage. The lint
# plugin is a workspace member of the repo-root package.json, but it never
# runs at build/runtime — and `lint/` is dockerignored on purpose. Strip
# the `workspaces` field from the in-image package.json so npm install
# treats it as a flat package and doesn't go looking for the lint plugin.
#
# Using `npm install --no-package-lock` rather than `npm ci`: the lockfile
# still references the stripped workspace, which `npm ci` would fail on.
#
# We deliberately do NOT pass --ignore-scripts: better-sqlite3's postinstall
# is what fetches (or compiles) the prebuilt native binding for the active
# Node ABI. The base is debian-slim (glibc) so the binding is compatible
# with the distroless glibc runtime stage below; mixing musl/alpine here
# would fail at dlopen time in production.
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN node -e "const p=require('./package.json');delete p.workspaces;require('fs').writeFileSync('package.json',JSON.stringify(p,null,2));"
# python3 + build-essential cover the case where prebuild-install can't
# match a published prebuild for the active Node ABI and falls back to
# compiling node-gyp from source. node:20-bookworm-slim drops these to
# keep the base small; we add them only for the install step.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 build-essential \
  && npm install --no-package-lock \
  && apt-get purge -y --auto-remove python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------------------
# ui: build the admin SPA in its own stage against admin-ui/package-lock.json.
# devDeps stay in this stage; only dist/ ships to runtime. No native bindings
# (vite + lit are pure JS), so the base image is the only consideration.
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS ui
WORKDIR /ui
COPY admin-ui ./
RUN npm install
RUN npm run build:admin

# ------------------------------------------------------------------------------
# build: run tsc; prune dev deps so the runtime copies only prod node_modules.
# better-sqlite3's binding was already compiled in `deps`; npm prune doesn't
# touch it.
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npx tsc -p tsconfig.json
RUN npm prune --omit=dev

# ------------------------------------------------------------------------------
# runtime: distroless Node 20. Non-root by default. No shell.
# ------------------------------------------------------------------------------
FROM gcr.io/distroless/nodejs20-debian12 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=ui /ui/admin/dist ./admin-ui/admin/dist
EXPOSE 8080
# Distroless runs as `nonroot` (uid 65532) by default.
CMD ["dist/main.js"]
