// Audit-log row shape — every operator action through this console.

import { z } from 'zod';

export const AuditEventSchema = z.object({
  id: z.number().int().positive(),
  occurredAt: z.number().int().positive(),
  actor: z.string().min(1).max(120),
  action: z.string().min(1).max(120),
  target: z.string().max(240).nullable(),
  ok: z.boolean(),
  message: z.string().max(2000).nullable(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AppendAuditEventInputSchema = AuditEventSchema.omit({
  id: true,
  occurredAt: true,
});

export type AppendAuditEventInput = z.infer<typeof AppendAuditEventInputSchema>;
