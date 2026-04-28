// auditPoll worker tests — stubbed ResolverClient + real SQLite, watermark
// + dedup behaviour exercised via runOnce(). Doesn't lean on fake timers
// (the interval-driven start/stop path is verified separately by the
// idempotence test).

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSqlite, type SqliteHandle } from '../../providers/database/sqlite.js';
import type {
  ResolverAuditEntry,
  ResolverClient,
} from '../../providers/resolver/client.js';
import { routingObservationsRepo } from '../../repo/index.js';
import type { Logger } from '../../providers/logger/pino.js';
import { createAuditPollWorker } from './auditPoll.js';

const ORCH_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ORCH_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

let tmpDir: string;
let sqlite: SqliteHandle;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'auditpoll-test-'));
  sqlite = openSqlite({ path: join(tmpDir, 'state.db') });
  const migration = readFileSync(
    resolve(__dirname, '..', '..', '..', 'migrations', '0001_init.sql'),
    'utf8',
  );
  sqlite.raw.exec(migration);
});

afterEach(() => {
  sqlite.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('auditPoll worker', () => {
  it('first tick inserts events and advances the watermark', async () => {
    const events: ResolverAuditEntry[] = [
      auditEntry({ occurredAt: 1_700_000_000_000, orchAddress: ORCH_A, kind: 'select' }),
      auditEntry({ occurredAt: 1_700_000_001_000, orchAddress: ORCH_B, kind: 'refresh' }),
    ];
    const resolver = makeResolver({ getAuditLog: vi.fn(async () => events) });
    const worker = createAuditPollWorker({
      resolver,
      db: sqlite.db,
      logger: silentLogger(),
      intervalMs: 1000,
    });

    const result = await worker.runOnce();
    expect(result.inserted).toBe(2);
    expect(result.watermark).toBe(1_700_000_001_001);

    const obsA = await routingObservationsRepo.listRecentForOrch(sqlite.db, ORCH_A);
    expect(obsA).toHaveLength(1);
    expect(obsA[0]).toMatchObject({
      orchAddress: ORCH_A,
      observedAt: 1_700_000_000_000,
      capability: null,
    });
    expect(JSON.parse(obsA[0]?.detailsJson ?? '{}')).toMatchObject({
      kind: 'select',
      detail: 'd',
    });
  });

  it('second tick passes the watermark as `since` and skips already-seen events', async () => {
    const getAuditLog = vi
      .fn<typeof Promise.resolve, [{ since?: number; limit: number }]>()
      .mockResolvedValueOnce([
        auditEntry({ occurredAt: 1_700_000_000_000, orchAddress: ORCH_A, kind: 'select' }),
        auditEntry({ occurredAt: 1_700_000_005_000, orchAddress: ORCH_A, kind: 'select' }),
      ])
      .mockResolvedValueOnce([]);
    const resolver = makeResolver({ getAuditLog: getAuditLog as never });
    const worker = createAuditPollWorker({
      resolver,
      db: sqlite.db,
      logger: silentLogger(),
      intervalMs: 1000,
    });

    const first = await worker.runOnce();
    expect(first.inserted).toBe(2);
    const second = await worker.runOnce();
    expect(second.inserted).toBe(0);

    expect(getAuditLog).toHaveBeenNthCalledWith(1, { limit: 1000 });
    expect(getAuditLog).toHaveBeenNthCalledWith(2, {
      since: 1_700_000_005_001,
      limit: 1000,
    });
  });

  it('skips events with no orch address', async () => {
    const resolver = makeResolver({
      getAuditLog: vi.fn(async () => [
        auditEntry({ occurredAt: 1_700_000_000_000, orchAddress: null, kind: 'cache.rebuild' }),
        auditEntry({ occurredAt: 1_700_000_001_000, orchAddress: ORCH_A, kind: 'select' }),
      ]),
    });
    const worker = createAuditPollWorker({
      resolver,
      db: sqlite.db,
      logger: silentLogger(),
      intervalMs: 1000,
    });

    const result = await worker.runOnce();
    expect(result.inserted).toBe(1);
    const all = await routingObservationsRepo.listRecentForOrch(sqlite.db, ORCH_A);
    expect(all).toHaveLength(1);
  });

  it('does not advance the watermark when the resolver throws', async () => {
    const getAuditLog = vi
      .fn<typeof Promise.resolve, [{ since?: number; limit: number }]>()
      .mockRejectedValueOnce(new Error('socket EPIPE'))
      .mockResolvedValueOnce([
        auditEntry({ occurredAt: 1_700_000_000_000, orchAddress: ORCH_A, kind: 'select' }),
      ]);
    const resolver = makeResolver({ getAuditLog: getAuditLog as never });
    const worker = createAuditPollWorker({
      resolver,
      db: sqlite.db,
      logger: silentLogger(),
      intervalMs: 1000,
    });

    await expect(worker.runOnce()).rejects.toThrow(/EPIPE/);
    expect(worker.watermark()).toBeNull();

    const second = await worker.runOnce();
    expect(second.inserted).toBe(1);
    expect(second.watermark).toBe(1_700_000_000_001);
    // First call had no `since`; second also had no `since` (watermark wasn't poisoned).
    expect(getAuditLog).toHaveBeenNthCalledWith(2, { limit: 1000 });
  });

  it('start() with intervalMs=0 is a no-op', () => {
    const logger = silentLogger();
    const worker = createAuditPollWorker({
      resolver: makeResolver({}),
      db: sqlite.db,
      logger,
      intervalMs: 0,
    });
    worker.start();
    worker.stop(); // should not throw
    expect(worker.watermark()).toBeNull();
  });
});

// -------------------------- helpers ------------------------------------

function auditEntry(overrides: Partial<ResolverAuditEntry>): ResolverAuditEntry {
  return {
    occurredAt: 1_700_000_000_000,
    orchAddress: ORCH_A,
    kind: 'select',
    mode: 'well-known',
    detail: 'd',
    ...overrides,
  };
}

function makeResolver(overrides: Partial<ResolverClient>): ResolverClient {
  return {
    ping: async () => ({ ok: true }),
    listKnown: async () => [],
    resolveByAddress: async () => null,
    select: async () => ({ orchAddress: null, reason: 'no node matched', nodes: [] }),
    refresh: async () => undefined,
    getAuditLog: async () => [],
    close: () => undefined,
    ...overrides,
  };
}

function silentLogger(): Logger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
}
