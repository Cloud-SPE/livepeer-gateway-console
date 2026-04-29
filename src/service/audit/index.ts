// Audit listing + append service. Read-side feeds /api/audit-log;
// write-side is invoked from the runtime layer on every bearer
// action that mutates daemon state (currently only the two Refresh
// paths).

import type { Db } from "../../repo/db.js";
import { auditEventsRepo } from "../../repo/index.js";
import type { AuditEventRow } from "../../repo/schema.js";
import type { AppendAuditEventInput, AuditEvent } from "../../types/audit.js";

export interface AuditService {
  listRecent(options?: {
    limit?: number;
    before?: number;
  }): Promise<AuditEvent[]>;
  append(input: AppendAuditEventInput): Promise<void>;
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
    async append(input) {
      await auditEventsRepo.append(deps.db, {
        actor: input.actor,
        action: input.action,
        target: input.target ?? null,
        ok: input.ok ? 1 : 0,
        message: input.message ?? null,
      });
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
