-- Hand-authored bootstrap migration. Future schema changes go through
-- `npm run db:generate` (drizzle-kit). Snapshot files live alongside.

CREATE TABLE `audit_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `occurred_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `actor` text NOT NULL,
  `action` text NOT NULL,
  `target` text,
  `ok` integer NOT NULL,
  `message` text
);

CREATE INDEX `idx_audit_occurred_at` ON `audit_events` (`occurred_at`);

CREATE TABLE `routing_observations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `observed_at` integer NOT NULL,
  `orch_address` text NOT NULL,
  `capability` text,
  `model` text,
  `signature_status` text,
  `freshness_status` text,
  `details_json` text
);

CREATE INDEX `idx_routing_observations_orch` ON `routing_observations` (`orch_address`, `observed_at`);
