// SQLite provider — opens better-sqlite3 and wraps it with drizzle-orm.
// Cross-cutting libraries (better-sqlite3, drizzle-orm/better-sqlite3)
// only enter the codebase here; the rest of the app imports `Db` from
// `src/repo/db.ts` instead.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../repo/schema.js';
import type { Db } from '../../repo/db.js';

export interface OpenSqliteOptions {
  /** Filesystem path to the SQLite file. Parent dir created if missing. */
  path: string;
  /** Open read-only (defaults to false). */
  readonly?: boolean;
}

export interface SqliteHandle {
  db: Db;
  raw: Database.Database;
  close(): void;
}

export function openSqlite(options: OpenSqliteOptions): SqliteHandle {
  mkdirSync(dirname(options.path), { recursive: true });
  const raw = new Database(options.path, {
    readonly: options.readonly ?? false,
    fileMustExist: false,
  });
  // WAL gives concurrent readers without blocking writes — matches the
  // existing daemon `state.db` / `protocol.db` convention upstream.
  raw.pragma('journal_mode = WAL');
  raw.pragma('synchronous = NORMAL');
  raw.pragma('foreign_keys = ON');

  const db = drizzle(raw, { schema }) as unknown as Db;
  return {
    db,
    raw,
    close: () => raw.close(),
  };
}
