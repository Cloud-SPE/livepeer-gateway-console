// Consolidated tests for the simple GET handlers — service deps are
// stubbed; req/reply are minimal shims. The Refresh handlers have their
// own dedicated test (they need DB-backed audit assertions).

import { describe, expect, it, vi } from "vitest";
import type {
  ResolverClient,
  ResolvedOrch,
} from "../../../providers/resolver/client.js";
import type { ResolverService } from "../../../service/resolver/index.js";
import type { RoutingService } from "../../../service/routing/index.js";
import type { SenderService } from "../../../service/sender/index.js";
import type { AuditService } from "../../../service/audit/index.js";
import { handleCapabilitySearch } from "./handleCapabilitySearch.js";
import { handleGetOrch } from "./handleGetOrch.js";
import { handleGetSenderEscrow } from "./handleGetSenderEscrow.js";
import { handleGetSenderWallet } from "./handleGetSenderWallet.js";
import { handleHealth } from "./handleHealth.js";
import { handleListAuditLog } from "./handleListAuditLog.js";
import { handleListOrchs } from "./handleListOrchs.js";
import { handleListResolverAuditLog } from "./handleListResolverAuditLog.js";
import { SenderWalletNotConfiguredError } from "../../../service/sender/index.js";

const ORCH_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

interface FakeReply {
  send: ReturnType<typeof vi.fn>;
  code: ReturnType<typeof vi.fn>;
  body?: unknown;
  status?: number;
}

function makeReply(): FakeReply {
  const reply: FakeReply = { send: vi.fn(), code: vi.fn() };
  reply.send.mockImplementation(async (body: unknown) => {
    reply.body = body;
    return reply;
  });
  reply.code.mockImplementation((s: number) => {
    reply.status = s;
    return reply;
  });
  return reply;
}

function makeReq(
  o: { actor?: string; query?: unknown; params?: unknown; body?: unknown } = {},
) {
  return {
    actor: o.actor ?? "op-mike",
    query: o.query ?? {},
    params: o.params ?? {},
    body: o.body ?? null,
  };
}

// ---------------- handleListOrchs ----------------

describe("handleListOrchs", () => {
  it("passes Zod-validated filter to routing.listOrchs and returns {orchs}", async () => {
    const listOrchs = vi.fn(async () => [
      rosterRow(ORCH_A, ["whisper"], ["whisper-large"]),
    ]);
    const reply = makeReply();
    await handleListOrchs(
      makeReq({ query: { capability: "whisper" } }) as never,
      reply as never,
      { routing: makeRouting({ listOrchs }) },
    );
    expect(listOrchs).toHaveBeenCalled();
    expect(reply.body).toMatchObject({ orchs: expect.any(Array) });
  });

  it("client-side filters by capability + model", async () => {
    const listOrchs = vi.fn(async () => [
      rosterRow(ORCH_A, ["whisper"], ["whisper-large"]),
      rosterRow(
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ["transcode"],
        [],
      ),
    ]);
    const reply = makeReply();
    await handleListOrchs(
      makeReq({
        query: { capability: "whisper", model: "whisper-large" },
      }) as never,
      reply as never,
      { routing: makeRouting({ listOrchs }) },
    );
    const body = reply.body as { orchs: Array<{ address: string }> };
    expect(body.orchs.map((o) => o.address)).toEqual([ORCH_A]);
  });

  it("rejects unknown query keys (strict)", async () => {
    const reply = makeReply();
    await expect(
      handleListOrchs(
        makeReq({ query: { capability: "a", extra: "x" } }) as never,
        reply as never,
        { routing: makeRouting({}) },
      ),
    ).rejects.toThrow();
  });
});

// ---------------- handleGetOrch ----------------

describe("handleGetOrch", () => {
  it("returns the orch + recent observations", async () => {
    const getOrch = vi.fn(async () => ({
      orch: rosterRow(ORCH_A, [], []),
      recentObservations: [],
    }));
    const reply = makeReply();
    await handleGetOrch(
      makeReq({ params: { address: ORCH_A } }) as never,
      reply as never,
      { routing: makeRouting({ getOrch }) },
    );
    expect(reply.body).toMatchObject({ orch: { address: ORCH_A } });
  });

  it("returns 404 when both orch and observations are empty", async () => {
    const getOrch = vi.fn(async () => ({ orch: null, recentObservations: [] }));
    const reply = makeReply();
    await handleGetOrch(
      makeReq({ params: { address: ORCH_A } }) as never,
      reply as never,
      { routing: makeRouting({ getOrch }) },
    );
    expect(reply.status).toBe(404);
    expect(reply.body).toMatchObject({
      error: { code: "orch_not_found", address: ORCH_A },
    });
  });

  it("rejects malformed addresses", async () => {
    const reply = makeReply();
    await expect(
      handleGetOrch(
        makeReq({ params: { address: "nope" } }) as never,
        reply as never,
        { routing: makeRouting({}) },
      ),
    ).rejects.toThrow();
  });
});

// ---------------- handleCapabilitySearch ----------------

describe("handleCapabilitySearch", () => {
  it("forwards capability/model/tier to resolver.search", async () => {
    const search = vi.fn(async () => ({
      orchAddress: ORCH_A,
      reason: "top-weighted",
      nodes: [],
    }));
    const reply = makeReply();
    await handleCapabilitySearch(
      makeReq({
        query: {
          capability: "whisper",
          model: "whisper-large",
          tier: "tier-0",
        },
      }) as never,
      reply as never,
      { resolver: makeResolverService({ search }) },
    );
    expect(search).toHaveBeenCalledWith({
      capability: "whisper",
      model: "whisper-large",
      tier: "tier-0",
    });
    expect(reply.body).toMatchObject({ orchAddress: ORCH_A });
  });

  it("omits undefined optional fields", async () => {
    const search = vi.fn(async () => ({
      orchAddress: null,
      reason: "no node matched",
      nodes: [],
    }));
    const reply = makeReply();
    await handleCapabilitySearch(
      makeReq({ query: { capability: "whisper" } }) as never,
      reply as never,
      { resolver: makeResolverService({ search }) },
    );
    expect(search).toHaveBeenCalledWith({ capability: "whisper" });
  });
});

// ---------------- handleGetSenderWallet ----------------

describe("handleGetSenderWallet", () => {
  it("returns the wallet on the happy path", async () => {
    const getWallet = vi.fn(async () => ({
      address: "0xc",
      balanceWei: "1000000000000000000",
      minBalanceWei: null,
    }));
    const reply = makeReply();
    await handleGetSenderWallet(makeReq() as never, reply as never, {
      sender: makeSender({ getWallet }),
    });
    expect(reply.body).toMatchObject({ address: "0xc" });
  });

  it("maps SenderWalletNotConfiguredError to 503 wallet_not_configured", async () => {
    const reply = makeReply();
    await handleGetSenderWallet(makeReq() as never, reply as never, {
      sender: makeSender({
        getWallet: async () => {
          throw new SenderWalletNotConfiguredError();
        },
      }),
    });
    expect(reply.status).toBe(503);
    expect(reply.body).toMatchObject({
      error: { code: "wallet_not_configured" },
    });
  });

  it("rethrows other errors", async () => {
    const reply = makeReply();
    await expect(
      handleGetSenderWallet(makeReq() as never, reply as never, {
        sender: makeSender({
          getWallet: async () => {
            throw new Error("rpc down");
          },
        }),
      }),
    ).rejects.toThrow(/rpc down/);
  });
});

// ---------------- handleGetSenderEscrow ----------------

describe("handleGetSenderEscrow", () => {
  it("returns the escrow snapshot", async () => {
    const getEscrow = vi.fn(async () => ({
      depositWei: "1",
      reserveWei: "2",
      observedAt: 9,
    }));
    const reply = makeReply();
    await handleGetSenderEscrow(makeReq() as never, reply as never, {
      sender: makeSender({ getEscrow }),
    });
    expect(reply.body).toMatchObject({ depositWei: "1", observedAt: 9 });
  });
});

// ---------------- handleHealth ----------------

describe("handleHealth", () => {
  it("200 when both daemons ping ok", async () => {
    const reply = makeReply();
    await handleHealth(makeReq() as never, reply as never, {
      resolver: makeResolverClient({ ping: async () => ({ ok: true }) }),
      payer: {
        ping: async () => ({ ok: true }),
        getDepositInfo: async () => ({
          depositWei: "0",
          reserveWei: "0",
          withdrawRound: "0",
        }),
        close: () => undefined,
      },
      resolverSocketPath: "/tmp/r.sock",
      senderSocketPath: "/tmp/s.sock",
    });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ ok: true });
  });

  it("503 when one daemon reports unavailable", async () => {
    const reply = makeReply();
    await handleHealth(makeReq() as never, reply as never, {
      resolver: makeResolverClient({
        ping: async () => ({ ok: false, error: "down" }),
      }),
      payer: {
        ping: async () => ({ ok: true }),
        getDepositInfo: async () => ({
          depositWei: "0",
          reserveWei: "0",
          withdrawRound: "0",
        }),
        close: () => undefined,
      },
      resolverSocketPath: "/tmp/r.sock",
      senderSocketPath: "/tmp/s.sock",
    });
    expect(reply.status).toBe(503);
    expect(reply.body).toMatchObject({ ok: false });
  });
});

// ---------------- handleListAuditLog ----------------

describe("handleListAuditLog", () => {
  it("forwards limit + before to audit.listRecent", async () => {
    const listRecent = vi.fn(async () => []);
    const reply = makeReply();
    await handleListAuditLog(
      makeReq({ query: { limit: "10", before: "99" } }) as never,
      reply as never,
      { audit: { listRecent, append: async () => undefined } as AuditService },
    );
    expect(listRecent).toHaveBeenCalledWith({ limit: 10, before: 99 });
    expect(reply.body).toMatchObject({ events: [] });
  });
});

// ---------------- handleListResolverAuditLog ----------------

describe("handleListResolverAuditLog", () => {
  it("forwards optional filters to resolver.fetchAuditLog", async () => {
    const fetchAuditLog = vi.fn(async () => []);
    const reply = makeReply();
    await handleListResolverAuditLog(
      makeReq({
        query: { since: "1700000000000", limit: "50", ethAddress: ORCH_A },
      }) as never,
      reply as never,
      { resolver: makeResolverService({ fetchAuditLog }) },
    );
    expect(fetchAuditLog).toHaveBeenCalledWith({
      since: 1700000000000,
      limit: 50,
      ethAddress: ORCH_A,
    });
  });
});

// --------------------------- helpers -----------------------------------

function rosterRow(addr: string, capabilities: string[], models: string[]) {
  return {
    address: addr,
    serviceUri: null,
    capabilities,
    models,
    signatureStatus: "unknown" as const,
    freshnessStatus: "unknown" as const,
    activePoolMember: false,
    totalStakeWei: null,
    lastObservedAt: null,
  };
}

function makeRouting(overrides: Partial<RoutingService>): RoutingService {
  return {
    listOrchs: async () => [],
    getOrch: async () => ({ orch: null, recentObservations: [] }),
    listObservations: async () => [],
    ...overrides,
  };
}

function makeResolverService(
  overrides: Partial<ResolverService>,
): ResolverService {
  return {
    search: async () => ({
      orchAddress: null,
      reason: "no node matched",
      nodes: [],
    }),
    refresh: async () => undefined,
    fetchAuditLog: async () => [],
    ...overrides,
  };
}

function makeSender(overrides: Partial<SenderService>): SenderService {
  return {
    getWallet: async () => ({
      address: "0xc",
      balanceWei: "0",
      minBalanceWei: null,
    }),
    getEscrow: async () => ({
      depositWei: "0",
      reserveWei: "0",
      observedAt: 0,
    }),
    ...overrides,
  };
}

function makeResolverClient(
  overrides: Partial<ResolverClient>,
): ResolverClient {
  return {
    ping: async () => ({ ok: true }),
    listKnown: async () => [],
    resolveByAddress: async () => null as unknown as ResolvedOrch | null,
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
