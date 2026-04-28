import { LitElement, html } from 'lit';
import {
  getOrch,
  listOrchs,
  refreshResolver,
  refreshResolverByAddress,
} from '../lib/api.js';
import { formatTimestamp, formatWei, shortAddress } from '../lib/format.js';

/**
 * Routing dashboard — the central screen of the operator console.
 * Multi-pane: filter row + orch roster + inline per-orch drilldown.
 */
export class AdminRouting extends LitElement {
  static properties = {
    _orchs: { state: true },
    _filter: { state: true },
    _selected: { state: true },
    _detail: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _refreshing: { state: true },
  };

  constructor() {
    super();
    this._orchs = [];
    this._filter = { capability: '', model: '' };
    this._selected = null;
    this._detail = null;
    this._loading = true;
    this._error = '';
    this._refreshing = false;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this._reload();
  }

  async _reload() {
    this._loading = true;
    this._error = '';
    try {
      const filter = {
        ...(this._filter.capability ? { capability: this._filter.capability } : {}),
        ...(this._filter.model ? { model: this._filter.model } : {}),
      };
      const res = await listOrchs(filter);
      this._orchs = Array.isArray(res?.orchs) ? res.orchs : [];
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._loading = false;
    }
  }

  async _select(address) {
    if (this._selected === address) {
      this._selected = null;
      this._detail = null;
      return;
    }
    this._selected = address;
    this._detail = null;
    try {
      this._detail = await getOrch(address);
    } catch (err) {
      this._detail = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  async _refreshAll() {
    if (this._refreshing) return;
    if (!window.confirm('Refresh ALL orchs from chain? Idempotent but slow.')) return;
    this._refreshing = true;
    try {
      await refreshResolver();
      await this._reload();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._refreshing = false;
    }
  }

  async _refreshOne(address) {
    try {
      await refreshResolverByAddress(address);
      if (this._selected === address) {
        this._detail = await getOrch(address);
      }
      await this._reload();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    }
  }

  render() {
    return html`
      <h1>Routing dashboard</h1>

      <section class="filter-row">
        <input
          type="text"
          placeholder="capability"
          .value=${this._filter.capability}
          @input=${(e) => {
            this._filter = { ...this._filter, capability: e.target.value };
          }}
          @keyup=${(e) => {
            if (e.key === 'Enter') void this._reload();
          }}
        />
        <input
          type="text"
          placeholder="model"
          .value=${this._filter.model}
          @input=${(e) => {
            this._filter = { ...this._filter, model: e.target.value };
          }}
          @keyup=${(e) => {
            if (e.key === 'Enter') void this._reload();
          }}
        />
        <button type="button" @click=${() => void this._reload()}>Apply</button>
        <span class="spacer"></span>
        <button
          type="button"
          @click=${() => void this._refreshAll()}
          ?disabled=${this._refreshing}
        >
          ${this._refreshing ? 'Refreshing…' : 'Refresh all'}
        </button>
      </section>

      ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : ''}

      <section class="roster">
        ${this._loading
          ? html`<p class="muted">Loading orchs…</p>`
          : this._orchs.length === 0
          ? html`<p class="muted">No orchs match this filter.</p>`
          : html`
              <table class="data">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Service URI</th>
                    <th>Stake</th>
                    <th>Active</th>
                    <th>Sig</th>
                    <th>Fresh</th>
                  </tr>
                </thead>
                <tbody>
                  ${this._orchs.map(
                    (o) => html`
                      <tr
                        class=${this._selected === o.address ? 'selected' : ''}
                        @click=${() => void this._select(o.address)}
                      >
                        <td><code>${shortAddress(o.address)}</code></td>
                        <td>${o.serviceUri ?? html`<span class="muted">—</span>`}</td>
                        <td>${formatWei(o.totalStakeWei)}</td>
                        <td>${o.activePoolMember ? 'yes' : 'no'}</td>
                        <td>
                          <span class="pill pill-${o.signatureStatus}"
                            >${o.signatureStatus}</span
                          >
                        </td>
                        <td>
                          <span class="pill pill-${o.freshnessStatus}"
                            >${o.freshnessStatus}</span
                          >
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            `}
      </section>

      ${this._selected ? this._renderDetail() : ''}
    `;
  }

  _renderDetail() {
    if (!this._detail) return html`<p class="muted">Loading orch detail…</p>`;
    if (this._detail.error)
      return html`<div class="error" role="alert">${this._detail.error}</div>`;
    const orch = this._detail.orch;
    const observations = this._detail.recentObservations ?? [];
    return html`
      <section class="card">
        <header class="card-header">
          <h2>Orch ${shortAddress(this._selected)}</h2>
          <div>
            <a href="#/orchs/${this._selected}">open page</a>
            <button type="button" @click=${() => void this._refreshOne(this._selected)}>
              Refresh
            </button>
          </div>
        </header>
        ${orch
          ? html`
              <dl class="kv">
                <dt>Service URI</dt>
                <dd>${orch.serviceUri ?? '—'}</dd>
                <dt>Stake</dt>
                <dd>${formatWei(orch.totalStakeWei)}</dd>
                <dt>Active in pool</dt>
                <dd>${orch.activePoolMember ? 'yes' : 'no'}</dd>
                <dt>Capabilities</dt>
                <dd>
                  ${orch.capabilities.length
                    ? orch.capabilities.join(', ')
                    : html`<span class="muted">none reported</span>`}
                </dd>
                <dt>Models</dt>
                <dd>
                  ${orch.models.length
                    ? orch.models.join(', ')
                    : html`<span class="muted">none reported</span>`}
                </dd>
                <dt>Signature</dt>
                <dd>${orch.signatureStatus}</dd>
                <dt>Freshness</dt>
                <dd>${orch.freshnessStatus}</dd>
              </dl>
            `
          : html`<p class="muted">Resolver does not know this orch.</p>`}
        <h3>Recent routing observations</h3>
        ${observations.length === 0
          ? html`<p class="muted">
              No observations yet. The poll worker hydrates these in the background.
            </p>`
          : html`
              <table class="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Cap.</th>
                    <th>Model</th>
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
                        <td>${o.capability ?? '—'}</td>
                        <td>${o.model ?? '—'}</td>
                        <td>${o.signatureStatus ?? '—'}</td>
                        <td>${o.freshnessStatus ?? '—'}</td>
                        <td>${o.detailsJson ? html`<code>${o.detailsJson}</code>` : '—'}</td>
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

if (!customElements.get('admin-routing'))
  customElements.define('admin-routing', AdminRouting);
