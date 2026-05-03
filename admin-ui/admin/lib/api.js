import { createApi } from "../../shared/lib/api-base.js";
import { GATEWAY_EVENTS, emit } from "../../shared/lib/events.js";
import { clearSession, getActor, getToken } from "./session.js";

const api = createApi({
  baseUrl: "",
  getAuthHeaders() {
    const t = getToken();
    const a = getActor();
    const headers = {};
    if (t) headers.authorization = `Bearer ${t}`;
    if (a) headers["x-actor"] = a;
    return headers;
  },
  onUnauthorized() {
    clearSession();
    emit(GATEWAY_EVENTS.UNAUTHORIZED);
  },
  parseResponse(_method, _path, body) {
    return body;
  },
});

// --- routing dashboard ---
export function listOrchs(filter = {}) {
  const q = new URLSearchParams();
  if (filter.capability) q.set("capability", filter.capability);
  if (filter.offering) q.set("offering", filter.offering);
  const suffix = q.toString() ? `?${q}` : "";
  return api.get(`/api/orchs${suffix}`);
}

/** @param {string} address */
export function getOrch(address) {
  return api.get(`/api/orchs/${encodeURIComponent(address)}`);
}

/** @param {{ capability: string, offering: string, tier?: string }} query */
export function searchCapabilities(query) {
  const q = new URLSearchParams();
  q.set("capability", query.capability);
  q.set("offering", query.offering);
  if (query.tier) q.set("tier", query.tier);
  return api.get(`/api/capabilities/search?${q}`);
}

// --- sender ---
export function getSenderWallet() {
  return api.get("/api/sender/wallet");
}

export function getSenderEscrow() {
  return api.get("/api/sender/escrow");
}

// --- resolver actions ---
export function refreshResolver() {
  return api.post("/api/resolver/refresh", {});
}

/** @param {string} address */
export function refreshResolverByAddress(address) {
  return api.post(`/api/resolver/refresh/${encodeURIComponent(address)}`, {});
}

/** @param {{ since?: number, limit?: number }} [opts] */
export function getResolverAuditLog(opts = {}) {
  const q = new URLSearchParams();
  if (opts.since !== undefined) q.set("since", String(opts.since));
  if (opts.limit !== undefined) q.set("limit", String(opts.limit));
  const suffix = q.toString() ? `?${q}` : "";
  return api.get(`/api/resolver/audit-log${suffix}`);
}

// --- audit (console's own) ---
/** @param {{ limit?: number, before?: number }} [opts] */
export function listAuditLog(opts = {}) {
  const q = new URLSearchParams();
  if (opts.limit !== undefined) q.set("limit", String(opts.limit));
  if (opts.before !== undefined) q.set("before", String(opts.before));
  const suffix = q.toString() ? `?${q}` : "";
  return api.get(`/api/audit-log${suffix}`);
}

// --- health (used at sign-in) ---
export function getHealth() {
  return api.get("/api/health");
}
