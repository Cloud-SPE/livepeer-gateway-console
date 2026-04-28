// Fastify shell. Wires:
//   - GET /healthz                         — public, no auth
//   - bearer-auth gate on every /api/*
//   - GET /api/health                      — pings both daemon sockets
//   - GET /api/orchs                       — routing-dashboard roster
//   - GET /admin/console/*                 — Lit/Vite SPA static assets
//
// Per Plan 0013 §B the gateway console serves NO public unauthenticated
// route besides /healthz (which exists for reverse-proxy liveness). This
// is a deliberate divergence from livepeer-orch-coordinator's public
// /manifest.json — the gateway console has no equivalent.

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import {
  createFastifyServer,
  fastifyStatic,
  type HttpServer,
  type FastifyInstance,
} from '../../providers/http/fastify.js';
import {
  createAuthService,
  InvalidAdminTokenError,
  MalformedActorError,
  MalformedAuthorizationError,
  MissingActorError,
  parseActor,
  type AuthService,
} from '../../service/auth/index.js';
import './fastify-augmentation.js';
import type { PayerDaemonClient } from '../../providers/payerDaemon/client.js';
import type { ResolverClient } from '../../providers/resolver/client.js';
import { createRoutingService, type RoutingService } from '../../service/routing/index.js';
import type { Db } from '../../repo/db.js';
import { handleHealth } from './handlers/handleHealth.js';
import { handleListOrchs } from './handlers/handleListOrchs.js';

export interface ServerDeps {
  db: Db;
  adminToken: string;
  resolver: ResolverClient;
  payer: PayerDaemonClient;
  resolverSocketPath: string;
  senderSocketPath: string;
  /** Toggle Fastify's own access log. Default true; pass false in tests. */
  logger?: boolean;
}

export interface ServerHandle {
  http: HttpServer;
  routing: RoutingService;
  auth: AuthService;
}

export async function createServer(deps: ServerDeps): Promise<ServerHandle> {
  const http = await createFastifyServer({ logger: deps.logger ?? true });
  http.app.decorateRequest('actor', '');
  registerErrorHandler(http.app);
  const auth = createAuthService({ adminToken: deps.adminToken });
  const routing = createRoutingService({ db: deps.db, resolver: deps.resolver });

  registerPublicRoutes(http.app);
  registerApiRoutes(http.app, auth, {
    routing,
    resolver: deps.resolver,
    payer: deps.payer,
    resolverSocketPath: deps.resolverSocketPath,
    senderSocketPath: deps.senderSocketPath,
  });
  await registerSpaStatic(http.app);

  return { http, routing, auth };
}

// --- error handler: ZodError → 400 with structured issues -------------

function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'invalid_input',
          issues: err.issues.map((i) => ({
            path: i.path,
            code: i.code,
            message: i.message,
          })),
        },
      });
    }
    return reply.send(err);
  });
}

// --- public, no auth ----------------------------------------------------

function registerPublicRoutes(app: FastifyInstance): void {
  app.get('/healthz', async (_req, reply) => {
    return reply.send({ ok: true });
  });
}

// --- /api/* — bearer auth on every route -------------------------------

interface ApiDeps {
  routing: RoutingService;
  resolver: ResolverClient;
  payer: PayerDaemonClient;
  resolverSocketPath: string;
  senderSocketPath: string;
}

function registerApiRoutes(
  app: FastifyInstance,
  auth: AuthService,
  deps: ApiDeps,
): void {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    try {
      auth.authenticate(headerString(req.headers.authorization));
      req.actor = parseActor(headerString(req.headers['x-actor']));
    } catch (err) {
      if (err instanceof MalformedAuthorizationError) {
        return reply
          .code(401)
          .send({ error: { code: 'malformed_authorization', message: err.message } });
      }
      if (err instanceof InvalidAdminTokenError) {
        return reply.code(401).send({ error: { code: 'invalid_admin_token' } });
      }
      if (err instanceof MissingActorError) {
        return reply.code(400).send({ error: { code: 'missing_actor' } });
      }
      if (err instanceof MalformedActorError) {
        return reply.code(400).send({ error: { code: 'malformed_actor', message: err.message } });
      }
      throw err;
    }
  });

  app.get('/api/health', (req, reply) =>
    handleHealth(req, reply, {
      resolver: deps.resolver,
      payer: deps.payer,
      resolverSocketPath: deps.resolverSocketPath,
      senderSocketPath: deps.senderSocketPath,
    }),
  );
  app.get('/api/orchs', (req, reply) =>
    handleListOrchs(req, reply, { routing: deps.routing }),
  );
}

// --- /admin/console/* — Lit/Vite SPA static assets ---------------------

async function registerSpaStatic(app: FastifyInstance): Promise<void> {
  // Resolve `bridge-ui/admin/dist` relative to the running file. In the
  // distroless image dist/main.js sits at /app/dist/main.js; the SPA bundle
  // is copied by the Dockerfile to /app/bridge-ui/admin/dist.
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/runtime/http/server.js  ->  ../../../bridge-ui/admin/dist
  const spaRoot = resolve(here, '..', '..', '..', 'bridge-ui', 'admin', 'dist');
  if (!existsSync(spaRoot)) {
    // Bootstrap-time the SPA might not be built yet (e.g. running tests).
    // Don't crash the server; just skip mount.
    app.log.warn({ spaRoot }, 'admin SPA assets not found; skipping /admin/console mount');
    return;
  }
  await app.register(fastifyStatic, {
    root: spaRoot,
    prefix: '/admin/console/',
    decorateReply: false,
  });
}

function headerString(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
