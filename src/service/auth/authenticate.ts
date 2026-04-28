// Bearer-token validation. Compares against the configured ADMIN_TOKEN in
// constant time. Per Plan 0013 §A this is the ONLY auth scheme — no OIDC,
// no sessions, no cookies.

import { timingSafeEqual } from 'node:crypto';

export class MalformedAuthorizationError extends Error {
  constructor(reason: string) {
    super(`malformed Authorization header: ${reason}`);
    this.name = 'MalformedAuthorizationError';
  }
}

export class InvalidAdminTokenError extends Error {
  constructor() {
    super('invalid admin token');
    this.name = 'InvalidAdminTokenError';
  }
}

export interface AuthService {
  /** Returns the actor identifier (a static `"operator"` for v1) on success;
   *  throws on any failure. */
  authenticate(authorizationHeader: string | undefined): string;
}

export interface AuthServiceDeps {
  adminToken: string;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const expected = Buffer.from(deps.adminToken, 'utf8');

  return {
    authenticate(header) {
      const provided = parseBearer(header);
      const providedBuf = Buffer.from(provided, 'utf8');
      if (
        providedBuf.length !== expected.length ||
        !timingSafeEqual(providedBuf, expected)
      ) {
        throw new InvalidAdminTokenError();
      }
      // v1: a single ADMIN_TOKEN means a single actor identity. The login
      // screen still asks for an "operator handle" purely for the audit
      // log; the actor below is the env-var name, not the handle.
      return 'ADMIN_TOKEN';
    },
  };
}

function parseBearer(header: string | undefined): string {
  if (!header) throw new MalformedAuthorizationError('missing header');
  const parts = header.trim().split(/\s+/);
  const scheme = parts[0];
  const token = parts[1];
  const rest = parts.slice(2);
  if (scheme?.toLowerCase() !== 'bearer') {
    throw new MalformedAuthorizationError('expected Bearer scheme');
  }
  if (!token || rest.length > 0) {
    throw new MalformedAuthorizationError('expected exactly one token');
  }
  return token;
}
