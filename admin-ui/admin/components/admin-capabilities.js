import { LitElement, html } from "lit";
import { searchCapabilities } from "../lib/api.js";
import { shortAddress } from "../lib/format.js";

/**
 * Capability search — `Resolver.Select` preview. Operator picks
 * (capability, offering, tier?); the daemon returns one selected route.
 */
export class AdminCapabilities extends LitElement {
  static properties = {
    _form: { state: true },
    _result: { state: true },
    _loading: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();
    this._form = { capability: "", offering: "", tier: "" };
    this._result = null;
    this._loading = false;
    this._error = "";
  }

  createRenderRoot() {
    return this;
  }

  async _submit(e) {
    e.preventDefault();
    if (this._loading) return;
    if (!this._form.capability.trim()) {
      this._error = "capability is required";
      return;
    }
    if (!this._form.offering.trim()) {
      this._error = "offering is required";
      return;
    }
    this._loading = true;
    this._error = "";
    this._result = null;
    try {
      const query = {
        capability: this._form.capability.trim(),
        offering: this._form.offering.trim(),
        ...(this._form.tier.trim() ? { tier: this._form.tier.trim() } : {}),
      };
      this._result = await searchCapabilities(query);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._loading = false;
    }
  }

  render() {
    return html`
      <h1>Capability search</h1>
      <p class="muted">
        Preview the selected route for a capability/offering/tier request.
      </p>

      <form class="card" @submit=${(e) => void this._submit(e)} novalidate>
        <div class="field">
          <label for="capability">Capability *</label>
          <input
            id="capability"
            type="text"
            required
            .value=${this._form.capability}
            @input=${(e) => {
              this._form = { ...this._form, capability: e.target.value };
            }}
          />
        </div>
        <div class="field">
          <label for="offering">Offering *</label>
          <input
            id="offering"
            type="text"
            required
            .value=${this._form.offering}
            @input=${(e) => {
              this._form = { ...this._form, offering: e.target.value };
            }}
          />
        </div>
        <div class="field">
          <label for="tier">Tier</label>
          <input
            id="tier"
            type="text"
            .value=${this._form.tier}
            @input=${(e) => {
              this._form = { ...this._form, tier: e.target.value };
            }}
          />
        </div>
        <button type="submit" ?disabled=${this._loading}>
          ${this._loading ? "Searching…" : "Select"}
        </button>
        ${this._error
          ? html`<div class="error" role="alert">${this._error}</div>`
          : ""}
      </form>

      ${this._result ? this._renderResult() : ""}
    `;
  }

  _renderResult() {
    const r = this._result;
    return html`
      <section class="card">
        <h2>Result</h2>
        <dl class="kv">
          <dt>Selected orch</dt>
          <dd>
            ${r.route?.ethAddress
              ? html`<a href="#/orchs/${r.route.ethAddress}"
                  ><code>${shortAddress(r.route.ethAddress)}</code></a
                >`
              : html`<span class="muted">none</span>`}
          </dd>
          <dt>Reason</dt>
          <dd>${r.reason}</dd>
          <dt>Worker URL</dt>
          <dd>${r.route?.workerUrl ?? "—"}</dd>
          <dt>Capability</dt>
          <dd>${r.route?.capability ?? "—"}</dd>
          <dt>Offering</dt>
          <dd>${r.route?.offering ?? "—"}</dd>
          <dt>Wholesale price</dt>
          <dd>${r.route?.pricePerWorkUnitWei ?? "—"}</dd>
          <dt>Work unit</dt>
          <dd>${r.route?.workUnit ?? "—"}</dd>
          <dt>Extra JSON</dt>
          <dd>${r.route?.extraJson ?? "—"}</dd>
          <dt>Constraints JSON</dt>
          <dd>${r.route?.constraintsJson ?? "—"}</dd>
        </dl>
      </section>
    `;
  }
}

if (!customElements.get("admin-capabilities"))
  customElements.define("admin-capabilities", AdminCapabilities);
