/**
 * Demo loader — pick production modules + industry, apply demo suite, run seed.
 */
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton } from './shared.js?v=20260806a';
import { osAlert } from './os-dialog.js?v=20260728q';

const DEPLOY_API = '/api/admin/deploy-status';
const INDUSTRIES_API = '/api/admin/deck-industries';
const SUITE_API = '/api/demo/suite';
const SEED_API = '/api/admin/demo';

const STATUS_LABELS = {
  deployed: 'Deployed',
  pending: 'Pending',
  development: 'Development',
  request: 'Requested',
  rejected: 'Off',
};

const STATUS_CLASS = {
  deployed: 'mod-status--deployed',
  pending: 'mod-status--pending',
  development: 'mod-status--development',
  request: 'mod-status--request',
  rejected: 'mod-status--rejected',
};

let selectedIds = new Set();
let industry = 'general';
let modules = [];
let industries = [];
let demoSuite = null;
let applying = false;
let seeding = false;

function rootEl() {
  return document.getElementById('demo-loader-panel');
}

function isOwner() {
  return document.body?.dataset?.isOwner === '1';
}

function productionModules() {
  return modules.filter((m) => m.inProduction && m.moduleId);
}

function syncSelectionFromSuite() {
  if (demoSuite?.moduleIds?.length) {
    selectedIds = new Set(demoSuite.moduleIds.map((id) => String(id).padStart(3, '0')));
    industry = demoSuite.industry || industry;
    return;
  }
  selectedIds = new Set(productionModules().map((m) => m.moduleId));
}

function renderToggle(checked, moduleId) {
  return (
    `<button type="button" class="prof-plugin-toggle dl-toggle" role="switch" ` +
    `aria-checked="${checked ? 'true' : 'false'}" data-module-id="${escHtml(moduleId)}"></button>`
  );
}

function renderModuleRow(m) {
  const statusCls = STATUS_CLASS[m.status] || 'mod-status--pending';
  const checked = selectedIds.has(m.moduleId);

  return (
    `<div class="dl-module-row${m.inProduction ? '' : ' dl-module-row--readonly'}" data-feature="${escHtml(m.feature)}">` +
    `<div class="dl-module-info">` +
    `<code class="dl-module-id">${escHtml(m.moduleId || '—')}</code>` +
    `<div class="dl-module-text">` +
    `<span class="dl-module-label">${escHtml(m.label)}</span>` +
    `<span class="dl-module-feature">${escHtml(m.feature)}</span>` +
    `</div>` +
    `</div>` +
    `<div class="dl-module-meta">` +
    `<span class="mod-status ${statusCls}">${escHtml(STATUS_LABELS[m.status] || m.status)}</span>` +
    (m.inProduction ?
      renderToggle(checked, m.moduleId)
    : `<span class="dl-no-toggle" title="Not enabled on production Reave">—</span>`) +
    `</div>` +
    `</div>`
  );
}

function renderIndustryOptions() {
  const enabled = industries.filter((i) => i.enabled !== false);
  const list = enabled.length ? enabled : industries;
  if (!list.length) {
    return `<option value="general">General</option>`;
  }
  return list
    .map((item) => {
      const slug = item.slug || 'general';
      const selected = slug === industry ? ' selected' : '';
      return `<option value="${escHtml(slug)}"${selected}>${escHtml(item.label)}</option>`;
    })
    .join('');
}

function renderPanel() {
  const prodCount = productionModules().length;
  const selectedCount = [...selectedIds].filter((id) => productionModules().some((m) => m.moduleId === id)).length;
  const suiteSummary = demoSuite?.summary ? escHtml(demoSuite.summary) : '';

  return (
    `<div class="demo-loader-scroll">` +
    `<div class="dl-header prof-card">` +
    `<h1 class="prof-title">Demo loader</h1>` +
    `<p class="prof-subtitle">Choose production modules and an industry, then apply the demo suite. All modules are listed; toggles are only available for modules live on production Reave.</p>` +
    (suiteSummary ?
      `<div class="mod-suite-banner"><strong>Active suite</strong> — ${suiteSummary}</div>`
    : '') +
    `</div>` +
    `<div class="dl-controls prof-card">` +
    `<label class="dl-field">` +
    `<span class="dl-field-label">Industry</span>` +
    `<select id="dl-industry" class="dl-select">${renderIndustryOptions()}</select>` +
    `</label>` +
    `<div class="dl-actions">` +
    `<button type="button" class="de-btn de-btn-secondary" id="dl-select-all"${prodCount && selectedCount === prodCount ? ' disabled' : ''}>Select all production</button>` +
    `<button type="button" class="de-btn de-btn-secondary" id="dl-clear-all"${selectedCount ? '' : ' disabled'}>Clear</button>` +
    `<button type="button" class="de-btn de-btn-primary" id="dl-apply-btn"${selectedCount ? '' : ' disabled'}>${applying ? 'Applying…' : 'Apply demo suite'}</button>` +
    (isOwner() ?
      `<button type="button" class="de-btn de-btn-secondary" id="dl-seed-btn"${selectedCount ? '' : ' disabled'}>${seeding ? 'Seeding…' : 'Run demo seed'}</button>`
    : '') +
    `</div>` +
    `<p class="prof-hint dl-hint">${selectedCount} of ${prodCount} production modules selected · ${modules.length} total modules</p>` +
    `</div>` +
    `<div class="dl-modules prof-card">` +
    `<div class="dl-modules-head">` +
    `<span>Module</span><span>Status</span><span>Include</span>` +
    `</div>` +
    `<div class="dl-module-list">${modules.map(renderModuleRow).join('')}</div>` +
    `</div>` +
    `</div>`
  );
}

function bindPanelEvents(root) {
  root.querySelector('#dl-industry')?.addEventListener('change', (e) => {
    industry = e.target.value || 'general';
  });

  root.querySelector('#dl-select-all')?.addEventListener('click', () => {
    selectedIds = new Set(productionModules().map((m) => m.moduleId));
    root.innerHTML = renderPanel();
    bindPanelEvents(root);
  });

  root.querySelector('#dl-clear-all')?.addEventListener('click', () => {
    selectedIds = new Set();
    root.innerHTML = renderPanel();
    bindPanelEvents(root);
  });

  root.querySelectorAll('.dl-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-module-id');
      if (!id) return;
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
      btn.setAttribute('aria-checked', selectedIds.has(id) ? 'true' : 'false');
      root.innerHTML = renderPanel();
      bindPanelEvents(root);
    });
  });

  root.querySelector('#dl-apply-btn')?.addEventListener('click', () => {
    void applySuite(root);
  });

  root.querySelector('#dl-seed-btn')?.addEventListener('click', () => {
    void runSeed(root);
  });
}

async function applySuite(root) {
  const moduleIds = [...selectedIds].sort();
  if (!moduleIds.length) {
    void osAlert({ title: 'Demo loader', bodyHtml: 'Select at least one production module.' });
    return;
  }

  applying = true;
  root.innerHTML = renderPanel();
  bindPanelEvents(root);

  try {
    const res = await fetch(SUITE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        suite: {
          tier: demoSuite?.tier ?? 1,
          moduleIds,
          industry,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    if (data.redirect) {
      window.location.assign(data.redirect);
      return;
    }
    demoSuite = data.suite ? { ...data.suite, summary: null } : demoSuite;
    void osAlert({ title: 'Demo loader', bodyHtml: 'Demo suite applied.' });
  } catch (e) {
    void osAlert({ title: 'Demo loader', bodyHtml: escHtml(e.message) });
  } finally {
    applying = false;
    root.innerHTML = renderPanel();
    bindPanelEvents(root);
  }
}

async function runSeed(root) {
  const moduleIds = [...selectedIds].sort();
  if (!moduleIds.length) {
    void osAlert({ title: 'Demo loader', bodyHtml: 'Select at least one production module.' });
    return;
  }

  seeding = true;
  root.innerHTML = renderPanel();
  bindPanelEvents(root);

  try {
    const res = await adminFetch(SEED_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        industry,
        moduleIds,
        tier: demoSuite?.tier ?? 1,
        suite: { tier: demoSuite?.tier ?? 1, moduleIds, industry },
      }),
    });
    const data = await readAdminJson(res, 'demo-seed');
    if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    void osAlert({
      title: 'Demo seed',
      bodyHtml: data.dryRun ? 'Dry run completed.' : 'Demo seed finished. Refresh to see seeded data.',
    });
  } catch (e) {
    if (e.message === 'Session expired') return;
    void osAlert({ title: 'Demo seed', bodyHtml: escHtml(e.message) });
  } finally {
    seeding = false;
    root.innerHTML = renderPanel();
    bindPanelEvents(root);
  }
}

function renderSignedOutGate() {
  return (
    `<div class="demo-loader-scroll">` +
    `<div class="mod-auth-gate prof-card">` +
    `<h1 class="prof-title">Demo loader</h1>` +
    `<p class="prof-subtitle">Sign in to configure demo modules and industry presets.</p>` +
    `<button type="button" class="de-btn de-btn-primary mod-auth-sign-in">Sign in</button>` +
    `</div>` +
    `</div>`
  );
}

function bindSignedOutGate(root) {
  root.querySelector('.mod-auth-sign-in')?.addEventListener('click', () => {
    if (window.IosSheet?.open) window.IosSheet.open('sign-in-sheet');
    else window.location.assign('/admin/?auth=sign-in');
  });
}

async function fetchDeployStatus() {
  const res = await adminFetch(DEPLOY_API, { cache: 'no-store' });
  const data = await readAdminJson(res, 'deploy-status');
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function fetchIndustries() {
  const res = await adminFetch(INDUSTRIES_API, { cache: 'no-store' });
  const data = await readAdminJson(res, 'deck-industries');
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.industries || [];
}

async function fetchCurrentSuite() {
  const res = await fetch(SUITE_API, { cache: 'no-store', credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) return null;
  return data.suite || null;
}

export async function loadDemoLoaderTab() {
  const root = rootEl();
  if (!root) return;

  if (!document.body?.dataset?.userId?.trim()) {
    root.innerHTML = renderSignedOutGate();
    bindSignedOutGate(root);
    return;
  }

  if (!root.querySelector('.dl-module-list')) {
    mountPanelSkeleton(root, 'dashboard', 'Loading demo loader…', {
      contentSelector: '.demo-loader-scroll',
    });
  }

  try {
    const [deployData, industryList, suite] = await Promise.all([
      fetchDeployStatus(),
      fetchIndustries(),
      fetchCurrentSuite(),
    ]);

    modules = deployData.modules || [];
    industries = industryList;
    demoSuite = deployData.demoSuite || suite;
    if (demoSuite && deployData.demoSuite?.summary) {
      demoSuite = { ...demoSuite, summary: deployData.demoSuite.summary };
    }
    syncSelectionFromSuite();

    root.innerHTML = renderPanel();
    bindPanelEvents(root);
  } catch (e) {
    if (e.message === 'Session expired') return;
    root.innerHTML =
      `<div class="demo-loader-scroll"><p class="mod-empty mod-empty--error">Could not load demo loader: ${escHtml(e.message)}</p></div>`;
    void osAlert({ title: 'Demo loader', bodyHtml: escHtml(e.message) });
  }
}
