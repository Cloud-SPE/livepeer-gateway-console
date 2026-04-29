import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkUnixSocket } from "./socketCheck.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sockcheck-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("checkUnixSocket", () => {
  it("returns present=false with ENOENT-style error when path is missing", () => {
    const r = checkUnixSocket(join(tmpDir, "nope.sock"));
    expect(r.present).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("returns present=false when path exists but is a regular file", () => {
    const path = join(tmpDir, "file.txt");
    writeFileSync(path, "not a socket");
    const r = checkUnixSocket(path);
    expect(r.present).toBe(false);
    expect(r.error).toContain("not a socket");
  });
});
