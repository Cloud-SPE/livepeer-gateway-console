// Sender-domain service — exposes the hot wallet's address + chain
// balance and the TicketBroker escrow snapshot via PayerDaemon. The
// payment-daemon owns the keystore via its own bind-mount; this service
// only ever reads.

import type { PayerDaemonClient } from '../../providers/payerDaemon/client.js';
import type { SenderEscrow, SenderWallet } from '../../types/sender.js';

export interface SenderService {
  getWallet(): Promise<SenderWallet>;
  getEscrow(): Promise<SenderEscrow>;
}

export interface SenderServiceDeps {
  payer: PayerDaemonClient;
}

export function createSenderService(deps: SenderServiceDeps): SenderService {
  return {
    async getWallet() {
      const info = await deps.payer.getWalletInfo();
      return {
        address: info.address,
        balanceWei: info.balanceWei,
        minBalanceWei: info.minBalanceWei,
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
