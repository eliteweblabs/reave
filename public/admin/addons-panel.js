/**
 * Account → Add-ons — demo-loader tile grid with owner toggles or client requests.
 */
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton, showModuleCatalog } from './shared.js?v=20260810a';
import { osAlert } from './os-dialog.js?v=20260825a';

const API = '/api/admin/addons';

let pending = new Set();
let shell = {};

export function initAddonsPanel(deps = {}) {
  shell = deps;
}

function canEditCatalog() {
  return showModuleCatalog();
}

function moduleEditHref(feature) {
  return `/admin/?tab=modules&module=${encodeURIComponent(feature)}`;
}

function renderEditLink(feature) {
  if (!canEditCatalog() || !feature) return '';
  return (
    `<a class="dl-tile-edit" href="${escHtml(moduleEditHref(feature))}" data-module="${escHtml(feature)}">Edit</a>`
  );
}

function rootEl() {
  return document.getElementById('settings-panel');
}

function capturePanelScroll(root) {
  return root?.querySelector('.profile-panel-scroll')?.scrollTop ?? 0;
}

function restorePanelScroll(root, top = 0) {
  const el = root?.querySelector('.profile-panel-scroll');
  if (!el || top <= 0) return;
  el.scrollTop = top;
  requestAnimationFrame(() => {
    if (el.isConnected) el.scrollTop = top;
  });
}

function isActiveTab() {
  const map = typeof shell.getMap === 'function' ? shell.getMap() : shell.MAP;
  return map?.type === 'addons';
}

function renderSwitch(checked, feature, busy) {
  return (
    `<button type="button" class="prof-plugin-toggle${busy ? ' is-busy' : ''}" role="switch" ` +
    `aria-checked="${checked ? 'true' : 'false'}" data-feature="${escHtml(feature)}" ` +
    `${busy ? ' disabled aria-busy="true"' : ''} ` +
    `aria-label="${busy ? 'Updating add-on' : checked ? 'Turn off add-on' : 'Turn on add-on'}"></button>`
  );
}

function setAddonToggleBusy(btn, busy) {
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.classList.toggle('is-busy', busy);
  btn.disabled = busy;
  if (busy) {
    btn.setAttribute('aria-busy', 'true');
    btn.setAttribute('aria-label', 'Updating add-on');
  } else {
    btn.removeAttribute('aria-busy');
    const on = btn.getAttribute('aria-checked') === 'true';
    btn.setAttribute('aria-label', on ? 'Turn off add-on' : 'Turn on add-on');
  }
}

function setAddonToggleChecked(btn, checked) {
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.setAttribute('aria-checked', checked ? 'true' : 'false');
  btn.closest('.dl-tile')?.classList.toggle('dl-tile--selected', checked);
}

function renderIncludedTile(card) {
  const edit = renderEditLink(card.id);
  return (
    `<article class="dl-tile dl-tile--included"${edit ? '' : ' aria-disabled="true"'}>` +
    `<div class="dl-tile-body">` +
    `<span class="dl-badge dl-badge--included">Included</span>` +
    `<h3 class="dl-tile-label">${escHtml(card.label)}</h3>` +
    (card.blurb ? `<p class="dl-tile-blurb">${escHtml(card.blurb)}</p>` : '') +
    `</div>` +
    (edit ? `<div class="dl-tile-foot">${edit}</div>` : '') +
    `</article>`
  );
}

function renderTile(m, mode) {
  const checked = Boolean(m.enabled);
  const canToggle = mode === 'toggle' && m.toggleable;
  const canRequest = mode === 'request' && m.purchasable && !m.entitlement;
  const requested =
    m.entitlement?.status === 'requested' || m.entitlement?.status === 'invoiced';
  const busy = pending.has(m.feature);
  const priceLabel = m.price?.label ? `<span class="dl-price">${escHtml(m.price.label)}</span>` : '';

  const edit = renderEditLink(m.feature);
  let footInner = '';
  if (canToggle) {
    footInner = `${edit}${renderSwitch(checked, m.feature, busy)}`;
  } else if (canRequest && !requested) {
    footInner =
      `${edit}` +
      `<button type="button" class="dl-btn dl-btn--primary dl-btn--sm mod-addons-request" data-feature="${escHtml(m.feature)}"${busy ? ' disabled' : ''}>Request</button>`;
  } else if (requested) {
    footInner = `${edit}<span class="dl-badge dl-badge--included">Requested</span>`;
  } else if (checked) {
    footInner = `${edit}<span class="dl-badge dl-badge--included">Active</span>`;
  } else if (edit) {
    footInner = edit;
  }
  const foot = footInner ? `<div class="dl-tile-foot">${footInner}</div>` : '';

  const selectedClass = checked ? ' dl-tile--selected' : '';
  const readonlyClass = !canToggle && !canRequest && !checked ? ' dl-tile--readonly' : '';

  return (
    `<article class="dl-tile${selectedClass}${readonlyClass}" data-feature="${escHtml(m.feature)}">` +
    `<div class="dl-tile-body">` +
    `<div class="dl-tile-head">` +
    `<h3 class="dl-tile-label">${escHtml(m.label)}</h3>` +
    priceLabel +
    `</div>` +
    (m.blurb ? `<p class="dl-tile-blurb">${escHtml(m.blurb)}</p>` : '') +
    `</div>` +
    foot +
    `</article>`
  );
}

function renderSection(section, mode) {
  const title = section.title ? `<h2 class="dl-section-title">${escHtml(section.title)}</h2>` : '';
  const grid =
    section.modules?.length ?
      `<div class="dl-grid">${section.modules.map((m) => renderTile(m, mode)).join('')}</div>`
    : '';
  return `<section class="dl-section">${title}${grid}</section>`;
}

function renderPanel(data) {
  const mode = data.mode || (data.owner ? 'toggle' : 'request');
  const summary = data.summary || {};
  const lead =
    mode === 'toggle'
      ? 'Flip add-ons on or off to test combinations. Runtime only — config features[] updates on deploy.'
      : 'Add-ons you have are on. Request any missing module — we will follow up to enable it after payment.';

  return (
    `<div class="profile-panel-scroll addons-panel-scroll">` +
    `<div class="addons-dl-wrap">` +
    `<header class="dl-hero dl-hero--compact">` +
    `<p class="dl-kicker">Account</p>` +
    `<h1 class="dl-h1">Add-ons</h1>` +
    `<p class="dl-lead">${escHtml(lead)}</p>` +
    `<p class="dl-meta">${summary.enabled ?? 0} active · ${summary.available ?? 0} available · ${summary.total ?? 0} total</p>` +
    `</header>` +
    `<div class="dl-panel">` +
    `<div class="dl-sections">` +
    (data.included?.length
      ? `<section class="dl-section"><h2 class="dl-section-title">Core OS</h2><div class="dl-grid">${data.included.map(renderIncludedTile).join('')}</div></section>`
      : '') +
    (data.sections || []).map((s) => renderSection(s, mode)).join('') +
    `</div>` +
    `</div>` +
    `<p class="dl-footnote">Prices are one-time add-on fees for now. Stripe checkout coming soon — requests alert the team immediately.</p>` +
    `</div></div>`
  );
}

async function postAddons(body) {
  const res = await adminFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readAdminJson(res, 'addons');
}

function bindPanelEvents(root) {
  root.querySelectorAll('.prof-plugin-toggle').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const feature = btn.getAttribute('data-feature');
      if (!feature || pending.has(feature)) return;
      const enabled = btn.getAttribute('aria-checked') !== 'true';
      pending.add(feature);
      setAddonToggleChecked(btn, enabled);
      setAddonToggleBusy(btn, true);
      try {
        const data = await postAddons({ action: 'toggle', feature, enabled });
        if (!data.ok) throw new Error(data.error || 'Toggle failed');
        await loadAddonsTab({ quiet: true });
      } catch (err) {
        setAddonToggleChecked(btn, !enabled);
        setAddonToggleBusy(btn, false);
        void osAlert({ title: 'Could not update add-on', bodyHtml: escHtml(err.message) });
      } finally {
        pending.delete(feature);
        const next = rootEl()?.querySelector(`.prof-plugin-toggle[data-feature="${CSS.escape(feature)}"]`);
        if (next && next !== btn) setAddonToggleBusy(next, false);
      }
    });
  });

  root.querySelectorAll('.mod-addons-request').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const feature = btn.getAttribute('data-feature');
      if (!feature || pending.has(feature)) return;
      pending.add(feature);
      btn.disabled = true;
      try {
        const data = await postAddons({ action: 'request', feature });
        if (!data.ok) throw new Error(data.error || 'Request failed');
        void osAlert({
          title: 'Request sent',
          bodyHtml: 'We got your add-on request and will follow up shortly.',
        });
        await loadAddonsTab({ quiet: true });
      } catch (err) {
        btn.disabled = false;
        void osAlert({ title: 'Request failed', bodyHtml: escHtml(err.message) });
      } finally {
        pending.delete(feature);
      }
    });
  });

  root.querySelectorAll('.dl-tile-edit').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.stopPropagation();
      const feature = a.getAttribute('data-module');
      if (!feature || typeof shell.setActiveMap !== 'function') return;
      e.preventDefault();
      shell.setActiveMap('modules', { force: true, moduleFeature: feature });
    });
  });

  root.querySelectorAll('.dl-tile .prof-plugin-toggle').forEach((sw) => {
    const tile = sw.closest('.dl-tile');
    tile?.addEventListener('click', (e) => {
      if (e.target.closest('.dl-tile-edit')) return;
      if (!sw.disabled) sw.click();
    });
  });
}

export async function loadAddonsTab(opts = {}) {
  if (!isActiveTab() && !opts.force) return;
  const root = rootEl();
  if (!root) return;

  const savedScroll = opts.quiet ? capturePanelScroll(root) : 0;

  if (!opts.quiet) {
    mountPanelSkeleton(root, 'dashboard', 'Loading add-ons…', {
      contentSelector: '.dl-panel',
      wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
    });
    if (typeof shell.prependSettingsBackHeader === 'function') {
      shell.prependSettingsBackHeader(root);
    }
  }

  try {
    const res = await adminFetch(API, { cache: 'no-store' });
    const data = await readAdminJson(res, 'addons');
    if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    root.innerHTML = renderPanel(data);
    if (typeof shell.prependSettingsBackHeader === 'function') {
      shell.prependSettingsBackHeader(root);
    }
    bindPanelEvents(root);
    if (opts.quiet) restorePanelScroll(root, savedScroll);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
      `<div class="prof-card"><h1 class="prof-title">Add-ons</h1>` +
      `<p class="dash-empty">Could not load add-ons: ${escHtml(e.message)}</p></div></div>`;
    if (typeof shell.prependSettingsBackHeader === 'function') {
      shell.prependSettingsBackHeader(root);
    }
    if (opts.quiet) restorePanelScroll(root, savedScroll);
  }
}
