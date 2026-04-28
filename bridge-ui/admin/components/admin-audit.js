import { LitElement, html } from 'lit';
import { listAuditLog } from '../lib/api.js';
import { formatTimestamp } from '../lib/format.js';

const PAGE_SIZE = 50;

/**
 * Audit log — paginated read of the console's own bearer-action log.
 * Cursor: opaque autoincrement-id boundary (`before=N` returns rows
 * with id < N). "Older →" derives the next cursor from the last row.
 */
export class AdminAudit extends LitElement {
  static properties = {
    _events: { state: true },
    _cursor: { state: true },
    _loading: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();
    this._events = [];
    this._cursor = null; // id of the last-shown row; null = first page
    this._loading = false;
    this._error = '';
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this._loadFirstPage();
  }

  async _loadFirstPage() {
    this._loading = true;
    this._error = '';
    try {
      const res = await listAuditLog({ limit: PAGE_SIZE });
      this._events = Array.isArray(res?.events) ? res.events : [];
      this._cursor = this._events.at(-1)?.id ?? null;
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._loading = false;
    }
  }

  async _loadOlder() {
    if (this._cursor === null) return;
    this._loading = true;
    this._error = '';
    try {
      const res = await listAuditLog({ limit: PAGE_SIZE, before: this._cursor });
      const more = Array.isArray(res?.events) ? res.events : [];
      this._events = [...this._events, ...more];
      this._cursor = more.length > 0 ? more.at(-1)?.id ?? null : null;
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._loading = false;
    }
  }

  render() {
    return html`
      <header class="card-header">
        <h1>Audit log</h1>
        <button type="button" @click=${() => void this._loadFirstPage()} ?disabled=${this._loading}>
          Reload
        </button>
      </header>
      <p class="muted">Bearer-action log. Newest first; click "Older" to page back.</p>

      ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : ''}

      ${this._events.length === 0
        ? html`<p class="muted">${this._loading ? 'Loading…' : 'No events yet.'}</p>`
        : html`
            <table class="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>OK</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                ${this._events.map(
                  (e) => html`
                    <tr class=${e.ok ? '' : 'row-fail'}>
                      <td>${formatTimestamp(e.occurredAt)}</td>
                      <td>${e.actor}</td>
                      <td>${e.action}</td>
                      <td>${e.target ? html`<code>${e.target}</code>` : '—'}</td>
                      <td>${e.ok ? 'yes' : 'no'}</td>
                      <td>${e.message ?? '—'}</td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          `}

      ${this._cursor !== null && this._events.length >= PAGE_SIZE
        ? html`
            <button
              type="button"
              @click=${() => void this._loadOlder()}
              ?disabled=${this._loading}
            >
              ${this._loading ? 'Loading…' : 'Older →'}
            </button>
          `
        : ''}
    `;
  }
}

if (!customElements.get('admin-audit'))
  customElements.define('admin-audit', AdminAudit);
