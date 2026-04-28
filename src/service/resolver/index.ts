// Resolver-domain service — capability search, audit-log pull, and the
// two `Refresh` mutation paths. The `Refresh` actions are the only writes
// the gateway-console fires (idempotent at the daemon).

import type {
  ResolverAuditEntry,
  ResolverClient,
  SelectQuery,
  SelectResult,
} from '../../providers/resolver/client.js';

export interface ResolverService {
  search(query: SelectQuery): Promise<SelectResult>;
  refresh(target: { address?: string }): Promise<void>;
  fetchAuditLog(opts?: {
    ethAddress?: string;
    since?: number;
    limit?: number;
  }): Promise<ResolverAuditEntry[]>;
}

export interface ResolverServiceDeps {
  resolver: ResolverClient;
}

export function createResolverService(deps: ResolverServiceDeps): ResolverService {
  return {
    async search(query) {
      return deps.resolver.select(query);
    },
    async refresh({ address }) {
      const target = address ?? '*';
      await deps.resolver.refresh(target, { force: true });
    },
    async fetchAuditLog(opts) {
      return deps.resolver.getAuditLog(opts ?? {});
    },
  };
}
