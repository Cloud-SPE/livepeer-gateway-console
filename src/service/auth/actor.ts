// X-Actor header parsing. The bearer (authenticate.ts) is the gate; the
// handle here is self-asserted operator attribution that lands in audit
// rows. Both errors map to 400 in the runtime; they are NOT auth failures.

import { ActorHandleSchema } from '../../types/actor.js';

export class MissingActorError extends Error {
  constructor() {
    super('missing X-Actor header');
    this.name = 'MissingActorError';
  }
}

export class MalformedActorError extends Error {
  constructor(reason: string) {
    super(`malformed X-Actor header: ${reason}`);
    this.name = 'MalformedActorError';
  }
}

export function parseActor(headerValue: string | undefined): string {
  if (headerValue === undefined) throw new MissingActorError();
  const trimmed = headerValue.trim();
  if (trimmed.length === 0) throw new MissingActorError();
  const result = ActorHandleSchema.safeParse(trimmed);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'invalid handle';
    throw new MalformedActorError(message);
  }
  return result.data;
}
