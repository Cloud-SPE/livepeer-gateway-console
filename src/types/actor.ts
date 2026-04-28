// Operator handle attached to every audit-log row. Captured at sign-in by
// the SPA, sent on every /api/* request via `X-Actor`. Self-asserted — the
// bearer is the actual gate; this is "which laptop did this".

import { z } from 'zod';

export const ActorHandleSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9._-]+$/, {
    message: 'Actor handle must be lower-case alphanumeric, dot, underscore, or hyphen.',
  });

export type ActorHandle = z.infer<typeof ActorHandleSchema>;
