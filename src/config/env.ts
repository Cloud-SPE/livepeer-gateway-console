// Top-level env config. Each loader is Zod-validated and throws with a
// clear message on missing/invalid env. Per Plan 0013 §B the gateway-console
// reads ADMIN_TOKEN, CHAIN_RPC, RESOLVER/SENDER socket paths, etc.

import { z } from 'zod';

const EthAddressLike = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, { message: 'Expected 0x-prefixed 40-hex address' });

export const EnvSchema = z.object({
  LISTEN_ADDR: z.string().default('127.0.0.1:8080'),

  // Bearer for /api/* (>= 32 chars). /healthz is the only unauth route.
  ADMIN_TOKEN: z.string().min(32, {
    message: 'ADMIN_TOKEN must be at least 32 characters',
  }),

  CHAIN_RPC: z.string().url(),
  CHAIN_ID: z.coerce.number().int().positive().default(42_161),
  CONTROLLER_ADDRESS: EthAddressLike.default('0xD8E8328501E9645d16Cf49539efC04f734606ee4'),

  STATE_PATH: z.string().default('/var/lib/livepeer/state.db'),

  // Daemon socket paths inside the container. Defaults match the upstream
  // livepeer-modules-project gateway-archetype's named-volume mount points.
  RESOLVER_SOCKET_PATH: z
    .string()
    .default('/var/run/livepeer/resolver/service-registry.sock'),
  SENDER_SOCKET_PATH: z.string().default('/var/run/livepeer/sender/payment.sock'),

  // Routing-dashboard chain-enrichment cache TTL. Per Plan 0001 §3 the
  // BondingManager pool walk + ServiceRegistry serviceURI reads are
  // memoized for this many seconds.
  CHAIN_READ_TTL_SEC: z.coerce.number().int().nonnegative().default(30),

  // routing_observations hydration cadence. The background worker polls
  // Resolver.GetAuditLog every N seconds and bulk-inserts deduped rows.
  // 0 disables the poll loop entirely (tests / staging dry-runs).
  RESOLVER_AUDIT_POLL_INTERVAL_SEC: z.coerce.number().int().nonnegative().default(30),

  // Sender wallet identity. The PayerDaemon owns the keystore via its
  // own bind-mount but does NOT expose hot-wallet address/balance via
  // proto; the operator sets this here so the console can read the
  // balance from chain. Optional — when unset, /api/sender/wallet
  // returns a structured "not_configured" error.
  SENDER_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, { message: 'Expected 0x-prefixed 40-hex address' })
    .optional(),
  // Optional informational floor below which the daemon refuses tickets.
  // Surfaced to the dashboard so operators can spot dips before tickets
  // start failing.
  MIN_BALANCE_WEI: z
    .string()
    .regex(/^[0-9]+$/, { message: 'MIN_BALANCE_WEI must be a base-10 wei amount' })
    .optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'text']).default('json'),
});

export type Env = z.infer<typeof EnvSchema>;

export interface ListenConfig {
  host: string;
  port: number;
}

export function parseListenAddr(value: string): ListenConfig {
  const idx = value.lastIndexOf(':');
  if (idx <= 0) {
    throw new Error(`LISTEN_ADDR "${value}" must be host:port`);
  }
  const host = value.slice(0, idx);
  const port = Number(value.slice(idx + 1));
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`LISTEN_ADDR "${value}" port must be 1..65535`);
  }
  return { host, port };
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}
