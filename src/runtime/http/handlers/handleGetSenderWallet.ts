// GET /api/sender/wallet — hot-wallet identity + chain balance.
//
// 503 with `wallet_not_configured` when SENDER_ADDRESS env is unset.
// (Auth still applies — this is /api/* like everything else.)

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  SenderWalletNotConfiguredError,
  type SenderService,
} from "../../../service/sender/index.js";

const QuerySchema = z.object({}).strict();

export interface HandleGetSenderWalletDeps {
  sender: SenderService;
}

export async function handleGetSenderWallet(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleGetSenderWalletDeps,
): Promise<void> {
  QuerySchema.parse(req.query ?? {});
  try {
    const wallet = await deps.sender.getWallet();
    await reply.send(wallet);
  } catch (err) {
    if (err instanceof SenderWalletNotConfiguredError) {
      await reply.code(503).send({
        error: { code: "wallet_not_configured", message: err.message },
      });
      return;
    }
    throw err;
  }
}
