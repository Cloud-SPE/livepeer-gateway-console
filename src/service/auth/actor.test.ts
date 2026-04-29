import { describe, expect, it } from "vitest";
import { MalformedActorError, MissingActorError, parseActor } from "./actor.js";

describe("parseActor", () => {
  it("returns the validated handle", () => {
    expect(parseActor("alice")).toBe("alice");
    expect(parseActor("a-b_c.1")).toBe("a-b_c.1");
  });

  it("trims whitespace", () => {
    expect(parseActor("  bob  ")).toBe("bob");
  });

  it("throws MissingActorError on undefined / empty", () => {
    expect(() => parseActor(undefined)).toThrow(MissingActorError);
    expect(() => parseActor("")).toThrow(MissingActorError);
    expect(() => parseActor("   ")).toThrow(MissingActorError);
  });

  it("throws MalformedActorError on invalid characters", () => {
    expect(() => parseActor("Alice")).toThrow(MalformedActorError); // uppercase
    expect(() => parseActor("a b")).toThrow(MalformedActorError); // space
    expect(() => parseActor("a@b")).toThrow(MalformedActorError); // @
  });

  it("throws MalformedActorError on excessive length", () => {
    expect(() => parseActor("a".repeat(65))).toThrow(MalformedActorError);
  });
});
