// Drizzle SQLite schema. Single state.db file (path = STATE_PATH). Two
// tables per Plan 0013 §B: audit_events, routing_observations.
//
// `audit_events` records every operator action through this console
// (login, resolver refresh, etc.). `routing_observations` is a
// periodically-hydrated mirror of the resolver's audit-log entries —
// the per-orch drilldown panels query this for routing-history charts
// without round-tripping the resolver socket on every page render.

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    occurredAt: integer('occurred_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    ok: integer('ok').notNull(),
    message: text('message'),
  },
  (t) => ({
    occurredAtIdx: index('idx_audit_occurred_at').on(t.occurredAt),
  }),
);

export const routingObservations = sqliteTable(
  'routing_observations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    observedAt: integer('observed_at').notNull(),
    orchAddress: text('orch_address').notNull(),
    capability: text('capability'),
    model: text('model'),
    signatureStatus: text('signature_status'),
    freshnessStatus: text('freshness_status'),
    detailsJson: text('details_json'),
  },
  (t) => ({
    orchObservedIdx: index('idx_routing_observations_orch').on(t.orchAddress, t.observedAt),
  }),
);

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type AuditEventInsert = typeof auditEvents.$inferInsert;

export type RoutingObservationRow = typeof routingObservations.$inferSelect;
export type RoutingObservationInsert = typeof routingObservations.$inferInsert;
