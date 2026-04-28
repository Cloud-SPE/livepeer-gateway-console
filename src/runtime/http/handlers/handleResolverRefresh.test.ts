// Tests for the two Refresh handlers — verifies that every call
// (success or failure) appends an audit_events row attributed to the
// actor who triggered it.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSqlite, type SqliteHandle } from '../../../providers/database/sqlite.js';
import { createAuditService } from '../../../service/audit/index.js';
import type { ResolverService } from '../../../service/resolver/index.js';
import {
  handleResolverRefresh,
  handleResolverRefreshOne,
} from './handleResolverRefresh.js';

const ORCH_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

let tmpDir: string;
let sqlite: SqliteHandle;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'refresh-test-'));
  sqlite = openSqlite({ path: join(tmpDir, 'state.db') });
  const migration = readFileSync(
    resolve(__dirname, '..', '..', '..', '..', 'migrations', '0001_init.sql'),
    'utf8',
  );
  sqlite.raw.exec(migration);
});

afterEach(() => {
  sqlite.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

interface FakeReply {
  send: ReturnType<typeof vi.fn>;
  code: ReturnType<typeof vi.fn>;
  body?: unknown;
  status?: number;
}

function makeReply(): FakeReply {
  const reply: FakeReply = { send: vi.fn(), code: vi.fn() };
  reply.send.mockImplementation(async (body: unknown) => {
    reply.body = body;
    return reply;
  });
  reply.code.mockImplementation((s: number) => {
    reply.status = s;
    return reply;
  });
  return reply;
}

function makeReq(overrides: { actor?: string; params?: unknown; body?: unknown } = {}) {
  return {
    actor: overrides.actor ?? 'op-mike',
    params: overrides.params ?? {},
    body: overrides.body ?? null,
  };
}

describe('handleResolverRefresh (wildcard)', () => {
  it('appends an ok=true audit row and replies 200 on success', async () => {
    const refresh = vi.fn(async () => undefined);
    const resolver = makeResolver({ refresh });
    const audit = createAuditService({ db: sqlite.db });
    const reply = makeReply();

    await handleResolverRefresh(
      makeReq() as never,
      reply as never,
      { resolver, audit },
    );

    expect(refresh).toHaveBeenCalledWith({});
    expect(reply.body).toEqual({ ok: true, target: '*' });

    const events = await audit.listRecent();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: 'op-mike',
      action: 'resolver.refresh',
      target: '*',
      ok: true,
      message: null,
    });
  });

  it('appends an ok=false audit row and rethrows on resolver failure', async () => {
    const refresh = vi.fn(async () => {
      throw new Error('socket EPIPE');
    });
    const resolver = makeResolver({ refresh });
    const audit = createAuditService({ db: sqlite.db });
    const reply = makeReply();

    await expect(
      handleResolverRefresh(makeReq() as never, reply as never, { resolver, audit }),
    ).rejects.toThrow(/socket EPIPE/);

    const events = await audit.listRecent();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: 'op-mike',
      action: 'resolver.refresh',
      target: '*',
      ok: false,
      message: 'socket EPIPE',
    });
  });
});

describe('handleResolverRefreshOne (per-orch)', () => {
  it('passes the validated address to the resolver service', async () => {
    const refresh = vi.fn(async () => undefined);
    const resolver = makeResolver({ refresh });
    const audit = createAuditService({ db: sqlite.db });
    const reply = makeReply();

    await handleResolverRefreshOne(
      makeReq({ params: { address: ORCH_A } }) as never,
      reply as never,
      { resolver, audit },
    );

    expect(refresh).toHaveBeenCalledWith({ address: ORCH_A });
    expect(reply.body).toEqual({ ok: true, target: ORCH_A });

    const events = await audit.listRecent();
    expect(events[0]).toMatchObject({ target: ORCH_A, ok: true });
  });

  it('rejects malformed addresses before any resolver call', async () => {
    const refresh = vi.fn(async () => undefined);
    const resolver = makeResolver({ refresh });
    const audit = createAuditService({ db: sqlite.db });
    const reply = makeReply();

    await expect(
      handleResolverRefreshOne(
        makeReq({ params: { address: 'nope' } }) as never,
        reply as never,
        { resolver, audit },
      ),
    ).rejects.toThrow();

    expect(refresh).not.toHaveBeenCalled();
    const events = await audit.listRecent();
    expect(events).toEqual([]);
  });
});

function makeResolver(overrides: Partial<ResolverService> = {}): ResolverService {
  return {
    search: async () => ({ orchAddress: null, reason: 'no node matched', nodes: [] }),
    refresh: async () => undefined,
    fetchAuditLog: async () => [],
    ...overrides,
  };
}
