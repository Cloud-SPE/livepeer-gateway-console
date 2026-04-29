// Routing-observations repository — bulk-insert hydration + per-orch
// recent-history read. Hydrated by a background worker that pulls
// `Resolver.GetAuditLog` on a configurable cadence; per-repo Plan 0001
// drives that loop.

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./db.js";
import {
  routingObservations,
  type RoutingObservationInsert,
  type RoutingObservationRow,
} from "./schema.js";

export async function appendBatch(
  db: Db,
  rows: RoutingObservationInsert[],
): Promise<void> {
  if (rows.length === 0) return;
  db.insert(routingObservations).values(rows).run();
}

export interface ListByOrchOptions {
  limit?: number;
}

export async function listRecentForOrch(
  db: Db,
  orchAddress: string,
  options: ListByOrchOptions = {},
): Promise<RoutingObservationRow[]> {
  const limit = options.limit ?? 200;
  return db
    .select()
    .from(routingObservations)
    .where(eq(routingObservations.orchAddress, orchAddress))
    .orderBy(desc(routingObservations.observedAt))
    .limit(limit)
    .all();
}

export async function listRecentForOrchAndCapability(
  db: Db,
  orchAddress: string,
  capability: string,
  options: ListByOrchOptions = {},
): Promise<RoutingObservationRow[]> {
  const limit = options.limit ?? 200;
  return db
    .select()
    .from(routingObservations)
    .where(
      and(
        eq(routingObservations.orchAddress, orchAddress),
        eq(routingObservations.capability, capability),
      ),
    )
    .orderBy(desc(routingObservations.observedAt))
    .limit(limit)
    .all();
}
