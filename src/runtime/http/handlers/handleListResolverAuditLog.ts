// GET /api/resolver/audit-log — pulls Resolver.GetAuditLog from the
// daemon socket and returns the mapped events. Read-only.

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ResolverService } from "../../../service/resolver/index.js";

const QuerySchema = z.strictObject({
  since: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  ethAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, {
      message: "Expected 0x-prefixed 40-hex address",
    })
    .optional(),
});

export interface HandleListResolverAuditLogDeps {
  resolver: ResolverService;
}

export async function handleListResolverAuditLog(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleListResolverAuditLogDeps,
): Promise<void> {
  const { since, limit, ethAddress } = QuerySchema.parse(req.query ?? {});
  const events = await deps.resolver.fetchAuditLog({
    ...(since !== undefined ? { since } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(ethAddress !== undefined ? { ethAddress } : {}),
  });
  await reply.send({ events });
}
