import { LitElement, html } from 'lit';
import { GATEWAY_EVENTS, on } from '../../shared/lib/events.js';
import { current, navigate, onChange } from '../../shared/lib/route.js';
import { getActor, getToken, clearSession } from '../lib/session.js';

import './admin-login.js';
import './admin-routing.js';

export class AdminApp extends LitElement {
  static properties = {
    _authed: { state: true },
    _path: { state: true },
  };

  constructor() {
    super();
    this._authed = !!getToken();
    this._path = current();
    this._unsubs = [];
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this._unsubs.push(
      on(GATEWAY_EVENTS.AUTHENTICATED, () => {
        this._authed = true;
        if (this._path === '/' || !this._path) navigate('/routing');
      }),
    );
    this._unsubs.push(
      on(GATEWAY_EVENTS.UNAUTHORIZED, () => {
        this._authed = false;
      }),
    );
    this._unsubs.push(
      onChange((path) => {
        this._path = path;
      }),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const u of this._unsubs) u();
    this._unsubs = [];
  }

  render() {
    if (!this._authed) {
      return html`<admin-login></admin-login>`;
    }
    return html`
      <header class="app-bar">
        <div class="brand">
          Gateway Console<span class="scope">operator console</span>
        </div>
        <nav style="display:flex; gap:1rem; margin-left:2rem;">
          <a
            href="#/routing"
            class=${this._path === '/' || this._path.startsWith('/routing') || this._path.startsWith('/orchs')
              ? 'active'
              : ''}
            >Routing</a
          >
          <a
            href="#/capabilities"
            class=${this._path.startsWith('/capabilities') ? 'active' : ''}
            >Capabilities</a
          >
          <a
            href="#/sender"
            class=${this._path.startsWith('/sender') ? 'active' : ''}
            >Sender</a
          >
          <a
            href="#/audit"
            class=${this._path.startsWith('/audit') ? 'active' : ''}
            >Audit</a
          >
        </nav>
        <div style="margin-left:auto; display:flex; gap:1rem; align-items:center;">
          ${getActor() ? html`<span class="scope">actor: ${getActor()}</span>` : ''}
          <button type="button" @click=${this._signOut}>Sign out</button>
        </div>
      </header>
      <main>${this._renderRoute()}</main>
    `;
  }

  _renderRoute() {
    const path = this._path || '/';
    if (path === '/' || path === '/routing' || path.startsWith('/routing')) {
      return html`<admin-routing></admin-routing>`;
    }
    if (path.startsWith('/orchs/')) {
      return html`<div class="placeholder">
        Per-orch drilldown — see per-repo Plan 0001 for real content.
      </div>`;
    }
    if (path.startsWith('/capabilities')) {
      return html`<div class="placeholder">
        Capability search — see per-repo Plan 0001 for real content.
      </div>`;
    }
    if (path.startsWith('/sender')) {
      return html`<div class="placeholder">
        Sender wallet + escrow — see per-repo Plan 0001 for real content.
      </div>`;
    }
    if (path.startsWith('/audit')) {
      return html`<div class="placeholder">
        Audit log — see per-repo Plan 0001 for real content.
      </div>`;
    }
    return html`<p>Unknown route: ${path}</p>`;
  }

  _signOut() {
    clearSession();
    this._authed = false;
  }
}

if (!customElements.get('admin-app')) customElements.define('admin-app', AdminApp);
