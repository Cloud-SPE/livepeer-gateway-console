import { LitElement, html } from 'lit';

/**
 * Routing dashboard placeholder. The central screen of the gateway
 * console; the real implementation lands in per-repo Plan 0001 and is a
 * multi-pane dashboard (orch roster + capability filters + per-orch
 * drilldown panels with routing-history charts).
 */
export class AdminRouting extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <h1>Routing dashboard</h1>
      <div class="placeholder">
        <p><strong>Routing dashboard — see per-repo Plan 0001 for real content.</strong></p>
        <p>
          The real screen will be a multi-pane dashboard: orch roster (resolver
          <code>ListKnown</code> + chain-enriched), capability/model filters, and a
          per-orch drilldown with routing-history charts pulled from
          <code>routing_observations</code>.
        </p>
      </div>
    `;
  }
}

if (!customElements.get('admin-routing'))
  customElements.define('admin-routing', AdminRouting);
