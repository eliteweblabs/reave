/**
 * Shared utilities for demo-loader.js and deploy-wizard.js.
 */
(function (global) {
  const MODULE_STATUS = {
    deployed: { label: 'Deployed', tone: 'live' },
    development: { label: 'Development', tone: 'deploying' },
    request: { label: 'Requested', tone: 'alert' },
    rejected: { label: 'Rejected', tone: 'alert' },
  };

  // Keep in sync with public/shared/htmlEscape.js / src/lib/htmlEscape.ts
  function escHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderCallout(innerHtml, extras = {}) {
    const tag = extras.tag === 'p' ? 'p' : 'div';
    return `<${tag} class="dl-callout">${innerHtml}</${tag}>`;
  }

  function renderStatusLegend(options = {}) {
    const deployed = options.deployedLabel || 'Deployed — include in demo';
    return renderCallout(
      `<div class="dl-legend">` +
      `<span class="dl-legend-item"><span class="dl-badge dl-badge--included">Included</span> always on</span>` +
      `<span class="dl-legend-item"><span class="dl-status-dot dl-status-dot--live" aria-hidden="true"></span> ${escHtml(deployed)}</span>` +
      `<span class="dl-legend-item"><span class="dl-status-dot dl-status-dot--deploying" aria-hidden="true"></span> Development</span>` +
      `<span class="dl-legend-item"><span class="dl-status-dot dl-status-dot--alert" aria-hidden="true"></span> Requested / rejected</span>` +
      `</div>`,
    );
  }

  global.ModuleLoaderShared = {
    MODULE_STATUS,
    escHtml,
    renderCallout,
    renderStatusLegend,
  };
})(typeof window !== 'undefined' ? window : globalThis);
