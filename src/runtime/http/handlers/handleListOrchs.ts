// Demonstrative handler for GET /api/orchs. Real listing logic lives in
// `service/routing`; the handler parses, calls, and serializes. Per-repo
// Plan 0001 adds chain enrichment (BondingManager pool walk +
// ServiceRegistry serviceURI) on top.

import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RoutingService } from '../../../service/routing/index.js';

const ListOrchsQuerySchema = z
  .object({
    capability: z.string().min(1).max(120).optional(),
    model: z.string().min(1).max(240).optional(),
  })
  .strict();

export interface HandleListOrchsDeps {
  routing: RoutingService;
}

export async function handleListOrchs(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleListOrchsDeps,
): Promise<void> {
  const query = ListOrchsQuerySchema.parse(req.query ?? {});
  const all = await deps.routing.listOrchs();
  const filtered = filterOrchs(all, query);
  await reply.send({ orchs: filtered });
}

function filterOrchs<T extends { capabilities: string[]; models: string[] }>(
  rows: T[],
  query: z.infer<typeof ListOrchsQuerySchema>,
): T[] {
  return rows.filter((r) => {
    if (query.capability && !r.capabilities.includes(query.capability)) return false;
    if (query.model && !r.models.includes(query.model)) return false;
    return true;
  });
}
