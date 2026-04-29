// Resolver client integration test against a real @grpc/grpc-js server
// bound to a tmp unix socket. Exercises every method the provider exposes
// plus the per-call deadline path.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Server,
  ServerCredentials,
  status as grpcStatus,
  type sendUnaryData,
  type ServerUnaryCall,
} from "@grpc/grpc-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Empty } from "./gen/google/protobuf/empty.js";
import {
  ResolverService,
  type AuditLogResult,
  type GetAuditLogRequest,
  type HealthResult,
  type ListKnownRequest,
  type ListKnownResult,
  type RefreshRequest,
  type ResolveByAddressRequest,
  type ResolveResult,
  type SelectRequest,
  type SelectResult,
} from "./gen/livepeer/registry/v1/resolver.js";
import {
  FreshnessStatus,
  ResolveMode,
  SignatureStatus,
} from "./gen/livepeer/registry/v1/types.js";
import { createResolverClient, type ResolverClient } from "./client.js";

const ORCH_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ORCH_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SLOW_ORCH = "0xcccccccccccccccccccccccccccccccccccccccc";
const MISSING_ORCH = "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead";

interface FakeServer {
  socketPath: string;
  server: Server;
  refreshCalls: RefreshRequest[];
}

let fake: FakeServer;
let client: ResolverClient;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "resolver-test-"));
  const socketPath = join(tmpDir, "resolver.sock");
  fake = await startFakeServer(socketPath);
  client = createResolverClient({ socketPath, callDeadlineMs: 250 });
});

afterAll(async () => {
  client.close();
  await new Promise<void>((resolve) =>
    fake.server.tryShutdown(() => resolve()),
  );
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("ResolverClient", () => {
  it("ping() returns ok when Health RPC succeeds", async () => {
    const res = await client.ping();
    expect(res).toEqual({ ok: true });
  });

  it("listKnown() returns mapped entries", async () => {
    const entries = await client.listKnown();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      address: ORCH_A,
      mode: "well-known",
      freshnessStatus: "fresh",
    });
    expect(entries[0]?.cachedAt).toBeTypeOf("number");
    expect(entries[1]).toMatchObject({
      address: ORCH_B,
      mode: "csv",
      freshnessStatus: "stale-recoverable",
    });
  });

  it("resolveByAddress() returns mapped ResolvedOrch with node capabilities/models", async () => {
    const r = await client.resolveByAddress(ORCH_A);
    expect(r).not.toBeNull();
    expect(r?.address).toBe(ORCH_A);
    expect(r?.resolvedUri).toBe("https://orch-a.example/");
    expect(r?.mode).toBe("well-known");
    expect(r?.freshnessStatus).toBe("fresh");
    expect(r?.nodes).toHaveLength(1);
    expect(r?.nodes[0]).toMatchObject({
      capabilities: ["transcode", "whisper"],
      offerings: ["whisper-large"],
      signatureStatus: "verified",
      operatorAddress: ORCH_A,
    });
  });

  it("resolveByAddress() returns null on NOT_FOUND", async () => {
    const r = await client.resolveByAddress(MISSING_ORCH);
    expect(r).toBeNull();
  });

  it("select() returns top-weighted node + reason", async () => {
    const r = await client.select({
      capability: "whisper",
      offering: "whisper-large",
    });
    expect(r.orchAddress).toBe(ORCH_A);
    expect(r.reason).toBe("top-weighted");
    expect(r.nodes).toHaveLength(1);
  });

  it("select() returns null orchAddress when no node matches", async () => {
    const r = await client.select({ capability: "unobtainium" });
    expect(r.orchAddress).toBeNull();
    expect(r.reason).toBe("no node matched");
    expect(r.nodes).toHaveLength(0);
  });

  it("refresh() wildcard records the request", async () => {
    fake.refreshCalls.length = 0;
    await client.refresh("*", { force: true });
    expect(fake.refreshCalls).toHaveLength(1);
    expect(fake.refreshCalls[0]).toMatchObject({
      ethAddress: "*",
      force: true,
    });
  });

  it("refresh() per-address records the request", async () => {
    fake.refreshCalls.length = 0;
    await client.refresh(ORCH_B);
    expect(fake.refreshCalls).toHaveLength(1);
    expect(fake.refreshCalls[0]).toMatchObject({
      ethAddress: ORCH_B,
      force: false,
    });
  });

  it("getAuditLog() maps proto AuditEvent → ResolverAuditEntry", async () => {
    const events = await client.getAuditLog({ limit: 10 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      orchAddress: ORCH_A,
      kind: "select",
      mode: "well-known",
      detail: "picked top-weighted",
    });
    expect(events[0]?.occurredAt).toBeGreaterThan(0);
  });

  it("per-call deadline triggers DeadlineExceeded", async () => {
    await expect(client.resolveByAddress(SLOW_ORCH)).rejects.toMatchObject({
      code: grpcStatus.DEADLINE_EXCEEDED,
    });
  });
});

// --------------------------- fake server -------------------------------

async function startFakeServer(socketPath: string): Promise<FakeServer> {
  const refreshCalls: RefreshRequest[] = [];
  const server = new Server();
  server.addService(ResolverService, {
    health(
      _call: ServerUnaryCall<Empty, HealthResult>,
      cb: sendUnaryData<HealthResult>,
    ) {
      cb(null, {
        mode: "resolver",
        chainOk: true,
        manifestFetcherOk: true,
        cacheSize: 2,
        lastChainSuccess: new Date(),
      });
    },
    listKnown(
      _call: ServerUnaryCall<ListKnownRequest, ListKnownResult>,
      cb: sendUnaryData<ListKnownResult>,
    ) {
      cb(null, {
        entries: [
          {
            ethAddress: ORCH_A,
            mode: ResolveMode.RESOLVE_MODE_WELL_KNOWN,
            freshnessStatus: FreshnessStatus.FRESHNESS_FRESH,
            cachedAt: new Date("2026-04-28T12:00:00Z"),
          },
          {
            ethAddress: ORCH_B,
            mode: ResolveMode.RESOLVE_MODE_CSV,
            freshnessStatus: FreshnessStatus.FRESHNESS_STALE_RECOVERABLE,
            cachedAt: new Date("2026-04-28T11:50:00Z"),
          },
        ],
      });
    },
    resolveByAddress(
      call: ServerUnaryCall<ResolveByAddressRequest, ResolveResult>,
      cb: sendUnaryData<ResolveResult>,
    ) {
      const addr = call.request.ethAddress;
      if (addr === MISSING_ORCH) {
        cb(
          { code: grpcStatus.NOT_FOUND, details: "no such orch" } as never,
          null,
        );
        return;
      }
      if (addr === SLOW_ORCH) {
        // Sleep past the client's 250ms deadline.
        setTimeout(() => cb(null, emptyResolveResult(addr)), 800);
        return;
      }
      cb(null, {
        ethAddress: addr,
        resolvedUri: "https://orch-a.example/",
        mode: ResolveMode.RESOLVE_MODE_WELL_KNOWN,
        nodes: [
          {
            id: addr,
            url: "https://orch-a.example/inference",
            lat: 0,
            lon: 0,
            region: "us-east",
            capabilities: [
              {
                name: "transcode",
                workUnit: "pixel",
                offerings: [],
                extraJson: Buffer.alloc(0),
              },
              {
                name: "whisper",
                workUnit: "second",
                offerings: [
                  {
                    id: "whisper-large",
                    pricePerWorkUnitWei: "1000",
                    warm: true,
                    constraintsJson: Buffer.alloc(0),
                  },
                ],
                extraJson: Buffer.alloc(0),
              },
            ],
            source: 1,
            signatureStatus: SignatureStatus.SIGNATURE_STATUS_VERIFIED,
            operatorAddress: addr,
            enabled: true,
            tierAllowed: ["tier-0"],
            weight: 100,
          },
        ],
        freshnessStatus: FreshnessStatus.FRESHNESS_FRESH,
        cachedAt: new Date(),
        fetchedAt: new Date(),
        schemaVersion: 1,
      });
    },
    select(
      call: ServerUnaryCall<SelectRequest, SelectResult>,
      cb: sendUnaryData<SelectResult>,
    ) {
      if (call.request.capability === "unobtainium") {
        cb(null, { nodes: [] });
        return;
      }
      cb(null, {
        nodes: [
          {
            id: ORCH_A,
            url: "https://orch-a.example/inference",
            lat: 0,
            lon: 0,
            region: "us-east",
            capabilities: [],
            source: 1,
            signatureStatus: SignatureStatus.SIGNATURE_STATUS_VERIFIED,
            operatorAddress: ORCH_A,
            enabled: true,
            tierAllowed: [],
            weight: 100,
          },
        ],
      });
    },
    refresh(
      call: ServerUnaryCall<RefreshRequest, Empty>,
      cb: sendUnaryData<Empty>,
    ) {
      refreshCalls.push(call.request);
      cb(null, {});
    },
    getAuditLog(
      _call: ServerUnaryCall<GetAuditLogRequest, AuditLogResult>,
      cb: sendUnaryData<AuditLogResult>,
    ) {
      cb(null, {
        events: [
          {
            at: new Date(),
            ethAddress: ORCH_A,
            kind: "select",
            mode: ResolveMode.RESOLVE_MODE_WELL_KNOWN,
            detail: "picked top-weighted",
          },
        ],
      });
    },
  });

  await new Promise<number>((resolve, reject) => {
    server.bindAsync(
      `unix:${socketPath}`,
      ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) reject(err);
        else resolve(port);
      },
    );
  });

  return { socketPath, server, refreshCalls };
}

function emptyResolveResult(addr: string): ResolveResult {
  return {
    ethAddress: addr,
    resolvedUri: "",
    mode: ResolveMode.RESOLVE_MODE_UNSPECIFIED,
    nodes: [],
    freshnessStatus: FreshnessStatus.FRESHNESS_UNSPECIFIED,
    schemaVersion: 0,
  };
}
