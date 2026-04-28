// GET /api/sender/escrow — TicketBroker deposit + reserve via the
// PayerDaemon. Read-only; the daemon owns the keystore and we never
// see the signing key.

import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SenderService } from '../../../service/sender/index.js';

const QuerySchema = z.object({}).strict();

export interface HandleGetSenderEscrowDeps {
  sender: SenderService;
}

export async function handleGetSenderEscrow(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleGetSenderEscrowDeps,
): Promise<void> {
  QuerySchema.parse(req.query ?? {});
  const escrow = await deps.sender.getEscrow();
  await reply.send(escrow);
}
