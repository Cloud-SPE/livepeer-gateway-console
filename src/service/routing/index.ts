// Routing-domain service — wraps the resolver client (orch roster +
// per-orch lookup) and reads from the local routing_observations mirror.
// Real orch-roster enrichment with chain reads (BondingManager pool walk,
// ServiceRegistry serviceURI) lands in per-repo Plan 0001; the bootstrap
// service ships the interface against which handlers are wired.

import type { ResolverClient } from '../../providers/resolver/client.js';
import type { Db } from '../../repo/db.js';
import { routingObservationsRepo } from '../../repo/index.js';
import type { RoutingObservation, OrchRosterRow } from '../../types/routing.js';

export interface RoutingService {
  listOrchs(): Promise<OrchRosterRow[]>;
  getOrch(address: string): Promise<{
    orch: OrchRosterRow | null;
    recentObservations: RoutingObservation[];
  }>;
  /** Per-orch routing-history slice, drawn from the local mirror. */
  listObservations(address: string, limit?: number): Promise<RoutingObservation[]>;
}

export interface RoutingServiceDeps {
  db: Db;
  resolver: ResolverClient;
}

export function createRoutingService(deps: RoutingServiceDeps): RoutingService {
  return {
    async listOrchs() {
      const known = await deps.resolver.listKnown();
      // Bootstrap: pass-through, no chain enrichment yet (Plan 0001).
      return known.map((k) => ({
        address: k.address,
        serviceUri: k.serviceUri || null,
        capabilities: [...k.capabilities],
        models: [...k.models],
        signatureStatus: k.signatureStatus,
        freshnessStatus: k.freshnessStatus,
        activePoolMember: false,
        totalStakeWei: null,
        lastObservedAt: null,
      }));
    },
    async getOrch(address) {
      const k = await deps.resolver.resolveByAddress(address);
      const obs = await routingObservationsRepo.listRecentForOrch(deps.db, address);
      const recentObservations = obs.map(rowToObservation);
      const orch: OrchRosterRow | null = k
        ? {
            address: k.address,
            serviceUri: k.serviceUri || null,
            capabilities: [...k.capabilities],
            models: [...k.models],
            signatureStatus: k.signatureStatus,
            freshnessStatus: k.freshnessStatus,
            activePoolMember: false,
            totalStakeWei: null,
            lastObservedAt: recentObservations[0]?.observedAt ?? null,
          }
        : null;
      return { orch, recentObservations };
    },
    async listObservations(address, limit) {
      const opts = limit !== undefined ? { limit } : {};
      const rows = await routingObservationsRepo.listRecentForOrch(deps.db, address, opts);
      return rows.map(rowToObservation);
    },
  };
}

function rowToObservation(r: {
  id: number;
  observedAt: number;
  orchAddress: string;
  capability: string | null;
  model: string | null;
  signatureStatus: string | null;
  freshnessStatus: string | null;
  detailsJson: string | null;
}): RoutingObservation {
  return {
    id: r.id,
    observedAt: r.observedAt,
    orchAddress: r.orchAddress,
    capability: r.capability,
    model: r.model,
    signatureStatus: r.signatureStatus,
    freshnessStatus: r.freshnessStatus,
    detailsJson: r.detailsJson,
  };
}
