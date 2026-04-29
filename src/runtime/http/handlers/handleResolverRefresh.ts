// POST /api/resolver/refresh                  — wildcard refresh ("*", force=true)
// POST /api/resolver/refresh/:address          — per-orch refresh
//
// Idempotent at the daemon (proto contract). Every successful or failed
// attempt appends an audit_events row attributed to req.actor so the
// console's own bearer-action log shows who hit Refresh and when.

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuditService } from "../../../service/audit/index.js";
import type { ResolverService } from "../../../service/resolver/index.js";

const ParamsSchema = z.strictObject({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
    message: "Expected 0x-prefixed 40-hex address",
  }),
});

const EmptyBodySchema = z
  .union([z.strictObject({}), z.null(), z.undefined()])
  .optional();

export interface HandleResolverRefreshDeps {
  resolver: ResolverService;
  audit: AuditService;
}

export async function handleResolverRefresh(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleResolverRefreshDeps,
): Promise<void> {
  EmptyBodySchema.parse(req.body);
  await runRefresh(req, reply, deps, { target: "*" });
}

export async function handleResolverRefreshOne(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleResolverRefreshDeps,
): Promise<void> {
  const { address } = ParamsSchema.parse(req.params ?? {});
  await runRefresh(req, reply, deps, { target: address });
}

async function runRefresh(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleResolverRefreshDeps,
  ctx: { target: string },
): Promise<void> {
  try {
    const callTarget = ctx.target === "*" ? {} : { address: ctx.target };
    await deps.resolver.refresh(callTarget);
    await deps.audit.append({
      actor: req.actor,
      action: "resolver.refresh",
      target: ctx.target,
      ok: true,
      message: null,
    });
    await reply.send({ ok: true, target: ctx.target });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.audit.append({
      actor: req.actor,
      action: "resolver.refresh",
      target: ctx.target,
      ok: false,
      message,
    });
    throw err;
  }
}
