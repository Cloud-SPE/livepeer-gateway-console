// GET /api/audit-log — paginated read of the console's own
// bearer-action audit log. Cursor: opaque autoincrement-id boundary
// (`before=N` returns rows with id < N, ordered desc).

import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuditService } from '../../../service/audit/index.js';

const QuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    before: z.coerce.number().int().positive().optional(),
  })
  .strict();

export interface HandleListAuditLogDeps {
  audit: AuditService;
}

export async function handleListAuditLog(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleListAuditLogDeps,
): Promise<void> {
  const { limit, before } = QuerySchema.parse(req.query ?? {});
  const events = await deps.audit.listRecent({
    ...(limit !== undefined ? { limit } : {}),
    ...(before !== undefined ? { before } : {}),
  });
  await reply.send({ events });
}
