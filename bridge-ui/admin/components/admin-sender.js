import { LitElement, html } from "lit";
import { getSenderEscrow, getSenderWallet } from "../lib/api.js";
import { formatTimestamp, formatWei } from "../lib/format.js";

/**
 * Sender wallet + escrow view. Loads the two endpoints in parallel.
 * Wallet handles the 503 wallet_not_configured response gracefully —
 * shows a hint to set SENDER_ADDRESS rather than rendering an error.
 */
export class AdminSender extends LitElement {
  static properties = {
    _wallet: { state: true },
    _escrow: { state: true },
    _walletNotConfigured: { state: true },
    _walletError: { state: true },
    _escrowError: { state: true },
    _loading: { state: true },
  };

  constructor() {
    super();
    this._wallet = null;
    this._escrow = null;
    this._walletNotConfigured = false;
    this._walletError = "";
    this._escrowError = "";
    this._loading = false;
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
    this._wallet = null;
    this._escrow = null;
    this._walletNotConfigured = false;
    this._walletError = "";
    this._escrowError = "";
    const [walletR, escrowR] = await Promise.allSettled([
      getSenderWallet(),
      getSenderEscrow(),
    ]);
    if (walletR.status === "fulfilled") {
      this._wallet = walletR.value;
    } else {
      const err = walletR.reason;
      const status =
        err && typeof err === "object" && "status" in err ? err.status : 0;
      const code =
        err &&
        typeof err === "object" &&
        "body" in err &&
        err.body &&
        typeof err.body === "object" &&
        "error" in err.body
          ? err.body.error?.code
          : null;
      if (status === 503 && code === "wallet_not_configured") {
        this._walletNotConfigured = true;
      } else {
        this._walletError = err instanceof Error ? err.message : String(err);
      }
    }
    if (escrowR.status === "fulfilled") {
      this._escrow = escrowR.value;
    } else {
      this._escrowError =
        escrowR.reason instanceof Error
          ? escrowR.reason.message
          : String(escrowR.reason);
    }
    this._loading = false;
  }

  render() {
    return html`
      <header class="card-header">
        <h1>Sender</h1>
        <button
          type="button"
          @click=${() => void this._reload()}
          ?disabled=${this._loading}
        >
          ${this._loading ? "Reloading…" : "Reload"}
        </button>
      </header>

      <section class="card">
        <h2>Hot wallet</h2>
        ${this._walletNotConfigured
          ? html`
              <p class="muted">
                <strong>SENDER_ADDRESS not configured.</strong>
                Set the env var on this gateway-console deployment to enable the
                wallet view. Escrow still works — the daemon already knows whose
                escrow to look up.
              </p>
            `
          : this._walletError
            ? html`<div class="error" role="alert">${this._walletError}</div>`
            : this._wallet
              ? html`
                  <dl class="kv">
                    <dt>Address</dt>
                    <dd><code>${this._wallet.address}</code></dd>
                    <dt>Balance</dt>
                    <dd>
                      ${formatWei(this._wallet.balanceWei)}
                      ${this._belowFloor()
                        ? html`<span class="pill pill-stale-failing"
                            >below floor</span
                          >`
                        : ""}
                    </dd>
                    <dt>Min balance</dt>
                    <dd>${formatWei(this._wallet.minBalanceWei)}</dd>
                  </dl>
                `
              : html`<p class="muted">Loading wallet…</p>`}
      </section>

      <section class="card">
        <h2>TicketBroker escrow</h2>
        ${this._escrowError
          ? html`<div class="error" role="alert">${this._escrowError}</div>`
          : this._escrow
            ? html`
                <dl class="kv">
                  <dt>Deposit</dt>
                  <dd>${formatWei(this._escrow.depositWei)}</dd>
                  <dt>Reserve</dt>
                  <dd>${formatWei(this._escrow.reserveWei)}</dd>
                  <dt>Observed</dt>
                  <dd>${formatTimestamp(this._escrow.observedAt)}</dd>
                </dl>
              `
            : html`<p class="muted">Loading escrow…</p>`}
      </section>
    `;
  }

  _belowFloor() {
    if (!this._wallet?.balanceWei || !this._wallet?.minBalanceWei) return false;
    try {
      return (
        BigInt(this._wallet.balanceWei) < BigInt(this._wallet.minBalanceWei)
      );
    } catch {
      return false;
    }
  }
}

if (!customElements.get("admin-sender"))
  customElements.define("admin-sender", AdminSender);
