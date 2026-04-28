// Sender-domain service — exposes the hot wallet's address + chain
// balance and the TicketBroker escrow snapshot.
//
// Wallet: address comes from the SENDER_ADDRESS env (the PayerDaemon
// proto exposes neither identity nor balance), balance comes from
// chain via ChainReader.getBalance. minBalanceWei is informational
// (operator-supplied floor below which tickets get rejected).
//
// Escrow: PayerDaemon.GetDepositInfo. The daemon owns the keystore
// and reads TicketBroker on the operator's behalf; we just decode.

import type { Address } from 'viem';
import type { ChainReader } from '../../providers/chain/viem.js';
import type { PayerDaemonClient } from '../../providers/payerDaemon/client.js';
import type { SenderEscrow, SenderWallet } from '../../types/sender.js';

export class SenderWalletNotConfiguredError extends Error {
  constructor() {
    super(
      'sender wallet view is unavailable: SENDER_ADDRESS env is not ' +
        'set on this gateway-console deployment. Set it to the hot wallet ' +
        'the payment-daemon mounts; the console reads its balance from chain.',
    );
    this.name = 'SenderWalletNotConfiguredError';
  }
}

export interface SenderService {
  getWallet(): Promise<SenderWallet>;
  getEscrow(): Promise<SenderEscrow>;
}

export interface SenderServiceDeps {
  payer: PayerDaemonClient;
  chain: ChainReader;
  /** Hot-wallet address from env. Null when SENDER_ADDRESS is unset. */
  senderAddress: Address | null;
  /** Operator-configured floor below which tickets are refused. */
  minBalanceWei: string | null;
}

export function createSenderService(deps: SenderServiceDeps): SenderService {
  return {
    async getWallet() {
      if (!deps.senderAddress) {
        throw new SenderWalletNotConfiguredError();
      }
      const balanceWei = await deps.chain.getBalance(deps.senderAddress);
      return {
        address: deps.senderAddress,
        balanceWei,
        minBalanceWei: deps.minBalanceWei,
      };
    },
    async getEscrow() {
      const info = await deps.payer.getDepositInfo();
      return {
        depositWei: info.depositWei,
        reserveWei: info.reserveWei,
        observedAt: Date.now(),
      };
    },
  };
}
