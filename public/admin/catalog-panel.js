/**
 * Catalog editor now lives in Modules (inbox list).
 * Official reave.app host only — client installs never open this tab.
 */
let shell = {};

export function initCatalogPanel(deps = {}) {
  shell = deps;
}

export async function loadCatalogTab() {
  if (typeof shell.setActiveMap === 'function') {
    shell.setActiveMap('modules', { force: true });
    return;
  }
  window.location.assign('/admin/?tab=modules');
}
