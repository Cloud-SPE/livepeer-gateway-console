// PayerDaemon gRPC client provider — wraps the buf-generated stubs at
// `./gen/` behind the small interface the gateway-console actually uses.
// The `gen/` directory is populated by `npm run proto:gen:payments` from
// `../livepeer-modules-project/payment-daemon/proto`.
//
// Surface area: the console only ever reads `GetDepositInfo`. The other
// PayerDaemon RPCs (StartSession / CreatePayment / CloseSession) belong
// to the bridge app, not this console — see PRODUCT_SENSE.md.
//
// Wallet identity + balance are NOT exposed by the daemon proto; per
// Plan 0001 they come from chain via ChainReader (§4) configured with a
// SENDER_ADDRESS env var.

import { credentials, Metadata } from "@grpc/grpc-js";
import type { CallOptions, ClientUnaryCall, ServiceError } from "@grpc/grpc-js";
import {
  PayerDaemonClient as PayerDaemonGrpcClient,
  type GetDepositInfoRequest,
  type GetDepositInfoResponse,
} from "./gen/livepeer/payments/v1/payer_daemon.js";

export interface DepositInfo {
  /** TicketBroker deposit in wei, decimal string (BigInt-safe over JSON). */
  depositWei: string;
  /** TicketBroker reserve in wei, decimal string. */
  reserveWei: string;
  /** Round at which an initiated unlock becomes withdrawable. 0 if no unlock pending. */
  withdrawRound: string;
}

export interface PayerDaemonClient {
  ping(): Promise<{ ok: boolean; error?: string }>;
  getDepositInfo(): Promise<DepositInfo>;
  close(): void;
}

export interface PayerDaemonClientOptions {
  socketPath: string;
  /** Per-call deadline in ms. Default 2000. */
  callDeadlineMs?: number;
}

export function createPayerDaemonClient(
  options: PayerDaemonClientOptions,
): PayerDaemonClient {
  const deadlineMs = options.callDeadlineMs ?? 2000;
  const target = `unix:${options.socketPath}`;
  const grpc = new PayerDaemonGrpcClient(target, credentials.createInsecure());

  const callOpts = (): Partial<CallOptions> => ({
    deadline: new Date(Date.now() + deadlineMs),
  });

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

  async function getDepositInfoInternal(): Promise<DepositInfo> {
    const res = await unary<GetDepositInfoRequest, GetDepositInfoResponse>(
      (r, md, o, cb) => grpc.getDepositInfo(r, md, o, cb),
      {},
    );
    return {
      depositWei: bigEndianBytesToDecimal(res.deposit),
      reserveWei: bigEndianBytesToDecimal(res.reserve),
      withdrawRound: res.withdrawRound.toString(10),
    };
  }

  return {
    async ping() {
      // PayerDaemon has no Health RPC; GetDepositInfo is read-only and
      // a faithful liveness check (proto doc: "the daemon does not fund
      // escrow"). Discard the result; we only care that it round-tripped.
      try {
        await getDepositInfoInternal();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
    getDepositInfo: getDepositInfoInternal,
    close() {
      grpc.close();
    },
  };
}

function bigEndianBytesToDecimal(buf: Buffer): string {
  if (buf.length === 0) return "0";
  return BigInt(`0x${buf.toString("hex")}`).toString(10);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
