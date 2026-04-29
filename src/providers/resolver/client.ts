// Resolver gRPC client provider — wraps the buf-generated stubs at
// `./gen/` behind the small interface the service layer actually uses.
// The `gen/` directory is populated by `npm run proto:gen:registry`
// from `../livepeer-modules-project/service-registry-daemon/proto`.

import { credentials, Metadata, status as grpcStatus } from "@grpc/grpc-js";
import type { CallOptions, ClientUnaryCall, ServiceError } from "@grpc/grpc-js";
import { Empty } from "./gen/google/protobuf/empty.js";
import {
  ResolverClient as ResolverGrpcClient,
  type AuditEvent,
  type GetAuditLogRequest,
  type KnownEntry,
  type ListKnownRequest,
  type RefreshRequest,
  type ResolveByAddressRequest,
  type ResolveResult,
  type SelectRequest,
  type SelectResult as ProtoSelectResult,
  type AuditLogResult,
  type HealthResult,
  type ListKnownResult,
} from "./gen/livepeer/registry/v1/resolver.js";
import {
  FreshnessStatus,
  ResolveMode,
  SignatureStatus,
  type Node as ProtoNode,
} from "./gen/livepeer/registry/v1/types.js";

export type FreshnessLabel =
  | "fresh"
  | "stale-recoverable"
  | "stale-failing"
  | "unknown";
export type SignatureLabel = "verified" | "unsigned" | "legacy" | "unknown";
export type ResolveModeLabel = "well-known" | "csv" | "legacy" | "unspecified";

export interface KnownOrch {
  address: string;
  mode: ResolveModeLabel;
  freshnessStatus: FreshnessLabel;
  /** Epoch ms of the resolver's last cache update for this orch, or null. */
  cachedAt: number | null;
}

export interface ResolvedNode {
  id: string;
  url: string;
  region: string;
  capabilities: readonly string[];
  models: readonly string[];
  signatureStatus: SignatureLabel;
  operatorAddress: string;
  enabled: boolean;
  tierAllowed: readonly string[];
  weight: number;
}

export interface ResolvedOrch {
  address: string;
  resolvedUri: string;
  mode: ResolveModeLabel;
  nodes: readonly ResolvedNode[];
  freshnessStatus: FreshnessLabel;
  cachedAt: number | null;
  fetchedAt: number | null;
  schemaVersion: number;
}

export interface SelectQuery {
  capability: string;
  model?: string;
  tier?: string;
}

export interface SelectResult {
  /** First-ranked node's id (== orch address) if any matched, else null. */
  orchAddress: string | null;
  reason: string;
  nodes: readonly ResolvedNode[];
}

export interface ResolverAuditEntry {
  /** Epoch ms. */
  occurredAt: number;
  orchAddress: string | null;
  kind: string;
  mode: ResolveModeLabel;
  detail: string;
}

export interface ResolveByAddressOptions {
  allowLegacyFallback?: boolean;
  allowUnsigned?: boolean;
  forceRefresh?: boolean;
}

export interface ResolverClient {
  ping(): Promise<{ ok: boolean; error?: string }>;
  listKnown(): Promise<KnownOrch[]>;
  resolveByAddress(
    address: string,
    opts?: ResolveByAddressOptions,
  ): Promise<ResolvedOrch | null>;
  select(query: SelectQuery): Promise<SelectResult>;
  refresh(addressOrWildcard: string, opts?: { force?: boolean }): Promise<void>;
  getAuditLog(opts?: {
    ethAddress?: string;
    since?: number;
    limit?: number;
  }): Promise<ResolverAuditEntry[]>;
  close(): void;
}

export interface ResolverClientOptions {
  socketPath: string;
  /** Per-call deadline in ms. Default 2000. */
  callDeadlineMs?: number;
}

export function createResolverClient(
  options: ResolverClientOptions,
): ResolverClient {
  const deadlineMs = options.callDeadlineMs ?? 2000;
  const target = `unix:${options.socketPath}`;
  const grpc = new ResolverGrpcClient(target, credentials.createInsecure());

  const callOpts = (): Partial<CallOptions> => ({
    deadline: new Date(Date.now() + deadlineMs),
  });

  return {
    async ping() {
      try {
        await unary<Empty, HealthResult>(
          (req, md, opts, cb) => grpc.health(req, md, opts, cb),
          {},
        );
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },

    async listKnown() {
      const res = await unary<ListKnownRequest, ListKnownResult>(
        (req, md, opts, cb) => grpc.listKnown(req, md, opts, cb),
        {},
      );
      return res.entries.map(mapKnownEntry);
    },

    async resolveByAddress(address, opts) {
      const req: ResolveByAddressRequest = {
        ethAddress: address,
        allowLegacyFallback: opts?.allowLegacyFallback ?? false,
        allowUnsigned: opts?.allowUnsigned ?? true,
        forceRefresh: opts?.forceRefresh ?? false,
      };
      try {
        const res = await unary<ResolveByAddressRequest, ResolveResult>(
          (r, md, o, cb) => grpc.resolveByAddress(r, md, o, cb),
          req,
        );
        return mapResolveResult(res);
      } catch (err) {
        if (isStatus(err, grpcStatus.NOT_FOUND)) return null;
        throw err;
      }
    },

    async select(query) {
      const req: SelectRequest = {
        capability: query.capability,
        model: query.model ?? "",
        tier: query.tier ?? "",
        minWeight: 0,
        geoLat: 0,
        geoLon: 0,
        geoWithinKm: 0,
        hasGeo: false,
      };
      const res = await unary<SelectRequest, ProtoSelectResult>(
        (r, md, o, cb) => grpc.select(r, md, o, cb),
        req,
      );
      const nodes = res.nodes.map(mapNode);
      const top = nodes[0];
      return {
        orchAddress: top ? top.operatorAddress || top.id : null,
        reason: nodes.length === 0 ? "no node matched" : "top-weighted",
        nodes,
      };
    },

    async refresh(addressOrWildcard, opts) {
      const req: RefreshRequest = {
        ethAddress: addressOrWildcard,
        force: opts?.force ?? false,
      };
      await unary<RefreshRequest, Empty>(
        (r, md, o, cb) => grpc.refresh(r, md, o, cb),
        req,
      );
    },

    async getAuditLog(opts) {
      const req: GetAuditLogRequest = {
        ethAddress: opts?.ethAddress ?? "",
        limit: opts?.limit ?? 100,
        ...(opts?.since !== undefined ? { since: new Date(opts.since) } : {}),
      };
      const res = await unary<GetAuditLogRequest, AuditLogResult>(
        (r, md, o, cb) => grpc.getAuditLog(r, md, o, cb),
        req,
      );
      return res.events.map(mapAuditEvent);
    },

    close() {
      grpc.close();
    },
  };

  // ---------- helpers (closure-local so they capture deadlineMs) -----------

  function unary<Req, Res>(
    fn: (
      req: Req,
      md: Metadata,
      opts: Partial<CallOptions>,
      cb: (err: ServiceError | null, res: Res) => void,
    ) => ClientUnaryCall,
    req: Req,
  ): Promise<Res> {
    return new Promise((resolveP, rejectP) => {
      fn(req, new Metadata(), callOpts(), (err, res) => {
        if (err) rejectP(err);
        else resolveP(res);
      });
    });
  }
}

// --------------------- pure mappers (proto → domain) ----------------------

function mapKnownEntry(e: KnownEntry): KnownOrch {
  return {
    address: e.ethAddress,
    mode: mapResolveMode(e.mode),
    freshnessStatus: mapFreshness(e.freshnessStatus),
    cachedAt: e.cachedAt ? e.cachedAt.getTime() : null,
  };
}

function mapResolveResult(r: ResolveResult): ResolvedOrch {
  return {
    address: r.ethAddress,
    resolvedUri: r.resolvedUri,
    mode: mapResolveMode(r.mode),
    nodes: r.nodes.map(mapNode),
    freshnessStatus: mapFreshness(r.freshnessStatus),
    cachedAt: r.cachedAt ? r.cachedAt.getTime() : null,
    fetchedAt: r.fetchedAt ? r.fetchedAt.getTime() : null,
    schemaVersion: r.schemaVersion,
  };
}

function mapNode(n: ProtoNode): ResolvedNode {
  const capabilities = n.capabilities.map((c) => c.name);
  const models = n.capabilities.flatMap((c) => c.models.map((m) => m.id));
  return {
    id: n.id,
    url: n.url,
    region: n.region,
    capabilities,
    models,
    signatureStatus: mapSignature(n.signatureStatus),
    operatorAddress: n.operatorAddress,
    enabled: n.enabled,
    tierAllowed: [...n.tierAllowed],
    weight: n.weight,
  };
}

function mapAuditEvent(e: AuditEvent): ResolverAuditEntry {
  return {
    occurredAt: e.at ? e.at.getTime() : 0,
    orchAddress: e.ethAddress || null,
    kind: e.kind,
    mode: mapResolveMode(e.mode),
    detail: e.detail,
  };
}

function mapResolveMode(m: ResolveMode): ResolveModeLabel {
  switch (m) {
    case ResolveMode.RESOLVE_MODE_WELL_KNOWN:
      return "well-known";
    case ResolveMode.RESOLVE_MODE_CSV:
      return "csv";
    case ResolveMode.RESOLVE_MODE_LEGACY:
      return "legacy";
    default:
      return "unspecified";
  }
}

function mapFreshness(f: FreshnessStatus): FreshnessLabel {
  switch (f) {
    case FreshnessStatus.FRESHNESS_FRESH:
      return "fresh";
    case FreshnessStatus.FRESHNESS_STALE_RECOVERABLE:
      return "stale-recoverable";
    case FreshnessStatus.FRESHNESS_STALE_FAILING:
      return "stale-failing";
    default:
      return "unknown";
  }
}

function mapSignature(s: SignatureStatus): SignatureLabel {
  switch (s) {
    case SignatureStatus.SIGNATURE_STATUS_VERIFIED:
      return "verified";
    case SignatureStatus.SIGNATURE_STATUS_UNSIGNED:
      return "unsigned";
    case SignatureStatus.SIGNATURE_STATUS_LEGACY:
      return "legacy";
    default:
      return "unknown";
  }
}

function isStatus(err: unknown, code: number): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === code
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
