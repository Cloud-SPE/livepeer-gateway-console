// GET /api/capabilities/search — capability/offering search via
// `Resolver.Select`. Operator picks (capability, offering, tier?); the
// daemon returns the selected route.

import type { FastifyReply, FastifyRequest } from "fastify";
import type { ResolverService } from "../../../service/resolver/index.js";
import { CapabilitySearchQuerySchema } from "../../../types/routing.js";

export interface HandleCapabilitySearchDeps {
  resolver: ResolverService;
}

export async function handleCapabilitySearch(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleCapabilitySearchDeps,
): Promise<void> {
  const query = CapabilitySearchQuerySchema.parse(req.query ?? {});
  const result = await deps.resolver.search({
    capability: query.capability,
    offering: query.offering,
    ...(query.tier !== undefined ? { tier: query.tier } : {}),
  });
  await reply.send(result);
}
