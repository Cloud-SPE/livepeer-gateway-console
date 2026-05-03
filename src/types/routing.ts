// Domain types for the routing dashboard. The orch roster row is the
// resolver's `KnownOrch` plus chain-derived enrichment (BondingManager
// stake, ServiceRegistry serviceURI). Per-orch routing observation
// rows are the local mirror of `Resolver.GetAuditLog` entries.

import { z } from "zod";

const EthAddressLike = z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
  message: "Expected 0x-prefixed 40-hex address",
});

export const OrchRosterRowSchema = z.object({
  address: EthAddressLike,
  serviceUri: z.string().nullable(),
  capabilities: z.array(z.string()).default([]),
  offerings: z.array(z.string()).default([]),
  signatureStatus: z.enum(["signed", "unsigned", "unknown"]).default("unknown"),
  freshnessStatus: z.enum(["fresh", "stale", "unknown"]).default("unknown"),
  /** Orchestrator's active-set membership from the BondingManager pool walk. */
  activePoolMember: z.boolean().default(false),
  /** Self-stake + delegated-stake from `getDelegator` (raw wei as string). */
  totalStakeWei: z.string().nullable().default(null),
  lastObservedAt: z.number().int().nullable().default(null),
});

export type OrchRosterRow = z.infer<typeof OrchRosterRowSchema>;

export const RoutingObservationSchema = z.object({
  id: z.number().int().positive(),
  observedAt: z.number().int().positive(),
  orchAddress: EthAddressLike,
  capability: z.string().nullable(),
  offering: z.string().nullable(),
  signatureStatus: z.string().nullable(),
  freshnessStatus: z.string().nullable(),
  detailsJson: z.string().nullable(),
});

export type RoutingObservation = z.infer<typeof RoutingObservationSchema>;

export const CapabilitySearchQuerySchema = z.strictObject({
  capability: z.string().min(1).max(120),
  offering: z.string().min(1).max(240),
  tier: z.string().min(1).max(60).optional(),
});

export type CapabilitySearchQuery = z.infer<typeof CapabilitySearchQuerySchema>;
