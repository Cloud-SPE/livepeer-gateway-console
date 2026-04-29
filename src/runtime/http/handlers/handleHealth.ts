// /api/health — pings both daemon sockets (resolver + sender) via real
// @grpc/grpc-js clients. Returns 200 when both ping OK; 503 when either
// reports unavailable. The body also surfaces a filesystem-level socket
// presence check so operators can distinguish "daemon container missing"
// from "daemon process unhealthy".

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PayerDaemonClient } from "../../../providers/payerDaemon/client.js";
import type { ResolverClient } from "../../../providers/resolver/client.js";
import { checkUnixSocket } from "../../../utils/socketCheck.js";

const HealthQuerySchema = z.strictObject({});

export interface HandleHealthDeps {
  resolver: ResolverClient;
  payer: PayerDaemonClient;
  resolverSocketPath: string;
  senderSocketPath: string;
}

export async function handleHealth(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: HandleHealthDeps,
): Promise<void> {
  HealthQuerySchema.parse(req.query ?? {});

  const resolverSocket = checkUnixSocket(deps.resolverSocketPath);
  const senderSocket = checkUnixSocket(deps.senderSocketPath);

  const resolverPing = await deps.resolver.ping();
  const payerPing = await deps.payer.ping();

  const ok = resolverPing.ok && payerPing.ok;
  const status = ok ? 200 : 503;

  await reply.code(status).send({
    ok,
    ts: Date.now(),
    resolver: {
      socket: resolverSocket,
      ping: resolverPing,
    },
    sender: {
      socket: senderSocket,
      ping: payerPing,
    },
  });
}
