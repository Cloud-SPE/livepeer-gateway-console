// GET /api/orchs/:address — per-orch drilldown.
//
// The address path param is Zod-validated so the handler never reaches
// chain or resolver with a non-eth string. 404 if the resolver doesn't
// know this orch (and we have no observations for it either).

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { RoutingService } from "../../../service/routing/index.js";

const ParamsSchema = z
  .object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
      message: "Expected 0x-prefixed 40-hex address",
    }),
  })
  .strict();

export interface HandleGetOrchDeps {
  routing: RoutingService;
}

export async function handleGetOrch(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleGetOrchDeps,
): Promise<void> {
  const { address } = ParamsSchema.parse(req.params ?? {});
  const result = await deps.routing.getOrch(address);
  if (!result.orch && result.recentObservations.length === 0) {
    await reply.code(404).send({ error: { code: "orch_not_found", address } });
    return;
  }
  await reply.send(result);
}
