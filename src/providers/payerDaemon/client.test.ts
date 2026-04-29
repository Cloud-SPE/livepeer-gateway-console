// PayerDaemon client integration test against a real @grpc/grpc-js
// server bound to a tmp unix socket. Verifies GetDepositInfo decoding
// (big-endian wei buffers → decimal strings), ping() liveness path,
// and the per-call deadline.

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
import {
  PayerDaemonService,
  type GetDepositInfoRequest,
  type GetDepositInfoResponse,
  type StartSessionRequest,
  type StartSessionResponse,
  type CreatePaymentRequest,
  type CreatePaymentResponse,
  type PayerDaemonCloseSessionRequest,
  type PayerDaemonCloseSessionResponse,
} from "./gen/livepeer/payments/v1/payer_daemon.js";
import { createPayerDaemonClient, type PayerDaemonClient } from "./client.js";

interface FakeServer {
  socketPath: string;
  server: Server;
  /** When true, getDepositInfo sleeps past the client deadline. */
  slowMode: { enabled: boolean };
}

let fake: FakeServer;
let client: PayerDaemonClient;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "payer-test-"));
  const socketPath = join(tmpDir, "payer.sock");
  fake = await startFakeServer(socketPath);
  client = createPayerDaemonClient({ socketPath, callDeadlineMs: 250 });
});

afterAll(async () => {
  client.close();
  await new Promise<void>((resolve) =>
    fake.server.tryShutdown(() => resolve()),
  );
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("PayerDaemonClient", () => {
  it("getDepositInfo() decodes big-endian wei buffers to decimal strings", async () => {
    const info = await client.getDepositInfo();
    // 0x0de0b6b3a7640000 = 10^18 wei (1 ETH)
    expect(info.depositWei).toBe("1000000000000000000");
    // 0x4563918244f40000 = 5 * 10^18 wei (5 ETH)
    expect(info.reserveWei).toBe("5000000000000000000");
    expect(info.withdrawRound).toBe("0");
  });

  it("ping() returns ok when getDepositInfo round-trips", async () => {
    const res = await client.ping();
    expect(res).toEqual({ ok: true });
  });

  it("per-call deadline triggers DeadlineExceeded", async () => {
    fake.slowMode.enabled = true;
    try {
      await expect(client.getDepositInfo()).rejects.toMatchObject({
        code: grpcStatus.DEADLINE_EXCEEDED,
      });
    } finally {
      fake.slowMode.enabled = false;
    }
  });

  it("ping() reports ok=false with error when RPC fails", async () => {
    fake.slowMode.enabled = true;
    try {
      const res = await client.ping();
      expect(res.ok).toBe(false);
      expect(res.error).toBeTruthy();
    } finally {
      fake.slowMode.enabled = false;
    }
  });
});

// --------------------------- fake server -------------------------------

async function startFakeServer(socketPath: string): Promise<FakeServer> {
  const slowMode = { enabled: false };
  const server = new Server();
  server.addService(PayerDaemonService, {
    getDepositInfo(
      _call: ServerUnaryCall<GetDepositInfoRequest, GetDepositInfoResponse>,
      cb: sendUnaryData<GetDepositInfoResponse>,
    ) {
      const respond = (): void =>
        cb(null, {
          // 1 ETH in big-endian wei bytes (0x0de0b6b3a7640000).
          deposit: Buffer.from("0de0b6b3a7640000", "hex"),
          // 5 ETH in big-endian wei bytes (0x4563918244f40000).
          reserve: Buffer.from("4563918244f40000", "hex"),
          withdrawRound: 0n,
        });
      if (slowMode.enabled) {
        // Sleep past the client's 250ms deadline.
        setTimeout(respond, 800);
      } else {
        respond();
      }
    },
    // Unused RPCs — the console never calls these but the service
    // implementation must define them. Reject so accidental wiring is
    // surfaced loudly in tests.
    startSession(
      _call: ServerUnaryCall<StartSessionRequest, StartSessionResponse>,
      cb: sendUnaryData<StartSessionResponse>,
    ) {
      cb(
        {
          code: grpcStatus.UNIMPLEMENTED,
          details: "startSession not used by console",
        } as never,
        null,
      );
    },
    createPayment(
      _call: ServerUnaryCall<CreatePaymentRequest, CreatePaymentResponse>,
      cb: sendUnaryData<CreatePaymentResponse>,
    ) {
      cb(
        {
          code: grpcStatus.UNIMPLEMENTED,
          details: "createPayment not used by console",
        } as never,
        null,
      );
    },
    closeSession(
      _call: ServerUnaryCall<
        PayerDaemonCloseSessionRequest,
        PayerDaemonCloseSessionResponse
      >,
      cb: sendUnaryData<PayerDaemonCloseSessionResponse>,
    ) {
      cb(
        {
          code: grpcStatus.UNIMPLEMENTED,
          details: "closeSession not used by console",
        } as never,
        null,
      );
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

  return { socketPath, server, slowMode };
}
