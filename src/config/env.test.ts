// Bootstrap-time placeholder. Real coverage of the env loader lands in
// per-repo Plan 0001 §1 alongside the rest of the test floor.

import { describe, expect, it } from "vitest";
import { loadEnv, parseListenAddr } from "./env.js";

describe("parseListenAddr", () => {
  it("parses host:port", () => {
    expect(parseListenAddr("127.0.0.1:8080")).toEqual({
      host: "127.0.0.1",
      port: 8080,
    });
  });

  it("rejects missing port", () => {
    expect(() => parseListenAddr("127.0.0.1")).toThrow();
  });

  it("rejects out-of-range port", () => {
    expect(() => parseListenAddr("127.0.0.1:99999")).toThrow();
  });
});

describe("loadEnv", () => {
  it("rejects short ADMIN_TOKEN", () => {
    expect(() =>
      loadEnv({ ADMIN_TOKEN: "too-short", CHAIN_RPC: "https://example/rpc" }),
    ).toThrow(/ADMIN_TOKEN/);
  });

  it("accepts a valid env", () => {
    const env = loadEnv({
      ADMIN_TOKEN: "a".repeat(32),
      CHAIN_RPC: "https://example/rpc",
    });
    expect(env.LISTEN_ADDR).toBe("127.0.0.1:8080");
    expect(env.CHAIN_ID).toBe(42_161);
    expect(env.RESOLVER_SOCKET_PATH).toContain("resolver");
    expect(env.SENDER_SOCKET_PATH).toContain("sender");
  });
});
