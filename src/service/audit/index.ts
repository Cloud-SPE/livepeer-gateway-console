// Audit listing service — read-only counterpart to the per-action audit
// appends elsewhere in the service layer. Domain layer because the
// handler shouldn't reach into repo directly per the existing pattern.

import type { Db } from '../../repo/db.js';
import { auditEventsRepo } from '../../repo/index.js';
import type { AuditEventRow } from '../../repo/schema.js';
import type { AuditEvent } from '../../types/audit.js';

export interface AuditService {
  listRecent(options?: { limit?: number; before?: number }): Promise<AuditEvent[]>;
}

export interface AuditServiceDeps {
  db: Db;
}

export function createAuditService(deps: AuditServiceDeps): AuditService {
  return {
    async listRecent(options = {}) {
      const rows = await auditEventsRepo.listRecent(deps.db, options);
      return rows.map(rowToDomain);
    },
  };
}

function rowToDomain(r: AuditEventRow): AuditEvent {
  return {
    id: r.id,
    occurredAt: r.occurredAt,
    actor: r.actor,
    action: r.action,
    target: r.target,
    ok: r.ok === 1,
    message: r.message,
  };
}
