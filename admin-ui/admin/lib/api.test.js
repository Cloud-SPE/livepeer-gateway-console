import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, setSession } from "./session.js";
import { listOrchs, searchCapabilities } from "./api.js";

describe("admin api helpers", () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal("sessionStorage", {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        store.set(key, value);
      },
      removeItem: (key) => {
        store.delete(key);
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ ok: true }),
      })),
    );
    setSession("token-123", "op-mike");
  });

  afterEach(() => {
    clearSession();
    vi.unstubAllGlobals();
  });

  it("searchCapabilities() sends offering-based select queries", async () => {
    await searchCapabilities({
      capability: "openai:/v1/chat/completions",
      offering: "gpt-oss-20b",
      tier: "preferred",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/capabilities/search?capability=openai%3A%2Fv1%2Fchat%2Fcompletions&offering=gpt-oss-20b&tier=preferred",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          authorization: "Bearer token-123",
          "x-actor": "op-mike",
        }),
      }),
    );
  });

  it("listOrchs() forwards offering filters", async () => {
    await listOrchs({ capability: "whisper", offering: "whisper-large" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/orchs?capability=whisper&offering=whisper-large",
      expect.any(Object),
    );
  });
});
