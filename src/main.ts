// Composition root. Validates env (Zod), opens SQLite, runs migrations,
// constructs the Fastify server, and listens on LISTEN_ADDR.
//
// Per AGENTS.md "the providers boundary": main.ts is the one composition
// root that imports from `providers/`; everything below the runtime layer
// gets its dependencies injected.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, parseListenAddr } from "./config/env.js";
import { createChainReader } from "./providers/chain/viem.js";
import { openSqlite } from "./providers/database/sqlite.js";
import { createLogger } from "./providers/logger/pino.js";
import { createPayerDaemonClient } from "./providers/payerDaemon/client.js";
import { createResolverClient } from "./providers/resolver/client.js";
import { createServer } from "./runtime/http/server.js";
import { createAuditPollWorker } from "./runtime/workers/auditPoll.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({ level: env.LOG_LEVEL, format: env.LOG_FORMAT });

  const listen = parseListenAddr(env.LISTEN_ADDR);
  logger.info("starting livepeer-gateway-console", {
    listen: env.LISTEN_ADDR,
    chainId: env.CHAIN_ID,
    statePath: env.STATE_PATH,
    resolverSocketPath: env.RESOLVER_SOCKET_PATH,
    senderSocketPath: env.SENDER_SOCKET_PATH,
  });

  // Open SQLite + run hand-authored migration on first boot.
  const sqlite = openSqlite({ path: env.STATE_PATH });
  applyBootstrapMigrationIfNeeded(sqlite.raw);

  const resolver = createResolverClient({
    socketPath: env.RESOLVER_SOCKET_PATH,
  });
  const payer = createPayerDaemonClient({ socketPath: env.SENDER_SOCKET_PATH });
  const chain = createChainReader({
    rpcUrl: env.CHAIN_RPC,
    chainId: env.CHAIN_ID,
  });

  const server = await createServer({
    db: sqlite.db,
    adminToken: env.ADMIN_TOKEN,
    resolver,
    payer,
    chain,
    controllerAddress: env.CONTROLLER_ADDRESS as `0x${string}`,
    chainReadTtlMs: env.CHAIN_READ_TTL_SEC * 1000,
    senderAddress: env.SENDER_ADDRESS
      ? (env.SENDER_ADDRESS as `0x${string}`)
      : null,
    minBalanceWei: env.MIN_BALANCE_WEI ?? null,
    resolverSocketPath: env.RESOLVER_SOCKET_PATH,
    senderSocketPath: env.SENDER_SOCKET_PATH,
  });

  const auditPoll = createAuditPollWorker({
    resolver,
    db: sqlite.db,
    logger,
    intervalMs: env.RESOLVER_AUDIT_POLL_INTERVAL_SEC * 1000,
  });

  // Graceful shutdown.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutdown signal received", { signal });
    const hardKill = setTimeout(() => {
      logger.error("graceful shutdown exceeded 30s — force exit");
      process.exit(1);
    }, 30_000);
    hardKill.unref();
    try {
      auditPoll.stop();
      await server.http.close();
      sqlite.close();
      logger.info("shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error("shutdown error", {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  const address = await server.http.listen(listen.host, listen.port);
  logger.info("listening", { address });
  auditPoll.start();
}

/**
 * Hand-authored bootstrap migration runner. Reads `migrations/0001_init.sql`
 * relative to the running file and executes it iff the schema has no tables
 * yet. Per-repo Plan 0001 promotes this to a real drizzle-kit migrator that
 * tracks applied migrations.
 */
function applyBootstrapMigrationIfNeeded(
  raw: import("better-sqlite3").Database,
): void {
  const has = raw
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('audit_events','routing_observations')",
    )
    .all();
  if (has.length === 2) return;

  const here = dirname(fileURLToPath(import.meta.url));
  // dist/main.js -> ../migrations  ; src/main.ts -> ../migrations
  const candidates = [
    resolve(here, "..", "migrations", "0001_init.sql"),
    resolve(here, "..", "..", "migrations", "0001_init.sql"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) {
    throw new Error(
      `bootstrap migration 0001_init.sql not found; checked: ${candidates.join(", ")}`,
    );
  }
  const sql = readFileSync(path, "utf8");
  raw.exec(sql);
}

main().catch((err) => {
  // Logger may not be constructed yet — fall back to console.error
  // (allowed by no-console rule).
  console.error("[gateway-console] fatal startup error", err);
  process.exit(1);
});
