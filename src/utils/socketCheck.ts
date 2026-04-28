// Best-effort filesystem check that a daemon unix socket is present.
// Used by the /api/health handler to surface "is the resolver/sender
// socket actually mounted into the container?" without forcing a real
// gRPC roundtrip on every health call.

import { statSync } from 'node:fs';

export interface SocketCheckResult {
  path: string;
  present: boolean;
  /** Filesystem-level error message if present === false (ENOENT, etc). */
  error?: string;
}

export function checkUnixSocket(path: string): SocketCheckResult {
  try {
    const s = statSync(path);
    if (!s.isSocket()) {
      return { path, present: false, error: 'path exists but is not a socket' };
    }
    return { path, present: true };
  } catch (err) {
    return { path, present: false, error: err instanceof Error ? err.message : String(err) };
  }
}
