// PayerDaemon gRPC client provider — wraps the buf-generated stubs at
// `./gen/` behind the small interface the service layer actually uses.
// Real `@grpc/grpc-js` channel construction (unix-socket dial, retry
// policy, request deadlines) lands in per-repo Plan 0001; today this
// file ships an interface + a "client unavailable" stub so handlers
// can be wired without booting a real daemon at test time.
//
// The `gen/` directory is populated by `npm run proto:gen:payments`
// from `../livepeer-modules-project/payment-daemon/proto`.

export interface DepositInfo {
  /** TicketBroker deposit in wei, decimal string (BigInt-safe). */
  depositWei: string;
  /** TicketBroker reserve in wei, decimal string. */
  reserveWei: string;
}

export interface SenderWalletInfo {
  /** Hot-wallet address as 0x-prefixed 40-hex. */
  address: string;
  /** Wallet balance from chain in wei, decimal string. */
  balanceWei: string;
  /** Daemon's configured floor below which it refuses tickets. */
  minBalanceWei: string | null;
}

export interface PayerDaemonClient {
  ping(): Promise<{ ok: boolean; error?: string }>;
  /** Map to `PayerDaemon.GetDepositInfo`. */
  getDepositInfo(): Promise<DepositInfo>;
  /** Pull the local hot-wallet identity + balance from the daemon. */
  getWalletInfo(): Promise<SenderWalletInfo>;
}

export interface PayerDaemonClientOptions {
  socketPath: string;
}

export class PayerDaemonClientUnavailableError extends Error {
  constructor(method: string, opts: PayerDaemonClientOptions) {
    super(
      `PayerDaemonClient.${method} is not implemented yet (bootstrap stub at ` +
        `socket=${opts.socketPath}). Implement the @grpc/grpc-js channel + ` +
        `the buf-generated payerDaemon/gen client wiring in per-repo Plan 0001.`,
    );
    this.name = 'PayerDaemonClientUnavailableError';
  }
}

/**
 * Bootstrap stub. Returns "unavailable" from ping(); throws on every
 * other RPC. The handler shell uses ping() to drive /api/health into a
 * 503 (rather than a 500) when the socket isn't mounted in dev.
 */
export function createPayerDaemonClient(
  options: PayerDaemonClientOptions,
): PayerDaemonClient {
  return {
    async ping() {
      return {
        ok: false,
        error: `payer daemon client unavailable (socket=${options.socketPath}); see Plan 0001 for impl`,
      };
    },
    async getDepositInfo() {
      throw new PayerDaemonClientUnavailableError('getDepositInfo', options);
    },
    async getWalletInfo() {
      throw new PayerDaemonClientUnavailableError('getWalletInfo', options);
    },
  };
}
