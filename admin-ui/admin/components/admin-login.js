import { LitElement, html } from "lit";
import { GATEWAY_EVENTS, emit } from "../../shared/lib/events.js";
import { setSession } from "../lib/session.js";
import { getHealth } from "../lib/api.js";

export class AdminLogin extends LitElement {
  static properties = {
    _token: { state: true },
    _actor: { state: true },
    _loading: { state: true },
    _error: { state: true },
  };

  constructor() {
    super();
    this._token = "";
    this._actor = "";
    this._loading = false;
    this._error = "";
  }

  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <form class="card" @submit=${this._submit} novalidate>
        <h1>Gateway operator sign-in</h1>
        <p>
          Paste the admin bearer token. The handle attributes audit-log entries.
        </p>
        ${this._error
          ? html`<div class="error" role="alert">${this._error}</div>`
          : ""}

        <div class="field">
          <label for="token">Admin token</label>
          <input
            id="token"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="ADMIN_TOKEN"
            required
            ?disabled=${this._loading}
            .value=${this._token}
            @input=${(e) => {
              this._token = e.target.value;
            }}
          />
        </div>

        <div class="field">
          <label for="actor">Operator handle</label>
          <input
            id="actor"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="alice"
            pattern="^[a-z0-9._-]{1,64}$"
            required
            ?disabled=${this._loading}
            .value=${this._actor}
            @input=${(e) => {
              this._actor = e.target.value;
            }}
          />
        </div>

        <button type="submit" ?disabled=${this._loading}>
          ${this._loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    `;
  }

  async _submit(e) {
    e.preventDefault();
    if (this._loading) return;
    const token = this._token.trim();
    const actor = this._actor.trim();
    if (!token || !actor) {
      this._error = "Both fields are required.";
      return;
    }
    this._loading = true;
    this._error = "";
    try {
      // Optimistically store, then try /api/health to confirm token is valid.
      setSession(token, actor);
      await getHealth();
      emit(GATEWAY_EVENTS.AUTHENTICATED);
    } catch (err) {
      // /api/health may legitimately return 503 on bootstrap (daemon
      // sockets not mounted yet); the api-base only fires UNAUTHORIZED on
      // 401. Treat any non-401 error as "logged in but daemon unhealthy".
      if (err && err.code === "unauthorized") {
        this._error = "Invalid token.";
      } else {
        // Successfully authed; daemons just aren't responding. Carry on.
        emit(GATEWAY_EVENTS.AUTHENTICATED);
      }
    } finally {
      this._loading = false;
    }
  }
}

if (!customElements.get("admin-login"))
  customElements.define("admin-login", AdminLogin);
