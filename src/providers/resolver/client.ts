// Resolver gRPC client provider — wraps the buf-generated stubs at
// `./gen/` behind the small interface the service layer actually uses.
// Real `@grpc/grpc-js` channel construction (unix-socket dial, retry
// policy, request deadlines) lands in per-repo Plan 0001; today this
// file ships an interface + a "client unavailable" stub so handlers
// can be wired without booting a real daemon at test time.
//
// The `gen/` directory is populated by `npm run proto:gen:registry`
// from `../livepeer-modules-project/service-registry-daemon/proto`.

export interface KnownOrch {
  address: string;
  serviceUri: string;
  capabilities: readonly string[];
  models: readonly string[];
  signatureStatus: 'signed' | 'unsigned' | 'unknown';
  freshnessStatus: 'fresh' | 'stale' | 'unknown';
}

export interface SelectQuery {
  capability: string;
  model?: string;
  tier?: string;
}

export interface SelectResult {
  orchAddress: string | null;
  /** Why this orch was picked (or why none were). */
  reason: string;
}

export interface ResolverAuditEntry {
  occurredAt: number;
  orchAddress: string | null;
  capability: string | null;
  model: string | null;
  signatureStatus: string | null;
  freshnessStatus: string | null;
  detailsJson: string | null;
}

export interface ResolverClient {
  ping(): Promise<{ ok: boolean; error?: string }>;
  listKnown(): Promise<KnownOrch[]>;
  resolveByAddress(orchAddress: string): Promise<KnownOrch | null>;
  select(query: SelectQuery): Promise<SelectResult>;
  refresh(orchAddressOrWildcard: string, opts?: { force?: boolean }): Promise<void>;
  getAuditLog(opts?: { since?: number; limit?: number }): Promise<ResolverAuditEntry[]>;
}

export interface ResolverClientOptions {
  socketPath: string;
}

export class ResolverClientUnavailableError extends Error {
  constructor(method: string, opts: ResolverClientOptions) {
    super(
      `ResolverClient.${method} is not implemented yet (bootstrap stub at ` +
        `socket=${opts.socketPath}). Implement the @grpc/grpc-js channel + ` +
        `the buf-generated resolver/gen client wiring in per-repo Plan 0001.`,
    );
    this.name = 'ResolverClientUnavailableError';
  }
}

/**
 * Bootstrap stub. Returns "unavailable" from ping(); throws on every
 * other RPC. The handler shell uses ping() to drive /api/health into a
 * 503 (rather than a 500) when the socket isn't mounted in dev.
 */
export function createResolverClient(options: ResolverClientOptions): ResolverClient {
  return {
    async ping() {
      return {
        ok: false,
        error: `resolver client unavailable (socket=${options.socketPath}); see Plan 0001 for impl`,
      };
    },
    async listKnown() {
      throw new ResolverClientUnavailableError('listKnown', options);
    },
    async resolveByAddress(_addr) {
      throw new ResolverClientUnavailableError('resolveByAddress', options);
    },
    async select(_query) {
      throw new ResolverClientUnavailableError('select', options);
    },
    async refresh(_addr) {
      throw new ResolverClientUnavailableError('refresh', options);
    },
    async getAuditLog(_opts) {
      throw new ResolverClientUnavailableError('getAuditLog', options);
    },
  };
}
