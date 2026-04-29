import { LitElement, html } from "lit";
import { searchCapabilities } from "../lib/api.js";
import { shortAddress } from "../lib/format.js";

/**
 * Capability search — `Resolver.Select` preview. Operator picks
 * (capability, model?, tier?); the daemon decides which orch wins.
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
    this._form = { capability: "", model: "", tier: "" };
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
    this._loading = true;
    this._error = "";
    this._result = null;
    try {
      const query = {
        capability: this._form.capability.trim(),
        ...(this._form.model.trim() ? { model: this._form.model.trim() } : {}),
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
        Preview which orch the resolver would pick for a capability/model/tier.
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
          <label for="model">Model</label>
          <input
            id="model"
            type="text"
            .value=${this._form.model}
            @input=${(e) => {
              this._form = { ...this._form, model: e.target.value };
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
          <dt>Picked</dt>
          <dd>
            ${r.orchAddress
              ? html`<a href="#/orchs/${r.orchAddress}"
                  ><code>${shortAddress(r.orchAddress)}</code></a
                >`
              : html`<span class="muted">none</span>`}
          </dd>
          <dt>Reason</dt>
          <dd>${r.reason}</dd>
          <dt>Candidates</dt>
          <dd>${r.nodes?.length ?? 0}</dd>
        </dl>

        ${r.nodes?.length
          ? html`
              <table class="data">
                <thead>
                  <tr>
                    <th>Operator</th>
                    <th>URL</th>
                    <th>Region</th>
                    <th>Capabilities</th>
                    <th>Models</th>
                    <th>Sig</th>
                    <th>Weight</th>
                    <th>Tiers</th>
                  </tr>
                </thead>
                <tbody>
                  ${r.nodes.map(
                    (n) => html`
                      <tr>
                        <td>
                          <code
                            >${shortAddress(n.operatorAddress || n.id)}</code
                          >
                        </td>
                        <td>${n.url}</td>
                        <td>${n.region || "—"}</td>
                        <td>${n.capabilities?.join(", ") || "—"}</td>
                        <td>${n.models?.join(", ") || "—"}</td>
                        <td>
                          <span class="pill pill-${n.signatureStatus}"
                            >${n.signatureStatus}</span
                          >
                        </td>
                        <td>${n.weight}</td>
                        <td>${n.tierAllowed?.join(", ") || "—"}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `
          : ""}
      </section>
    `;
  }
}

if (!customElements.get("admin-capabilities"))
  customElements.define("admin-capabilities", AdminCapabilities);
