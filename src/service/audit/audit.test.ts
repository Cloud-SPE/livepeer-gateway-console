import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSqlite, type SqliteHandle } from '../../providers/database/sqlite.js';
import { createAuditService } from './index.js';

let tmpDir: string;
let sqlite: SqliteHandle;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'audit-test-'));
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

describe('AuditService', () => {
  it('append + listRecent round-trip preserves fields and serializes ok 0/1', async () => {
    const svc = createAuditService({ db: sqlite.db });
    await svc.append({ actor: 'alice', action: 'login', target: null, ok: true, message: null });
    await svc.append({
      actor: 'alice',
      action: 'resolver.refresh',
      target: '*',
      ok: false,
      message: 'EPIPE',
    });

    const events = await svc.listRecent();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      actor: 'alice',
      action: 'resolver.refresh',
      target: '*',
      ok: false,
      message: 'EPIPE',
    });
    expect(events[1]).toMatchObject({ action: 'login', ok: true });
  });

  it('listRecent paginates via the `before` cursor', async () => {
    const svc = createAuditService({ db: sqlite.db });
    for (let i = 0; i < 5; i += 1) {
      await svc.append({
        actor: 'alice',
        action: `act-${i}`,
        target: null,
        ok: true,
        message: null,
      });
    }
    const firstPage = await svc.listRecent({ limit: 2 });
    expect(firstPage).toHaveLength(2);
    const nextPage = await svc.listRecent({ limit: 2, before: firstPage[1]?.id });
    expect(nextPage).toHaveLength(2);
    expect(nextPage[0]?.id).toBeLessThan(firstPage[1]?.id ?? 0);
  });
});
