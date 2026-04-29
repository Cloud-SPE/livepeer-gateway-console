// Routing service unit tests — both deps stubbed (resolver client +
// chain reader). Validates list/get enrichment paths and the TTL cache.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import {
  openSqlite,
  type SqliteHandle,
} from "../../providers/database/sqlite.js";
import type {
  BondingPoolEntry,
  ChainReader,
} from "../../providers/chain/viem.js";
import type {
  KnownOrch,
  ResolvedOrch,
  ResolverClient,
} from "../../providers/resolver/client.js";
import { routingObservationsRepo } from "../../repo/index.js";
import { createRoutingService } from "./index.js";

const CONTROLLER: Address = "0xD8E8328501E9645d16Cf49539efC04f734606ee4";
const BONDING_MANAGER: Address = "0x35Bcf3c30594191d53231E4FF333E8A770453e40";
const SERVICE_REGISTRY: Address = "0xC92d3A360b8f9e083bA64DE15D95cF8180b5CeF3";
const TICKET_BROKER: Address = "0xa8bB618B1520E284046F3dFc448851A1Ff26e41B";
const ORCH_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ORCH_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const ORCH_NOT_IN_POOL = "0xcccccccccccccccccccccccccccccccccccccccc";

let tmpDir: string;
let sqlite: SqliteHandle;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "routing-test-"));
  sqlite = openSqlite({ path: join(tmpDir, "state.db") });
  const migration = readFileSync(
    resolve(__dirname, "..", "..", "..", "migrations", "0001_init.sql"),
    "utf8",
  );
  sqlite.raw.exec(migration);
});

afterEach(() => {
  sqlite.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("RoutingService.listOrchs", () => {
  it("merges sparse roster with active-set membership + stake + serviceURI", async () => {
    const resolver = makeResolver({
      listKnown: async () => [
        knownEntry(ORCH_A, "fresh"),
        knownEntry(ORCH_B, "stale-recoverable"),
        knownEntry(ORCH_NOT_IN_POOL, "fresh"),
      ],
    });
    const chain = makeChain({
      pool: [
        { address: ORCH_A as Address, totalStakeWei: "1000000000000000000" },
        { address: ORCH_B as Address, totalStakeWei: "5000000000000000000" },
      ],
      serviceUris: {
        [ORCH_A]: "https://orch-a.example/",
        [ORCH_B]: "https://orch-b.example/",
        [ORCH_NOT_IN_POOL]: "",
      },
    });
    const svc = createRoutingService({
      db: sqlite.db,
      resolver,
      chain,
      controllerAddress: CONTROLLER,
      chainReadTtlMs: 30_000,
    });

    const rows = await svc.listOrchs();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      address: ORCH_A,
      serviceUri: "https://orch-a.example/",
      activePoolMember: true,
      totalStakeWei: "1000000000000000000",
      freshnessStatus: "fresh",
    });
    expect(rows[1]).toMatchObject({
      address: ORCH_B,
      activePoolMember: true,
      totalStakeWei: "5000000000000000000",
      freshnessStatus: "stale",
    });
    expect(rows[2]).toMatchObject({
      address: ORCH_NOT_IN_POOL,
      activePoolMember: false,
      totalStakeWei: null,
      serviceUri: null,
    });
  });
});

describe("RoutingService.getOrch", () => {
  it("returns null orch when resolver miss + no observations", async () => {
    const resolver = makeResolver({ resolveByAddress: async () => null });
    const chain = makeChain({});
    const svc = createRoutingService({
      db: sqlite.db,
      resolver,
      chain,
      controllerAddress: CONTROLLER,
      chainReadTtlMs: 30_000,
    });
    const result = await svc.getOrch(ORCH_A);
    expect(result.orch).toBeNull();
    expect(result.recentObservations).toEqual([]);
  });

  it("enriches the resolved row with stake + serviceURI + lastObservedAt", async () => {
    await routingObservationsRepo.appendBatch(sqlite.db, [
      {
        observedAt: 1_700_000_000_000,
        orchAddress: ORCH_A,
        capability: "whisper",
        offering: "whisper-large",
        signatureStatus: "verified",
        freshnessStatus: "fresh",
        detailsJson: null,
      },
    ]);
    const resolver = makeResolver({
      resolveByAddress: async (addr) => resolvedOrch(addr),
    });
    const chain = makeChain({
      pool: [{ address: ORCH_A as Address, totalStakeWei: "7000" }],
      serviceUris: { [ORCH_A]: "https://orch-a.example/" },
    });
    const svc = createRoutingService({
      db: sqlite.db,
      resolver,
      chain,
      controllerAddress: CONTROLLER,
      chainReadTtlMs: 30_000,
    });

    const result = await svc.getOrch(ORCH_A);
    expect(result.orch).toMatchObject({
      address: ORCH_A,
      serviceUri: "https://orch-a.example/",
      activePoolMember: true,
      totalStakeWei: "7000",
      lastObservedAt: 1_700_000_000_000,
      capabilities: ["transcode", "whisper"],
      offerings: ["whisper-large"],
      signatureStatus: "signed",
    });
  });
});

describe("RoutingService TTL cache", () => {
  it("reuses pool + serviceURI within the TTL window", async () => {
    let now = 1_000_000;
    const resolver = makeResolver({
      listKnown: async () => [knownEntry(ORCH_A, "fresh")],
    });
    const chain = makeChain({
      pool: [{ address: ORCH_A as Address, totalStakeWei: "100" }],
      serviceUris: { [ORCH_A]: "https://orch-a.example/" },
    });
    const svc = createRoutingService({
      db: sqlite.db,
      resolver,
      chain,
      controllerAddress: CONTROLLER,
      chainReadTtlMs: 30_000,
      now: () => now,
    });

    await svc.listOrchs();
    await svc.listOrchs();
    await svc.listOrchs();
    // Three list calls, but only one of each chain read path.
    expect(chain.spies.bondingManagerListPool).toHaveBeenCalledTimes(1);
    expect(chain.spies.readServiceUri).toHaveBeenCalledTimes(1);
    expect(chain.spies.resolveBondingManager).toHaveBeenCalledTimes(1);
    expect(chain.spies.resolveServiceRegistry).toHaveBeenCalledTimes(1);

    // Advance past the TTL — next call re-reads.
    now += 31_000;
    await svc.listOrchs();
    expect(chain.spies.bondingManagerListPool).toHaveBeenCalledTimes(2);
    expect(chain.spies.readServiceUri).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed reads (next call retries)", async () => {
    const resolver = makeResolver({
      listKnown: async () => [knownEntry(ORCH_A, "fresh")],
    });
    let poolCallCount = 0;
    const chain = makeChain({
      pool: [{ address: ORCH_A as Address, totalStakeWei: "10" }],
      serviceUris: { [ORCH_A]: "https://orch-a.example/" },
    });
    chain.spies.bondingManagerListPool.mockImplementation(async () => {
      poolCallCount += 1;
      if (poolCallCount === 1) throw new Error("rpc flaked");
      return [{ address: ORCH_A as Address, totalStakeWei: "10" }];
    });
    const svc = createRoutingService({
      db: sqlite.db,
      resolver,
      chain,
      controllerAddress: CONTROLLER,
      chainReadTtlMs: 30_000,
    });

    await expect(svc.listOrchs()).rejects.toThrow(/rpc flaked/);
    // Retry succeeds (no poisoned cache).
    const rows = await svc.listOrchs();
    expect(rows[0]?.activePoolMember).toBe(true);
    expect(poolCallCount).toBe(2);
  });
});

// ----------------------------- helpers ---------------------------------

function knownEntry(
  address: string,
  freshness: KnownOrch["freshnessStatus"],
): KnownOrch {
  return {
    address,
    mode: "well-known",
    freshnessStatus: freshness,
    cachedAt: 1_700_000_000_000,
  };
}

function resolvedOrch(addr: string): ResolvedOrch {
  return {
    address: addr,
    resolvedUri: "",
    mode: "well-known",
    nodes: [
      {
        id: addr,
        url: "https://orch.example/",
        region: "us-east",
        capabilities: ["transcode", "whisper"],
        offerings: ["whisper-large"],
        signatureStatus: "verified",
        operatorAddress: addr,
        enabled: true,
        tierAllowed: ["tier-0"],
        weight: 100,
      },
    ],
    freshnessStatus: "fresh",
    cachedAt: 1_700_000_000_000,
    fetchedAt: 1_700_000_000_000,
    schemaVersion: 1,
  };
}

function makeResolver(overrides: Partial<ResolverClient>): ResolverClient {
  return {
    ping: async () => ({ ok: true }),
    listKnown: async () => [],
    resolveByAddress: async () => null,
    select: async () => ({
      orchAddress: null,
      reason: "no node matched",
      nodes: [],
    }),
    refresh: async () => undefined,
    getAuditLog: async () => [],
    close: () => undefined,
    ...overrides,
  };
}

interface FakeChainOptions {
  pool?: BondingPoolEntry[];
  serviceUris?: Record<string, string>;
}

interface FakeChain extends ChainReader {
  spies: {
    resolveBondingManager: ReturnType<typeof vi.fn>;
    resolveTicketBroker: ReturnType<typeof vi.fn>;
    resolveServiceRegistry: ReturnType<typeof vi.fn>;
    bondingManagerListPool: ReturnType<typeof vi.fn>;
    getReserveInfo: ReturnType<typeof vi.fn>;
    readServiceUri: ReturnType<typeof vi.fn>;
  };
}

function makeChain(opts: FakeChainOptions): FakeChain {
  const pool = opts.pool ?? [];
  const serviceUris = opts.serviceUris ?? {};
  const spies = {
    resolveBondingManager: vi.fn(async () => BONDING_MANAGER),
    resolveTicketBroker: vi.fn(async () => TICKET_BROKER),
    resolveServiceRegistry: vi.fn(async () => SERVICE_REGISTRY),
    bondingManagerListPool: vi.fn(async () => pool),
    getReserveInfo: vi.fn(async () => ({ depositWei: "0", reserveWei: "0" })),
    readServiceUri: vi.fn(
      async (_sr: Address, addr: Address) =>
        serviceUris[addr.toLowerCase()] ?? "",
    ),
  };
  return {
    chainId: 42_161,
    resolveBondingManager: (a) => spies.resolveBondingManager(a),
    resolveTicketBroker: (a) => spies.resolveTicketBroker(a),
    resolveServiceRegistry: (a) => spies.resolveServiceRegistry(a),
    bondingManagerListPool: (a) => spies.bondingManagerListPool(a),
    getReserveInfo: (a, b) => spies.getReserveInfo(a, b),
    readServiceUri: (a, b) => spies.readServiceUri(a, b),
    spies,
  };
}
