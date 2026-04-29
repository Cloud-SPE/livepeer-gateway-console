// Sender service tests — both deps stubbed (PayerDaemonClient + ChainReader).

import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import type { ChainReader } from "../../providers/chain/viem.js";
import type { PayerDaemonClient } from "../../providers/payerDaemon/client.js";
import {
  createSenderService,
  SenderWalletNotConfiguredError,
} from "./index.js";

const SENDER: Address = "0xcccccccccccccccccccccccccccccccccccccccc";

function makePayer(
  overrides: Partial<PayerDaemonClient> = {},
): PayerDaemonClient {
  return {
    ping: async () => ({ ok: true }),
    getDepositInfo: async () => ({
      depositWei: "1000000000000000000",
      reserveWei: "5000000000000000000",
      withdrawRound: "0",
    }),
    close: () => undefined,
    ...overrides,
  };
}

function makeChain(overrides: Partial<ChainReader> = {}): ChainReader {
  return {
    chainId: 42_161,
    resolveBondingManager: async () => "0x0" as Address,
    resolveTicketBroker: async () => "0x0" as Address,
    resolveServiceRegistry: async () => "0x0" as Address,
    bondingManagerListPool: async () => [],
    getReserveInfo: async () => ({ depositWei: "0", reserveWei: "0" }),
    readServiceUri: async () => "",
    getBalance: async () => "0",
    ...overrides,
  };
}

describe("SenderService.getWallet", () => {
  it("returns chain balance + minBalanceWei when SENDER_ADDRESS is configured", async () => {
    const getBalance = vi.fn(async () => "7250000000000000000");
    const svc = createSenderService({
      payer: makePayer(),
      chain: makeChain({ getBalance }),
      senderAddress: SENDER,
      minBalanceWei: "1000000000000000000",
    });
    const wallet = await svc.getWallet();
    expect(wallet).toEqual({
      address: SENDER,
      balanceWei: "7250000000000000000",
      minBalanceWei: "1000000000000000000",
    });
    expect(getBalance).toHaveBeenCalledWith(SENDER);
  });

  it("passes through null minBalanceWei", async () => {
    const svc = createSenderService({
      payer: makePayer(),
      chain: makeChain({ getBalance: async () => "0" }),
      senderAddress: SENDER,
      minBalanceWei: null,
    });
    const wallet = await svc.getWallet();
    expect(wallet.minBalanceWei).toBeNull();
  });

  it("throws SenderWalletNotConfiguredError when senderAddress is null", async () => {
    const svc = createSenderService({
      payer: makePayer(),
      chain: makeChain(),
      senderAddress: null,
      minBalanceWei: null,
    });
    await expect(svc.getWallet()).rejects.toThrow(
      SenderWalletNotConfiguredError,
    );
  });
});

describe("SenderService.getEscrow", () => {
  it("round-trips PayerDaemon.GetDepositInfo and stamps observedAt", async () => {
    const before = Date.now();
    const svc = createSenderService({
      payer: makePayer({
        getDepositInfo: async () => ({
          depositWei: "111",
          reserveWei: "222",
          withdrawRound: "3",
        }),
      }),
      chain: makeChain(),
      senderAddress: null,
      minBalanceWei: null,
    });
    const escrow = await svc.getEscrow();
    expect(escrow.depositWei).toBe("111");
    expect(escrow.reserveWei).toBe("222");
    expect(escrow.observedAt).toBeGreaterThanOrEqual(before);
  });
});
