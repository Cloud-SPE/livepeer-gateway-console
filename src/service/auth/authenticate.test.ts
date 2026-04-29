// Bootstrap-time placeholder. Real coverage lands in per-repo Plan 0001.

import { describe, expect, it } from "vitest";
import {
  createAuthService,
  InvalidAdminTokenError,
  MalformedAuthorizationError,
} from "./authenticate.js";

describe("AuthService", () => {
  const adminToken = "a".repeat(32);
  const auth = createAuthService({ adminToken });

  it("returns the env-var name on a matching token", () => {
    expect(auth.authenticate(`Bearer ${adminToken}`)).toBe("ADMIN_TOKEN");
  });

  it("rejects a mismatched token", () => {
    expect(() => auth.authenticate(`Bearer ${"b".repeat(32)}`)).toThrow(
      InvalidAdminTokenError,
    );
  });

  it("rejects a missing header", () => {
    expect(() => auth.authenticate(undefined)).toThrow(
      MalformedAuthorizationError,
    );
  });

  it("rejects a wrong scheme", () => {
    expect(() => auth.authenticate(`Basic ${adminToken}`)).toThrow(
      MalformedAuthorizationError,
    );
  });
});
