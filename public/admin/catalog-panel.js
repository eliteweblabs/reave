/**
 * Super-admin Catalog — sale-sheet flags, labels, prices, and groups.
 * Official REΛVE host only (`window.__installConfig.showModuleCatalog`).
 */
import { escHtml, mountPanelSkeleton } from './shared.js?v=20260810a';
import { iosIcon } from './admin-ui.js?v=20260822a';

const API = '/api/admin/module-catalog';

let shell = {};
let saveTimer = 0;
let saving = false;
let rows = [];
let groups = [];

export function initCatalogPanel(deps = {}) {
  shell = deps;
}

function rootEl() {
  return document.getElementById('settings-panel');
}

function showCatalog() {
  return window.__installConfig?.showModuleCatalog === true;
}

function setAlert(root, message, kind = 'error') {
  const el = root.querySelector('#catalog-alert');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('is-error', 'is-ok');
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('is-error', kind === 'error');
  el.classList.toggle('is-ok', kind === 'ok');
}

function collectRows(root) {
  return [...root.querySelectorAll('[data-catalog-row]')].map((el) => ({
    key: el.dataset.key || '',
    kind: el.dataset.kind || 'custom',
    group: el.dataset.group || 'other',
    id: el.querySelector('[data-field="id"]')?.value?.trim() || '—',
    feature: el.querySelector('[data-field="feature"]')?.value?.trim() || '',
    label: el.querySelector('[data-field="label"]')?.value?.trim() || '',
    blurb: el.querySelector('[data-field="blurb"]')?.value?.trim() || '',
    priceLabel: el.querySelector('[data-field="price"]')?.value?.trim() || '',
    saleSheet: el.querySelector('[data-field="sheet"]')?.checked === true,
    visibility: el.dataset.visibility || 'public',
  }));
}

function renderRow(row) {
  const locked = row.kind === 'core' || row.kind === 'module';
  return (
    `<tr class="cat-row" data-catalog-row data-key="${escHtml(row.key)}" data-kind="${escHtml(row.kind)}" data-group="${escHtml(row.group)}" data-visibility="${escHtml(row.visibility || 'public')}">` +
    `<td class="cat-cell cat-cell--sheet">` +
      `<label class="cat-sheet">` +
        `<input type="checkbox" data-field="sheet"${row.saleSheet ? ' checked' : ''} aria-label="On sale sheet">` +
        `<span>Sheet</span>` +
      `</label>` +
    `</td>` +
    `<td class="cat-cell cat-cell--id"><input type="text" data-field="id" class="cat-input" value="${escHtml(row.id || '—')}" spellcheck="false"></td>` +
    `<td class="cat-cell"><input type="text" data-field="label" class="cat-input" value="${escHtml(row.label || '')}"></td>` +
    `<td class="cat-cell"><input type="text" data-field="feature" class="cat-input" value="${escHtml(row.feature || '')}" ${locked ? 'readonly' : ''} spellcheck="false"></td>` +
    `<td class="cat-cell cat-cell--price"><input type="text" data-field="price" class="cat-input" value="${escHtml(row.priceLabel || '')}" spellcheck="false"></td>` +
    `<td class="cat-cell cat-cell--blurb"><input type="text" data-field="blurb" class="cat-input" value="${escHtml(row.blurb || '')}"></td>` +
    `<td class="cat-cell cat-cell--act">` +
      `<button type="button" class="cat-icon-btn" data-catalog-delete aria-label="Remove row">${iosIcon('trash', 16)}</button>` +
    `</td>` +
    `</tr>`
  );
}

function renderGroup(group, groupRows) {
  return (
    `<section class="cat-group" data-catalog-group="${escHtml(group.id)}">` +
      `<div class="cat-group-head">` +
        `<h2 class="cat-group-title">${escHtml(group.title)}</h2>` +
        `<button type="button" class="prof-btn-secondary cat-add-btn" data-catalog-add="${escHtml(group.id)}">` +
          `${iosIcon('plus', 14)} Add row` +
        `</button>` +
      `</div>` +
      `<div class="cat-table-wrap">` +
        `<table class="cat-table">` +
          `<thead><tr>` +
            `<th>Sheet</th><th>ID</th><th>Module</th><th>Feature</th><th>Price</th><th>Description</th><th></th>` +
          `</tr></thead>` +
          `<tbody>${groupRows.map(renderRow).join('') || ''}</tbody>` +
        `</table>` +
      `</div>` +
    `</section>`
  );
}

function renderPanel() {
  return (
    `<div class="profile-panel-scroll catalog-panel-scroll">` +
      `<div class="prof-card cat-card">` +
        `<div class="cat-hero">` +
          `<div>` +
            `<h1 class="prof-title">Catalog</h1>` +
            `<p class="prof-subtitle">Sale sheet, labels, prices, and groups for every module. Saves to this install — TypeScript defaults stay the fallback.</p>` +
          `</div>` +
          `<div class="cat-hero-actions">` +
            `<button type="button" id="catalog-reset-btn" class="prof-btn-secondary">Reset</button>` +
            `<button type="button" id="catalog-save-btn" class="prof-btn-primary">Save</button>` +
          `</div>` +
        `</div>` +
        `<div id="catalog-alert" class="prof-alert" hidden></div>` +
        `<div id="catalog-groups">${groups.map((g) => renderGroup(g, rows.filter((r) => r.group === g.id))).join('')}</div>` +
      `</div>` +
    `</div>`
  );
}

function newCustomRow(group) {
  const n = Date.now().toString(36);
  return {
    key: `custom:${group}:${n}`,
    kind: 'custom',
    group,
    id: '—',
    feature: `custom_${n}`,
    label: 'New module',
    blurb: '',
    priceAmount: null,
    priceLabel: group === 'core' ? 'Included' : group === 'internal' ? 'Internal' : '$200',
    saleSheet: group !== 'internal',
    visibility: group === 'internal' ? 'private' : 'public',
  };
}

async function persist(root, { reset = false } = {}) {
  if (saving) return;
  saving = true;
  const saveBtn = root.querySelector('#catalog-save-btn');
  if (saveBtn) saveBtn.disabled = true;
  try {
    const body = reset ? { reset: true } : { rows: collectRows(root) };
    const res = await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    rows = json.rows || [];
    if (Array.isArray(json.groups) && json.groups.length) groups = json.groups;
    setAlert(root, reset ? 'Restored TypeScript defaults.' : 'Catalog saved.', 'ok');
    if (reset) {
      const groupsEl = root.querySelector('#catalog-groups');
      if (groupsEl) {
        groupsEl.innerHTML = groups.map((g) => renderGroup(g, rows.filter((r) => r.group === g.id))).join('');
      }
    }
  } catch (e) {
    setAlert(root, e.message || 'Could not save catalog.', 'error');
  } finally {
    saving = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

function scheduleSave(root) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void persist(root);
  }, 700);
}

function bindEditor(root) {
  root.addEventListener('input', (e) => {
    if (e.target?.closest?.('[data-catalog-row]')) scheduleSave(root);
  });
  root.addEventListener('change', (e) => {
    if (e.target?.closest?.('[data-catalog-row]')) scheduleSave(root);
  });
  root.addEventListener('click', (e) => {
    const addBtn = e.target.closest?.('[data-catalog-add]');
    if (addBtn) {
      const group = addBtn.getAttribute('data-catalog-add');
      const section = root.querySelector(`[data-catalog-group="${group}"] tbody`);
      if (!section || !group) return;
      section.insertAdjacentHTML('beforeend', renderRow(newCustomRow(group)));
      scheduleSave(root);
      return;
    }
    const delBtn = e.target.closest?.('[data-catalog-delete]');
    if (delBtn) {
      delBtn.closest('[data-catalog-row]')?.remove();
      scheduleSave(root);
    }
  });
  root.querySelector('#catalog-save-btn')?.addEventListener('click', () => {
    window.clearTimeout(saveTimer);
    void persist(root);
  });
  root.querySelector('#catalog-reset-btn')?.addEventListener('click', () => {
    if (!window.confirm('Reset the catalog to the shipped defaults? Your saved edits will be replaced.')) return;
    window.clearTimeout(saveTimer);
    void persist(root, { reset: true });
  });
}

export async function loadCatalogTab() {
  if (!showCatalog()) {
    if (typeof shell.setActiveMap === 'function') shell.setActiveMap('dashboard', { force: true });
    return;
  }
  const root = rootEl();
  if (!root) return;
  if (typeof shell.flushSettingsAutosave === 'function') await shell.flushSettingsAutosave();
  mountPanelSkeleton(root, 'dashboard', 'Loading catalog…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
  });
  if (typeof shell.prependSettingsBackHeader === 'function') shell.prependSettingsBackHeader(root);

  try {
    const res = await fetch(API, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    rows = Array.isArray(data.rows) ? data.rows : [];
    groups = Array.isArray(data.groups) ? data.groups : [];
    root.innerHTML = renderPanel();
    if (typeof shell.prependSettingsBackHeader === 'function') shell.prependSettingsBackHeader(root);
    bindEditor(root);
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
        `<div class="prof-card"><h1 class="prof-title">Catalog</h1>` +
        `<p class="dash-empty">Could not load catalog: ${escHtml(e.message)}</p></div>` +
      `</div>`;
    if (typeof shell.prependSettingsBackHeader === 'function') shell.prependSettingsBackHeader(root);
  }
}
