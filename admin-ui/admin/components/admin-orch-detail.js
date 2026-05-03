import { LitElement, html } from "lit";
import { getOrch, refreshResolverByAddress } from "../lib/api.js";
import { formatTimestamp, formatWei, shortAddress } from "../lib/format.js";

/**
 * Per-orch direct-link drilldown — `#/orchs/0xabc...`. Loads the orch
 * via getOrch(); 404 path renders a "not known" message rather than
 * crashing.
 */
export class AdminOrchDetail extends LitElement {
  static properties = {
    address: { type: String },
    _data: { state: true },
    _error: { state: true },
    _loading: { state: true },
    _refreshing: { state: true },
  };

  constructor() {
    super();
    this.address = "";
    this._data = null;
    this._error = "";
    this._loading = false;
    this._refreshing = false;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this._load();
  }

  updated(changed) {
    if (changed.has("address")) void this._load();
  }

  async _load() {
    if (!this.address) return;
    this._loading = true;
    this._error = "";
    this._data = null;
    try {
      this._data = await getOrch(this.address);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err ? err.status : 0;
      if (status === 404) {
        this._data = { orch: null, recentObservations: [] };
      } else {
        this._error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      this._loading = false;
    }
  }

  async _refresh() {
    if (this._refreshing) return;
    this._refreshing = true;
    try {
      await refreshResolverByAddress(this.address);
      await this._load();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._refreshing = false;
    }
  }

  render() {
    if (!this.address)
      return html`<p class="error" role="alert">
        Missing orch address in URL.
      </p>`;
    if (this._loading)
      return html`<p class="muted">Loading orch ${this.address}…</p>`;
    if (this._error)
      return html`<div class="error" role="alert">${this._error}</div>`;
    if (!this._data) return html`<p class="muted">No data.</p>`;
    const orch = this._data.orch;
    const observations = this._data.recentObservations ?? [];
    return html`
      <header class="card-header">
        <h1>Orch ${shortAddress(this.address)}</h1>
        <button
          type="button"
          @click=${() => void this._refresh()}
          ?disabled=${this._refreshing}
        >
          ${this._refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>
      <p class="muted"><code>${this.address}</code></p>

      ${orch
        ? html`
            <section class="card">
              <dl class="kv">
                <dt>Service URI</dt>
                <dd>${orch.serviceUri ?? "—"}</dd>
                <dt>Stake</dt>
                <dd>${formatWei(orch.totalStakeWei)}</dd>
                <dt>Active in pool</dt>
                <dd>${orch.activePoolMember ? "yes" : "no"}</dd>
                <dt>Capabilities</dt>
                <dd>
                  ${orch.capabilities.length
                    ? orch.capabilities.join(", ")
                    : "—"}
                </dd>
                <dt>Offerings</dt>
                <dd>
                  ${orch.offerings.length ? orch.offerings.join(", ") : "—"}
                </dd>
                <dt>Signature</dt>
                <dd>
                  <span class="pill pill-${orch.signatureStatus}"
                    >${orch.signatureStatus}</span
                  >
                </dd>
                <dt>Freshness</dt>
                <dd>
                  <span class="pill pill-${orch.freshnessStatus}"
                    >${orch.freshnessStatus}</span
                  >
                </dd>
                <dt>Last observation</dt>
                <dd>${formatTimestamp(orch.lastObservedAt)}</dd>
              </dl>
            </section>
          `
        : html`
            <section class="card">
              <p class="muted">
                Resolver doesn't know this orch.
                ${observations.length === 0
                  ? "And the local mirror has no observations either."
                  : "Showing locally-mirrored observations only."}
              </p>
            </section>
          `}

      <section class="card">
        <h2>Recent routing observations</h2>
        ${observations.length === 0
          ? html`<p class="muted">No observations yet.</p>`
          : html`
              <table class="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Cap.</th>
                    <th>Offering</th>
                    <th>Sig</th>
                    <th>Fresh</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  ${observations.map(
                    (o) => html`
                      <tr>
                        <td>${formatTimestamp(o.observedAt)}</td>
                        <td>${o.capability ?? "—"}</td>
                        <td>${o.offering ?? "—"}</td>
                        <td>${o.signatureStatus ?? "—"}</td>
                        <td>${o.freshnessStatus ?? "—"}</td>
                        <td>
                          ${o.detailsJson
                            ? html`<code>${o.detailsJson}</code>`
                            : "—"}
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `}
      </section>
    `;
  }
}

if (!customElements.get("admin-orch-detail"))
  customElements.define("admin-orch-detail", AdminOrchDetail);
