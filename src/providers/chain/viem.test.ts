// ChainReader unit test — stubs the viem client per Plan 0001 §2:
// "Tests stub the viem client; live-RPC verification belongs in staging,
// not unit tests."

import { describe, expect, it, vi } from "vitest";
import { keccak256, toBytes, type Address } from "viem";
import { createChainReader, type ChainContractReader } from "./viem.js";

const KECCAK_BONDING_MANAGER = keccak256(toBytes("BondingManager"));
const KECCAK_TICKET_BROKER = keccak256(toBytes("TicketBroker"));
const KECCAK_SERVICE_REGISTRY = keccak256(toBytes("ServiceRegistry"));

const CONTROLLER: Address = "0xD8E8328501E9645d16Cf49539efC04f734606ee4";
const BONDING_MANAGER: Address = "0x35Bcf3c30594191d53231E4FF333E8A770453e40";
const TICKET_BROKER: Address = "0xa8bB618B1520E284046F3dFc448851A1Ff26e41B";
const SERVICE_REGISTRY: Address = "0xC92d3A360b8f9e083bA64DE15D95cF8180b5CeF3";
const ORCH_A: Address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ORCH_B: Address = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SENDER: Address = "0xcccccccccccccccccccccccccccccccccccccccc";
const ZERO: Address = "0x0000000000000000000000000000000000000000";

interface ReadCall {
  address: Address;
  functionName: string;
  args: readonly unknown[] | undefined;
}

function makeReader(
  handle: (call: ReadCall) => unknown,
  opts: { balances?: Record<string, bigint> } = {},
): {
  reader: ChainContractReader;
  calls: ReadCall[];
} {
  const calls: ReadCall[] = [];
  const balances = opts.balances ?? {};
  const reader: ChainContractReader = {
    readContract: vi.fn(
      async (params: {
        address: Address;
        functionName: string;
        args?: readonly unknown[];
      }) => {
        const call: ReadCall = {
          address: params.address,
          functionName: params.functionName,
          args: params.args,
        };
        calls.push(call);
        return handle(call);
      },
    ) as ChainContractReader["readContract"],
    getBalance: vi.fn(async (params: { address: Address }) => {
      return balances[params.address.toLowerCase()] ?? 0n;
    }) as ChainContractReader["getBalance"],
  };
  return { reader, calls };
}

describe("ChainReader", () => {
  it("resolveBondingManager / resolveTicketBroker / resolveServiceRegistry call Controller.getContract", async () => {
    const { reader, calls } = makeReader((call) => {
      if (call.functionName === "getContract") {
        const id = String(call.args?.[0]);
        if (id === KECCAK_BONDING_MANAGER) return BONDING_MANAGER;
        if (id === KECCAK_TICKET_BROKER) return TICKET_BROKER;
        if (id === KECCAK_SERVICE_REGISTRY) return SERVICE_REGISTRY;
      }
      throw new Error(`unexpected call: ${JSON.stringify(call)}`);
    });
    const chain = createChainReader(
      { rpcUrl: "http://stub", chainId: 42_161 },
      reader,
    );

    expect(await chain.resolveBondingManager(CONTROLLER)).toBe(BONDING_MANAGER);
    expect(await chain.resolveTicketBroker(CONTROLLER)).toBe(TICKET_BROKER);
    expect(await chain.resolveServiceRegistry(CONTROLLER)).toBe(
      SERVICE_REGISTRY,
    );
    expect(calls.every((c) => c.address === CONTROLLER)).toBe(true);
    expect(calls.every((c) => c.functionName === "getContract")).toBe(true);
  });

  it("bondingManagerListPool walks first → next → next → zero", async () => {
    const { reader } = makeReader((call) => {
      switch (call.functionName) {
        case "getFirstTranscoderInPool":
          return ORCH_A;
        case "getNextTranscoderInPool": {
          const cur = String(call.args?.[0]).toLowerCase();
          if (cur === ORCH_A.toLowerCase()) return ORCH_B;
          if (cur === ORCH_B.toLowerCase()) return ZERO;
          throw new Error(`unexpected next pivot: ${cur}`);
        }
        case "getDelegator": {
          const who = String(call.args?.[0]).toLowerCase();
          // Tuple shape from BONDING_MANAGER_ABI; only [2] (delegatedAmount) is read.
          if (who === ORCH_A.toLowerCase()) {
            return [0n, 0n, 1_000_000_000_000_000_000n, ZERO, 0n, 0n, 0n, 0n];
          }
          if (who === ORCH_B.toLowerCase()) {
            return [0n, 0n, 5_500_000_000_000_000_000n, ZERO, 0n, 0n, 0n, 0n];
          }
          throw new Error(`unexpected delegator: ${who}`);
        }
        default:
          throw new Error(`unexpected fn: ${call.functionName}`);
      }
    });
    const chain = createChainReader(
      { rpcUrl: "http://stub", chainId: 42_161 },
      reader,
    );

    const entries = await chain.bondingManagerListPool(BONDING_MANAGER);
    expect(entries).toEqual([
      { address: ORCH_A, totalStakeWei: "1000000000000000000" },
      { address: ORCH_B, totalStakeWei: "5500000000000000000" },
    ]);
  });

  it("bondingManagerListPool returns [] when first is zero", async () => {
    const { reader } = makeReader(() => ZERO);
    const chain = createChainReader(
      { rpcUrl: "http://stub", chainId: 42_161 },
      reader,
    );
    expect(await chain.bondingManagerListPool(BONDING_MANAGER)).toEqual([]);
  });

  it("bondingManagerListPool aborts when the safety limit trips", async () => {
    // Fake an infinite linked list: every next points at A.
    const { reader } = makeReader((call) => {
      switch (call.functionName) {
        case "getFirstTranscoderInPool":
          return ORCH_A;
        case "getNextTranscoderInPool":
          return ORCH_A;
        case "getDelegator":
          return [0n, 0n, 1n, ZERO, 0n, 0n, 0n, 0n];
        default:
          throw new Error(`unexpected fn: ${call.functionName}`);
      }
    });
    const chain = createChainReader(
      { rpcUrl: "http://stub", chainId: 42_161 },
      reader,
    );
    await expect(chain.bondingManagerListPool(BONDING_MANAGER)).rejects.toThrow(
      /pool walk exceeded/,
    );
  });

  it("getReserveInfo maps TicketBroker.getSenderInfo to {depositWei, reserveWei}", async () => {
    const { reader, calls } = makeReader((call) => {
      if (
        call.functionName === "getSenderInfo" &&
        call.address === TICKET_BROKER
      ) {
        return [
          { deposit: 2_000_000_000_000_000_000n, withdrawRound: 0n },
          {
            fundsRemaining: 7_500_000_000_000_000_000n,
            claimedInCurrentRound: 0n,
          },
        ];
      }
      throw new Error(`unexpected: ${call.functionName}`);
    });
    const chain = createChainReader(
      { rpcUrl: "http://stub", chainId: 42_161 },
      reader,
    );

    const info = await chain.getReserveInfo(TICKET_BROKER, SENDER);
    expect(info).toEqual({
      depositWei: "2000000000000000000",
      reserveWei: "7500000000000000000",
    });
    expect(calls[0]?.args?.[0]).toBe(SENDER);
  });

  it("readServiceUri returns the string from ServiceRegistry.getServiceURI", async () => {
    const { reader } = makeReader((call) => {
      if (
        call.functionName === "getServiceURI" &&
        call.address === SERVICE_REGISTRY
      ) {
        return "https://orch-a.example/manifest.json";
      }
      throw new Error(`unexpected: ${call.functionName}`);
    });
    const chain = createChainReader(
      { rpcUrl: "http://stub", chainId: 42_161 },
      reader,
    );
    expect(await chain.readServiceUri(SERVICE_REGISTRY, ORCH_A)).toBe(
      "https://orch-a.example/manifest.json",
    );
  });

  it("getBalance returns wei as decimal string", async () => {
    const { reader } = makeReader(
      () => {
        throw new Error("readContract should not be called for getBalance");
      },
      { balances: { [SENDER.toLowerCase()]: 12_500_000_000_000_000_000n } },
    );
    const chain = createChainReader(
      { rpcUrl: "http://stub", chainId: 42_161 },
      reader,
    );
    expect(await chain.getBalance(SENDER)).toBe("12500000000000000000");
  });
});
