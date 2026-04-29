# syntax=docker/dockerfile:1.6

# ------------------------------------------------------------------------------
# deps: install all root-workspace deps (prod + dev) for the build stage.
# Root workspaces is just the lint plugin; the SPA install happens
# separately in the `ui` stage against admin-ui/package-lock.json.
# We use the debian-slim (glibc) base because better-sqlite3 ships native
# bindings — building on musl/alpine and copying into the distroless glibc
# runtime image fails at dlopen time. Keep all native compilation on glibc
# end-to-end.
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY lint/eslint-plugin-livepeer-gateway-console/package.json ./lint/eslint-plugin-livepeer-gateway-console/
RUN npm install --ignore-scripts && npm rebuild better-sqlite3

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
# build: compile TypeScript. Prune devDeps + rebuild better-sqlite3 against
# glibc so the distroless runtime can dlopen it.
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npx tsc -p tsconfig.json
RUN npm prune --omit=dev && npm rebuild better-sqlite3

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
