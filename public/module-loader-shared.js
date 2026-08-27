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

  function escHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  global.ModuleLoaderShared = { MODULE_STATUS, escHtml };
})(typeof window !== 'undefined' ? window : globalThis);
