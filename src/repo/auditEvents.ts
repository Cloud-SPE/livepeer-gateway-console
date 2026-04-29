// Audit-event repository — append-on-write + cursor-paginated read. The
// service layer builds the input; this file just persists and reads.
// `occurred_at` defaults to unixepoch() * 1000 at the DB so the service
// can omit it.

import { desc, lt } from "drizzle-orm";
import type { Db } from "./db.js";
import {
  auditEvents,
  type AuditEventInsert,
  type AuditEventRow,
} from "./schema.js";

export async function append(db: Db, input: AuditEventInsert): Promise<void> {
  db.insert(auditEvents).values(input).run();
}

export interface ListRecentOptions {
  limit?: number;
  /**
   * Cursor: opaque row-id boundary, only return rows with `id < before`.
   * The SPA derives this from the last-shown row. Using the autoincrement
   * id rather than occurredAt avoids tie-collisions when many events
   * share a millisecond.
   */
  before?: number;
}

export async function listRecent(
  db: Db,
  options: ListRecentOptions = {},
): Promise<AuditEventRow[]> {
  const limit = options.limit ?? 50;
  const base = db.select().from(auditEvents);
  if (options.before !== undefined) {
    return base
      .where(lt(auditEvents.id, options.before))
      .orderBy(desc(auditEvents.id))
      .limit(limit)
      .all();
  }
  return base.orderBy(desc(auditEvents.id)).limit(limit).all();
}
