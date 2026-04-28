// Background worker — polls `Resolver.GetAuditLog` on a configurable
// cadence and bulk-inserts the events into `routing_observations` so
// the per-orch drilldown panel can render its history chart without
// round-tripping the resolver socket.
//
// Dedup strategy: in-memory `since` watermark. After each batch, we
// advance the watermark to `max(occurredAt) + 1ms`; the next call
// passes that as `since` so the daemon only returns newer rows.
//
// Single-flight: a tick that's still running blocks the next interval.
// Failures do NOT advance the watermark, so the next tick retries
// from the same point.

import type { ResolverClient } from '../../providers/resolver/client.js';
import type { Logger } from '../../providers/logger/pino.js';
import type { Db } from '../../repo/db.js';
import { routingObservationsRepo } from '../../repo/index.js';
import type { RoutingObservationInsert } from '../../repo/schema.js';

export interface AuditPollWorker {
  start(): void;
  stop(): void;
  /** Run a single poll synchronously — useful for tests + manual triggers. */
  runOnce(): Promise<{ inserted: number; watermark: number | null }>;
  /** Current watermark (epoch ms), or null before the first successful tick. */
  watermark(): number | null;
}

export interface AuditPollWorkerOptions {
  resolver: ResolverClient;
  db: Db;
  logger: Logger;
  /** Poll interval in ms. 0 disables the loop entirely. */
  intervalMs: number;
  /** Per-tick fetch limit. Default 1000. */
  fetchLimit?: number;
}

export function createAuditPollWorker(opts: AuditPollWorkerOptions): AuditPollWorker {
  const fetchLimit = opts.fetchLimit ?? 1000;
  let watermarkMs: number | null = null;
  let timer: NodeJS.Timeout | null = null;
  let inFlight = false;

  async function tick(): Promise<{ inserted: number; watermark: number | null }> {
    if (inFlight) return { inserted: 0, watermark: watermarkMs };
    inFlight = true;
    try {
      const opts1 = watermarkMs !== null ? { since: watermarkMs } : {};
      const events = await opts.resolver.getAuditLog({
        ...opts1,
        limit: fetchLimit,
      });

      const rows: RoutingObservationInsert[] = [];
      let maxAt = watermarkMs ?? -1;
      for (const e of events) {
        if (!e.orchAddress) continue; // resolver-level events have no orch
        if (e.occurredAt <= 0) continue; // skip undated rows
        rows.push(eventToObservation(e));
        if (e.occurredAt > maxAt) maxAt = e.occurredAt;
      }

      if (rows.length > 0) {
        await routingObservationsRepo.appendBatch(opts.db, rows);
      }
      if (maxAt > (watermarkMs ?? -1)) {
        watermarkMs = maxAt + 1;
      }
      return { inserted: rows.length, watermark: watermarkMs };
    } catch (err) {
      // Don't poison the watermark; next tick will retry from where we left off.
      opts.logger.warn('auditPoll tick failed', {
        error: err instanceof Error ? err.message : String(err),
        watermark: watermarkMs,
      });
      throw err;
    } finally {
      inFlight = false;
    }
  }

  return {
    start() {
      if (timer !== null) return;
      if (opts.intervalMs <= 0) {
        opts.logger.info('auditPoll disabled (interval=0)', {});
        return;
      }
      timer = setInterval(() => {
        tick().catch(() => {
          // already logged in tick(); swallow so the interval keeps firing
        });
      }, opts.intervalMs);
      // Don't keep the event loop alive for the worker alone.
      timer.unref?.();
      opts.logger.info('auditPoll started', { intervalMs: opts.intervalMs });
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
      opts.logger.info('auditPoll stopped', {});
    },
    runOnce: tick,
    watermark: () => watermarkMs,
  };
}

function eventToObservation(e: {
  occurredAt: number;
  orchAddress: string | null;
  kind: string;
  mode: string;
  detail: string;
}): RoutingObservationInsert {
  return {
    observedAt: e.occurredAt,
    orchAddress: (e.orchAddress ?? '').toLowerCase(),
    capability: null,
    model: null,
    signatureStatus: null,
    freshnessStatus: null,
    detailsJson: JSON.stringify({ kind: e.kind, mode: e.mode, detail: e.detail }),
  };
}
