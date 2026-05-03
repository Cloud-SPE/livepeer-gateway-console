// Routing-domain service — wraps the resolver client (orch roster +
// per-orch lookup), enriches with chain reads (BondingManager pool walk
// for active-set + stake; ServiceRegistry serviceURI per orch), and
// reads from the local routing_observations mirror.
//
// Chain reads are memoized in a small TTL cache so a busy dashboard
// doesn't hammer the RPC. Cache window is configured at construction
// (env: `CHAIN_READ_TTL_SEC`, default 30s).

import type { Address } from "viem";
import type {
  BondingPoolEntry,
  ChainReader,
} from "../../providers/chain/viem.js";
import type {
  FreshnessLabel,
  ResolvedNode,
  ResolvedOrch,
  ResolverClient,
  SignatureLabel,
} from "../../providers/resolver/client.js";
import type { Db } from "../../repo/db.js";
import { routingObservationsRepo } from "../../repo/index.js";
import type { RoutingObservation, OrchRosterRow } from "../../types/routing.js";

export interface RoutingService {
  listOrchs(): Promise<OrchRosterRow[]>;
  getOrch(address: string): Promise<{
    orch: OrchRosterRow | null;
    recentObservations: RoutingObservation[];
  }>;
  /** Per-orch routing-history slice, drawn from the local mirror. */
  listObservations(
    address: string,
    limit?: number,
  ): Promise<RoutingObservation[]>;
}

export interface RoutingServiceDeps {
  db: Db;
  resolver: ResolverClient;
  chain: ChainReader;
  controllerAddress: Address;
  serviceRegistryAddress: Address | null;
  /** TTL for chain-read memoization, in milliseconds. */
  chainReadTtlMs: number;
  /** Test-only clock override; defaults to Date.now. */
  now?: () => number;
}

export function createRoutingService(deps: RoutingServiceDeps): RoutingService {
  const now = deps.now ?? Date.now;
  const cache = createTtlCache(deps.chainReadTtlMs, now);

  const getBondingManager = async (): Promise<Address> =>
    cache.getOrLoad("bondingManager", () =>
      deps.chain.resolveBondingManager(deps.controllerAddress),
    );

  const getServiceRegistry = async (): Promise<Address> =>
    cache.getOrLoad("serviceRegistry", async () => {
      if (deps.serviceRegistryAddress) return deps.serviceRegistryAddress;
      return deps.chain.resolveServiceRegistry(deps.controllerAddress);
    });

  const getPoolStakeMap = async (): Promise<Map<string, string>> =>
    cache.getOrLoad("poolStakeMap", async () => {
      const bm = await getBondingManager();
      const entries = await deps.chain.bondingManagerListPool(bm);
      return poolEntriesToStakeMap(entries);
    });

  const getServiceUri = async (orch: Address): Promise<string | null> =>
    cache.getOrLoad(`serviceUri:${orch.toLowerCase()}`, async () => {
      const sr = await getServiceRegistry();
      try {
        const uri = await deps.chain.readServiceUri(sr, orch);
        return uri || null;
      } catch {
        // ServiceRegistry returns empty / reverts for orchs that never
        // registered a serviceURI. Don't crash the whole roster.
        return null;
      }
    });

  return {
    async listOrchs() {
      const known = await deps.resolver.listKnown();
      // Resolve chain enrichment in parallel: pool stakes once + serviceURI per row.
      const [stakeMap, serviceUris] = await Promise.all([
        getPoolStakeMap(),
        Promise.all(known.map((k) => getServiceUri(k.address as Address))),
      ]);
      return known.map((k, i) => {
        const stakeWei = stakeMap.get(k.address.toLowerCase());
        return {
          address: k.address,
          serviceUri: serviceUris[i] ?? null,
          capabilities: [],
          offerings: [],
          signatureStatus: "unknown",
          freshnessStatus: narrowFreshness(k.freshnessStatus),
          activePoolMember: stakeWei !== undefined,
          totalStakeWei: stakeWei ?? null,
          lastObservedAt: null,
        };
      });
    },

    async getOrch(address) {
      const [resolved, observationsRaw, stakeMap, serviceUri] =
        await Promise.all([
          deps.resolver.resolveByAddress(address),
          routingObservationsRepo.listRecentForOrch(deps.db, address),
          getPoolStakeMap(),
          getServiceUri(address as Address),
        ]);
      const recentObservations = observationsRaw.map(rowToObservation);
      if (!resolved) return { orch: null, recentObservations };
      const stakeWei = stakeMap.get(resolved.address.toLowerCase());
      const orch = rosterRowFromResolved(resolved, {
        serviceUri,
        activePoolMember: stakeWei !== undefined,
        totalStakeWei: stakeWei ?? null,
        lastObservedAt: recentObservations[0]?.observedAt ?? null,
      });
      return { orch, recentObservations };
    },

    async listObservations(address, limit) {
      const opts = limit !== undefined ? { limit } : {};
      const rows = await routingObservationsRepo.listRecentForOrch(
        deps.db,
        address,
        opts,
      );
      return rows.map(rowToObservation);
    },
  };
}

interface RosterEnrichment {
  serviceUri: string | null;
  activePoolMember: boolean;
  totalStakeWei: string | null;
  lastObservedAt: number | null;
}

function rosterRowFromResolved(
  r: ResolvedOrch,
  e: RosterEnrichment,
): OrchRosterRow {
  const top: ResolvedNode | undefined = r.nodes[0];
  const capabilities = dedupe(r.nodes.flatMap((n) => [...n.capabilities]));
  const offerings = dedupe(r.nodes.flatMap((n) => [...n.offerings]));
  return {
    address: r.address,
    // Prefer chain-derived serviceURI; fall back to whatever the resolver reported.
    serviceUri: e.serviceUri ?? (r.resolvedUri || null),
    capabilities,
    offerings,
    signatureStatus: top ? narrowSignature(top.signatureStatus) : "unknown",
    freshnessStatus: narrowFreshness(r.freshnessStatus),
    activePoolMember: e.activePoolMember,
    totalStakeWei: e.totalStakeWei,
    lastObservedAt: e.lastObservedAt,
  };
}

function poolEntriesToStakeMap(
  entries: BondingPoolEntry[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) {
    map.set(e.address.toLowerCase(), e.totalStakeWei);
  }
  return map;
}

function narrowFreshness(label: FreshnessLabel): "fresh" | "stale" | "unknown" {
  switch (label) {
    case "fresh":
      return "fresh";
    case "stale-recoverable":
    case "stale-failing":
      return "stale";
    default:
      return "unknown";
  }
}

function narrowSignature(
  label: SignatureLabel,
): "signed" | "unsigned" | "unknown" {
  switch (label) {
    case "verified":
      return "signed";
    case "unsigned":
      return "unsigned";
    default:
      return "unknown";
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function rowToObservation(r: {
  id: number;
  observedAt: number;
  orchAddress: string;
  capability: string | null;
  offering: string | null;
  signatureStatus: string | null;
  freshnessStatus: string | null;
  detailsJson: string | null;
}): RoutingObservation {
  return {
    id: r.id,
    observedAt: r.observedAt,
    orchAddress: r.orchAddress,
    capability: r.capability,
    offering: r.offering,
    signatureStatus: r.signatureStatus,
    freshnessStatus: r.freshnessStatus,
    detailsJson: r.detailsJson,
  };
}

// ---------- TTL cache (single-flight in-flight dedup) -------------------

interface TtlCache {
  getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T>;
}

function createTtlCache(ttlMs: number, now: () => number): TtlCache {
  type Entry = {
    expiresAt: number;
    promise: Promise<unknown>;
    settledValue?: unknown;
    settled: boolean;
  };
  const store = new Map<string, Entry>();
  return {
    async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
      const t = now();
      const cached = store.get(key);
      if (cached && cached.expiresAt > t) {
        if (cached.settled) return cached.settledValue as T;
        return cached.promise as Promise<T>;
      }
      const entry: Entry = {
        expiresAt: t + ttlMs,
        promise: Promise.resolve(),
        settled: false,
      };
      const promise = (async () => {
        try {
          const value = await loader();
          entry.settledValue = value;
          entry.settled = true;
          return value;
        } catch (err) {
          // Negative results aren't cached: drop the entry so the next
          // caller retries instead of getting a poisoned cache.
          store.delete(key);
          throw err;
        }
      })();
      entry.promise = promise;
      store.set(key, entry);
      return promise as Promise<T>;
    },
  };
}
