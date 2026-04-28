// Sender-side types: the gateway operator's hot-wallet view (chain balance)
// and TicketBroker escrow snapshot pulled via PayerDaemon.GetDepositInfo.

import { z } from 'zod';

const EthAddressLike = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, { message: 'Expected 0x-prefixed 40-hex address' });

export const SenderWalletSchema = z.object({
  address: EthAddressLike,
  /** Balance in wei, as a decimal string (BigInt-safe over JSON). */
  balanceWei: z.string(),
  /** Configured floor below which the daemon refuses to issue tickets. */
  minBalanceWei: z.string().nullable(),
});

export type SenderWallet = z.infer<typeof SenderWalletSchema>;

export const SenderEscrowSchema = z.object({
  /** Sender's TicketBroker deposit (wei, decimal string). */
  depositWei: z.string(),
  /** Sender's TicketBroker reserve (wei, decimal string). */
  reserveWei: z.string(),
  /** When this escrow snapshot was captured (unix epoch ms). */
  observedAt: z.number().int().positive(),
});

export type SenderEscrow = z.infer<typeof SenderEscrowSchema>;
