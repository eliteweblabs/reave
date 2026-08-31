/**
 * Admin modules — inbox-style catalog + deploy status.
 * Official reave.app host can edit the sale-sheet catalog from this list.
 */
import {
  iosIcon,
  setToggleSwitch,
  createCenteredListEmpty,
  listSearchAddNew,
  createIosIconBtn,
  createSwipeRow,
  bindSwipeListScroll,
  swipeDeleteAction,
  attachIosPullToRefresh,
} from './admin-ui.js?v=20260825h';
import { mountListFilterTabs, captureFilterTabsScroll } from './filter-tabs.js?v=20260823a';
import { createPaneHeader } from './pane-header.js?v=20260821c';
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton, showModuleCatalog } from './shared.js?v=20260810a';
import { osAlert } from './os-dialog.js?v=20260826a';

const STATUS_API = '/api/admin/deploy-status';
const CATALOG_API = '/api/admin/module-catalog';
const INDUSTRIES_API = '/api/admin/deck-industries';
const DEFAULT_POLL_MS = 30_000;

const GROUP_META = {
  core: { title: 'Core OS', short: 'Core OS', icon: 'layers', tone: 'core' },
  work: { title: 'Work', short: 'Work', icon: 'briefcase', tone: 'work' },
  google_workspace: { title: 'Google™ Workspace', short: 'Workspace', icon: 'mail', tone: 'workspace' },
  hosting: { title: 'Hosting', short: 'Hosting', icon: 'server', tone: 'hosting' },
  social: { title: 'Social', short: 'Social', icon: 'share', tone: 'social' },
  e_commerce: { title: 'E-commerce', short: 'E-comm', icon: 'shopping-bag', tone: 'commerce' },
  web_development: { title: 'Web Development', short: 'Web', icon: 'globe', tone: 'web' },
  real_estate: { title: 'Real Estate', short: 'RE', icon: 'home', tone: 'estate' },
  other: { title: 'Other', short: 'Other', icon: 'puzzle', tone: 'other' },
  internal: { title: 'Internal', short: 'Internal', icon: 'key', tone: 'internal' },
};

const GROUP_ORDER = Object.keys(GROUP_META);

const STATUS_LABELS = {
  deployed: 'Deployed',
  development: 'Development',
  request: 'Requested',
  rejected: 'Rejected',
};

const STATUS_CLASS = {
  deployed: 'mod-status--deployed',
  development: 'mod-status--development',
  request: 'mod-status--request',
  rejected: 'mod-status--rejected',
};

let pollTimer = null;
let pollMs = DEFAULT_POLL_MS;
let filter = 'all';
let search = '';
let lastPayload = null;
let catalogRows = [];
let catalogGroups = [];
let industryOptions = [];
let items = [];
let activeKey = null;
let pendingFeature = null;
let saveTimer = 0;
let saving = false;
let dirty = false;
let shell = {};
let skipQuietUntil = 0;

export function initModulesPanel(deps = {}) {
  shell = deps;
}

function rootEl() {
  return document.getElementById('modules-panel');
}

function canEditCatalog() {
  return showModuleCatalog();
}

function isActiveTab() {
  const map = typeof shell.getMap === 'function' ? shell.getMap() : shell.MAP;
  return map?.type === 'modules';
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPoll() {
  stopPoll();
  if (!isActiveTab()) return;
  pollTimer = setInterval(() => {
    if (isActiveTab()) void loadModulesTab({ quiet: true });
    else stopPoll();
  }, pollMs);
}

function groupMeta(id) {
  return GROUP_META[id] || GROUP_META.other;
}

function itemKey(item) {
  return item?.key || '';
}

function findItem(key) {
  return items.find((item) => itemKey(item) === key) || null;
}

function captureSidebarScroll(root) {
  return root?.querySelector('.ch-sidebar .ch-list')?.scrollTop ?? 0;
}

function restoreSidebarScroll(root, top = 0) {
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (list && top > 0) list.scrollTop = top;
}

function newCustomRow(group) {
  const n = Date.now().toString(36);
  return {
    key: `custom:${group}:${n}`,
    kind: 'custom',
    group,
    id: '',
    feature: `custom_${n}`,
    label: 'New module',
    blurb: '',
    priceAmount: null,
    priceLabel: group === 'core' ? 'Included' : group === 'internal' ? 'Internal' : '$200',
    saleSheet: group !== 'internal',
    visibility:
      group === 'internal'
        ? 'private'
        : group === 'google_workspace' || group === 'hosting'
          ? 'service'
          : 'public',
    audience: group === 'internal' ? 'owner' : 'both',
    requires: [],
    industries: [],
  };
}

function mergeItems(catalog, deploy) {
  const deployByFeature = new Map((deploy?.modules || []).map((m) => [m.feature, m]));
  const out = [];
  const claimed = new Set();

  if (catalog?.length) {
    for (const row of catalog) {
      claimed.add(row.feature);
      out.push({
        key: row.key,
        catalogKey: row.key,
        kind: row.kind,
        group: row.group || 'other',
        id: row.id || '',
        feature: row.feature,
        label: row.label,
        blurb: row.blurb || '',
        priceLabel: row.priceLabel || '',
        saleSheet: row.saleSheet === true,
        visibility: row.visibility || 'public',
        audience: row.audience === 'owner' || row.audience === 'staff' ? row.audience : 'both',
        requires: Array.isArray(row.requires) ? row.requires : [],
        industries: Array.isArray(row.industries) ? row.industries : [],
        deploy: deployByFeature.get(row.feature) || null,
      });
    }
  }

  for (const m of deploy?.modules || []) {
    if (claimed.has(m.feature)) continue;
    out.push({
      key: `deploy:${m.feature}`,
      catalogKey: null,
      kind: 'module',
      group: m.group?.id || 'other',
      id: m.moduleId || '',
      feature: m.feature,
      label: m.label,
      blurb: '',
      priceLabel: m.price?.label || '',
      saleSheet: m.saleSheet === true,
      visibility: m.visibility || 'public',
      audience: m.audience === 'owner' || m.audience === 'staff' ? m.audience : 'both',
      requires: Array.isArray(m.requires) ? m.requires : [],
      industries: [],
      deploy: m,
    });
  }

  return out;
}

function matchesSearch(item, q) {
  if (!q) return true;
  const hay = [item.label, item.feature, item.id, item.blurb, item.priceLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function filteredItems() {
  const q = search.trim().toLowerCase();
  return items.filter((item) => {
    if (filter !== 'all' && item.group !== filter) return false;
    return matchesSearch(item, q);
  });
}

function groupCounts() {
  const q = search.trim().toLowerCase();
  const counts = { all: 0 };
  for (const id of GROUP_ORDER) counts[id] = 0;
  for (const item of items) {
    if (!matchesSearch(item, q)) continue;
    counts.all += 1;
    if (counts[item.group] != null) counts[item.group] += 1;
    else counts.other += 1;
  }
  return counts;
}

function groupsForChips() {
  const present = new Set(items.map((item) => item.group));
  const fromApi = catalogGroups.length
    ? catalogGroups
    : lastPayload?.groups?.map((g) => ({ id: g.id, title: g.title })) || [];
  const ordered = [];
  for (const id of GROUP_ORDER) {
    const api = fromApi.find((g) => g.id === id);
    if (api || present.has(id) || GROUP_META[id]) {
      ordered.push({ id, title: api?.title || GROUP_META[id].title });
    }
  }
  return ordered.filter((g) => present.has(g.id) || g.id === filter);
}

function renderFilterTabs(savedScrollLeft = 0) {
  const counts = groupCounts();
  const tabs = [{ id: 'all', label: 'All', count: counts.all }];
  for (const group of groupsForChips()) {
    const meta = groupMeta(group.id);
    tabs.push({
      id: group.id,
      label: meta.short,
      count: counts[group.id] || 0,
      tone: meta.tone,
    });
  }
  return mountListFilterTabs({
    tabs,
    activeId: filter,
    ariaLabel: 'Module groups',
    savedScrollLeft,
    onSelect(id) {
      filter = id;
      const visible = filteredItems();
      if (activeKey && !visible.some((item) => itemKey(item) === activeKey)) {
        activeKey = null;
        rootEl()?.classList.remove('de-pane-active');
      }
      refreshSidebarList();
      renderDetailPane();
    },
  });
}

function syncSaleSheetBadge(item) {
  const btn = rootEl()?.querySelector(`.mod-list-item[data-key="${CSS.escape(itemKey(item))}"]`);
  if (!btn) return;
  const existing = btn.querySelector('.mod-sheet-badge');
  if (item.saleSheet) {
    if (existing) return;
    const badge = document.createElement('span');
    badge.className = 'mod-sheet-badge';
    badge.title = 'On the sale sheet';
    badge.setAttribute('aria-label', 'On the sale sheet');
    badge.innerHTML = iosIcon('file-text', 14);
    btn.appendChild(badge);
    return;
  }
  existing?.remove();
}

function createListItem(item) {
  const meta = groupMeta(item.group);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'em-list-item mod-list-item' + (itemKey(item) === activeKey ? ' active' : '');
  btn.dataset.key = itemKey(item);
  btn.dataset.id = itemKey(item);
  btn.style.setProperty('--em-item-accent', `var(--mod-tone-${meta.tone})`);
  btn.innerHTML =
    `<span class="mod-list-icon mod-tone-${meta.tone}" aria-hidden="true">${iosIcon(meta.icon, 16)}</span>` +
    `<span class="ch-list-content">` +
    `<span class="ch-item-title">${escHtml(item.label || item.feature)}</span>` +
    `</span>` +
    (item.saleSheet
      ? `<span class="mod-sheet-badge" title="On the sale sheet" aria-label="On the sale sheet">${iosIcon('file-text', 14)}</span>`
      : '');
  btn.addEventListener('click', () => openItem(itemKey(item)));
  return btn;
}

function canDeleteItem(item) {
  return canEditCatalog() && !!item?.catalogKey;
}

function createItemRow(item) {
  const content = createListItem(item);
  if (!canDeleteItem(item)) return content;
  return createSwipeRow(content, [
    swipeDeleteAction({
      onClick: () => deleteItem(item),
    }),
  ]);
}

function fillSidebarList(list) {
  const visible = filteredItems();
  list.replaceChildren();
  for (const item of visible) list.appendChild(createItemRow(item));
  if (!visible.length) {
    list.appendChild(
      createCenteredListEmpty({
        innerHtml: search.trim()
          ? 'No matches.'
          : canEditCatalog()
            ? 'No modules in this group.<br><span class="em-hint">Tap + to add a catalog row.</span>'
            : 'No modules in this group.',
      }),
    );
  }
}

function refreshSidebarList() {
  const root = rootEl();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderShell();
    return;
  }
  const visible = filteredItems();
  const input = root.querySelector('.panel-list-search');
  if (input instanceof HTMLInputElement) {
    const n = visible.length;
    input.placeholder = `Search ${n} ${n === 1 ? 'Module' : 'Modules'}`;
  }
  fillSidebarList(list);
}

export function parseModuleDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('module')?.trim() || null;
  } catch {
    return null;
  }
}

export function queueModuleDeepLink(feature) {
  pendingFeature = String(feature || '').trim() || null;
}

function selectFeature(feature) {
  const wanted = String(feature || '').trim();
  if (!wanted) return false;
  const item = items.find((it) => it.feature === wanted);
  if (!item) return false;
  if (filter !== 'all' && item.group !== filter) filter = 'all';
  activeKey = itemKey(item);
  return true;
}

function consumePendingFeature({ allowUrl = false } = {}) {
  if (!pendingFeature && allowUrl) pendingFeature = parseModuleDeepLinkFromUrl();
  if (!pendingFeature) return;
  if (selectFeature(pendingFeature)) pendingFeature = null;
  else if (items.length) pendingFeature = null;
}

function openItem(key) {
  activeKey = key;
  syncSidebarActive();
  renderDetailPane();
  rootEl()?.classList.add('de-pane-active');
}

function closeDetail() {
  activeKey = null;
  rootEl()?.classList.remove('de-pane-active');
  syncSidebarActive();
  renderDetailPane();
}

function syncSidebarActive() {
  const root = rootEl();
  root?.querySelectorAll('.em-list-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.key === activeKey);
  });
}

function renderFlag(on, label, extra = '') {
  const cls = on ? 'mod-flag mod-flag--yes' : 'mod-flag mod-flag--no';
  const mark = on ? iosIcon('check', 12) : iosIcon('minus', 12);
  return (
    `<li class="mod-flag-row">` +
    `<span class="${cls}" aria-hidden="true">${mark}</span>` +
    `<span class="mod-flag-label">${escHtml(label)}</span>` +
    extra +
    `</li>`
  );
}

function renderPurchaseHtml(m) {
  if (!m) return '';
  if (m.enabled) {
    return m.price
      ? `<span class="mod-muted">Included</span>`
      : '<span class="mod-muted">—</span>';
  }
  const price = m.price?.label ? `<span class="mod-price">${escHtml(m.price.label)}</span>` : '';
  const ent = m.entitlement;
  if (ent?.status === 'paid') {
    return `${price}<span class="mod-buy-note">Paid — we turn it on</span>`;
  }
  if (ent?.status === 'invoiced' && ent.invoiceUrl) {
    return (
      `${price}` +
      `<a class="de-btn de-btn-primary mod-buy-link" href="${escHtml(ent.invoiceUrl)}" target="_blank" rel="noopener">Pay invoice</a>` +
      (lastPayload?.canMarkPaid
        ? `<button type="button" class="de-btn de-btn-secondary mod-mark-paid" data-feature="${escHtml(m.feature)}">Mark paid</button>`
        : '')
    );
  }
  if (ent?.status === 'requested' || ent?.status === 'invoiced') {
    return `${price}<span class="mod-buy-note">Requested — we will follow up</span>`;
  }
  if (!m.purchasable) return price || '<span class="mod-muted">—</span>';
  return (
    `${price}` +
    `<button type="button" class="de-btn de-btn-primary mod-buy-btn" data-feature="${escHtml(m.feature)}">Buy</button>`
  );
}

function catalogFieldValue(pane, field) {
  return pane.querySelector(`[data-field="${field}"]`)?.value?.trim() || '';
}

function readDetailIntoCatalog() {
  const pane = rootEl()?.querySelector('.de-pane');
  const item = findItem(activeKey);
  if (!pane || !item?.catalogKey) return;
  const row = catalogRows.find((r) => r.key === item.catalogKey);
  if (!row) return;
  const locked = row.kind === 'core' || row.kind === 'module';
  row.label = catalogFieldValue(pane, 'label') || row.label;
  if (!locked) {
    row.feature = (catalogFieldValue(pane, 'feature') || row.feature).toLowerCase().replace(/-/g, '_');
  }
  row.id = catalogFieldValue(pane, 'id') || row.id;
  row.priceLabel = catalogFieldValue(pane, 'price');
  row.blurb = catalogFieldValue(pane, 'blurb');
  const groupEl = pane.querySelector('[data-field="group"]');
  if (groupEl?.value && GROUP_META[groupEl.value]) row.group = groupEl.value;
  const sheet = pane.querySelector('[data-field="sheet"]');
  if (sheet) row.saleSheet = sheet.getAttribute('aria-checked') === 'true';
  const audienceEl = pane.querySelector('[data-field="audience"]');
  if (audienceEl?.value === 'owner' || audienceEl?.value === 'staff' || audienceEl?.value === 'both') {
    row.audience = audienceEl.value;
    item.audience = row.audience;
  }
  row.requires = [...pane.querySelectorAll('[data-requires]:checked')]
    .map((el) => el.getAttribute('data-requires'))
    .filter(Boolean);
  item.requires = row.requires;
  row.industries = [...pane.querySelectorAll('[data-industry]:checked')]
    .map((el) => el.getAttribute('data-industry'))
    .filter(Boolean);
  item.industries = row.industries;
}

function renderEmptyPane(pane) {
  pane.innerHTML = '';
  pane.appendChild(createPaneHeader({ title: 'Modules' }).root);
  const body = document.createElement('div');
  body.className = 'de-pane-empty-body';
  const hint = document.createElement('p');
  hint.className = 'de-empty';
  hint.textContent = canEditCatalog()
    ? 'Select a module to edit the sale sheet, or add a row.'
    : 'Select a module to see deploy status and add-on purchase.';
  body.appendChild(hint);
  if (canEditCatalog()) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'de-btn de-btn-secondary';
    reset.textContent = 'Reset catalog';
    reset.addEventListener('click', () => void resetCatalog());
    body.appendChild(reset);
  }
  pane.appendChild(body);
}

function requiresOptionsHtml(item) {
  const selected = new Set(item.requires || []);
  const options = items
    .filter((m) => m.feature && m.feature !== item.feature && m.kind !== 'core')
    .sort((a, b) => (a.label || a.feature).localeCompare(b.label || b.feature, undefined, { sensitivity: 'base' }));
  if (!options.length) return '<p class="mod-sheet-hint">No other modules to require.</p>';
  return (
    `<div class="mod-requires-list">` +
    options
      .map(
        (m) =>
          `<label class="mod-requires-opt">` +
          `<input type="checkbox" data-requires="${escHtml(m.feature)}"${selected.has(m.feature) ? ' checked' : ''}>` +
          `<span>${escHtml(m.label || m.feature)}</span>` +
          `</label>`,
      )
      .join('') +
    `</div>`
  );
}

function industryOptionsHtml(item) {
  if (!industryOptions.length) {
    return '<p class="mod-sheet-hint">No industries yet. Add them under Account → Industries.</p>';
  }
  const selected = new Set(item.industries || []);
  return (
    `<div class="mod-requires-list">` +
    industryOptions
      .map(
        (industry) =>
          `<label class="mod-requires-opt">` +
          `<input type="checkbox" data-industry="${escHtml(industry.slug)}"${selected.has(industry.slug) ? ' checked' : ''}>` +
          `<span>${escHtml(industry.label)}</span>` +
          `</label>`,
      )
      .join('') +
    `</div>`
  );
}

function industrySummaryHtml(item) {
  const selected = new Set(item.industries || []);
  const labels = industryOptions
    .filter((industry) => selected.has(industry.slug))
    .map((industry) => industry.label);
  if (!labels.length) return '';
  return `<p class="mod-requires-summary">Suggested for ${escHtml(labels.join(', '))}</p>`;
}

function requiresSummaryHtml(item) {
  const labels = (item.requires || [])
    .map((feature) => items.find((m) => m.feature === feature)?.label || feature)
    .filter(Boolean);
  if (!labels.length) return '';
  return `<p class="mod-requires-summary">Requires ${escHtml(labels.join(', '))}</p>`;
}

function groupSelectHtml(selected) {
  const groups = catalogGroups.length
    ? catalogGroups
    : GROUP_ORDER.map((id) => ({ id, title: GROUP_META[id].title }));
  return (
    `<select data-field="group" class="de-input">` +
    groups
      .map(
        (g) =>
          `<option value="${escHtml(g.id)}"${g.id === selected ? ' selected' : ''}>${escHtml(g.title)}</option>`,
      )
      .join('') +
    `</select>`
  );
}

function renderDetailPane() {
  const root = rootEl();
  const pane = root?.querySelector('.de-pane');
  if (!pane) return;
  const item = findItem(activeKey);
  if (!item) {
    renderEmptyPane(pane);
    return;
  }

  const meta = groupMeta(item.group);
  const deploy = item.deploy;
  const locked = item.kind === 'core' || item.kind === 'module';
  const editable = canEditCatalog() && item.catalogKey;
  const service =
    item.visibility === 'service' || item.group === 'google_workspace' || item.group === 'hosting';

  const icons = [];
  if (canDeleteItem(item)) {
    icons.push(
      createIosIconBtn({
        iconKey: 'trash',
        label: 'Delete module',
        confirmDelete: true,
        onClick: () => deleteItem(item),
      }),
    );
  }

  pane.innerHTML = '';
  pane.appendChild(
    createPaneHeader({
      back: {
        label: 'Back to modules',
        onClick: closeDetail,
      },
      title: item.label || item.feature,
      subtitle: item.feature,
      icons,
    }).root,
  );

  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll mod-detail-scroll';

  if (editable) {
    const fields = document.createElement('div');
    fields.className = 'de-fields';
    fields.dataset.catalogRow = item.catalogKey;
    fields.innerHTML =
      `<label class="de-label">Module<input type="text" data-field="label" class="de-input" value="${escHtml(item.label || '')}"></label>` +
      `<label class="de-label">Feature<input type="text" data-field="feature" class="de-input" value="${escHtml(item.feature || '')}" ${locked ? 'readonly' : ''} spellcheck="false"></label>` +
      `<label class="de-label">ID<input type="text" data-field="id" class="de-input" value="${escHtml(item.id || '')}" spellcheck="false"></label>` +
      `<label class="de-label">Group${groupSelectHtml(item.group)}</label>` +
      `<label class="de-label">Price<input type="text" data-field="price" class="de-input" value="${escHtml(item.priceLabel || '')}" spellcheck="false"></label>` +
      `<label class="de-label">Description<textarea data-field="blurb" class="de-input" rows="6">${escHtml(item.blurb || '')}</textarea></label>` +
      (item.kind === 'core'
        ? ''
        : `<div class="de-label mod-requires-field"><span>Requires</span>${requiresOptionsHtml(item)}` +
          `<span class="mod-sheet-hint">Turned on automatically with this module.</span></div>` +
          `<div class="de-label mod-requires-field"><span>Industries</span>${industryOptionsHtml(item)}` +
          `<span class="mod-sheet-hint">Suggested when this industry is picked on the demo loader or deploy wizard.</span></div>`) +
      `<div class="re-toggle-row mod-sheet-row">` +
      `<span class="de-label">Sale sheet</span>` +
      `<button type="button" class="prof-plugin-toggle" role="switch" data-field="sheet" ` +
      `aria-checked="${item.saleSheet ? 'true' : 'false'}" aria-label="Show on sale sheet"></button>` +
      `<span class="mod-sheet-hint">Show this module on the public sale sheet.</span>` +
      `</div>` +
      `<label class="de-label">Staff access` +
      `<select data-field="audience" class="de-input">` +
      `<option value="both"${item.audience !== 'owner' && item.audience !== 'staff' ? ' selected' : ''}>Owner + staff</option>` +
      `<option value="staff"${item.audience === 'staff' ? ' selected' : ''}>Staff only</option>` +
      `<option value="owner"${item.audience === 'owner' ? ' selected' : ''}>Owner only</option>` +
      `</select>` +
      `<span class="mod-sheet-hint">Who can open this module in the admin OS. Satellites pull this from reΛVe.</span>` +
      `</label>`;
    scroll.appendChild(fields);
  } else {
    const blurb = document.createElement('p');
    blurb.className = 'mod-detail-blurb';
    blurb.textContent = item.blurb || deploy?.label || meta.title;
    scroll.appendChild(blurb);
    const req = document.createElement('div');
    req.innerHTML = requiresSummaryHtml(item) + industrySummaryHtml(item);
    if (req.firstChild) {
      [...req.children].forEach((child) => scroll.appendChild(child));
    }
  }

  const status = document.createElement('section');
  status.className = 'mod-detail-status';
  if (deploy && !service) {
    const statusCls = STATUS_CLASS[deploy.status] || 'mod-status--development';
    const navPills = deploy.footerNavLabels?.length
      ? deploy.footerNavLabels.map((l) => `<span class="mod-nav-pill">${escHtml(l)}</span>`).join('')
      : '';
    status.innerHTML =
      `<h2 class="mod-detail-heading">This install</h2>` +
      `<div class="mod-detail-status-row">` +
      `<span class="mod-status ${statusCls}">${escHtml(STATUS_LABELS[deploy.status] || deploy.status)}</span>` +
      (deploy.needsAttention ? `<span class="mod-summary-pill mod-summary-pill--warn">Needs attention</span>` : '') +
      `</div>` +
      `<ul class="mod-flag-list">` +
      renderFlag(deploy.enabled, 'Enabled on this install') +
      renderFlag(deploy.inFooterNav, 'Linked in footer nav', navPills) +
      renderFlag(deploy.configured, 'Plugin / env configured') +
      renderFlag(deploy.runtimeAllowed, 'Allowed at runtime') +
      renderFlag(deploy.active, 'Active') +
      (deploy.inDemoSuite != null ? renderFlag(deploy.inDemoSuite, 'In the active demo suite') : '') +
      `</ul>` +
      `<div class="mod-cell-buy">${renderPurchaseHtml(deploy)}</div>`;
  } else if (editable || service) {
    status.innerHTML =
      `<h2 class="mod-detail-heading">This install</h2>` +
      `<p class="mod-muted">Not a deployable feature.</p>`;
  }
  scroll.appendChild(status);
  pane.appendChild(scroll);
  bindDetailEvents(pane);
}

function bindDetailEvents(pane) {
  pane.addEventListener('input', (e) => {
    if (!e.target?.closest?.('[data-catalog-row], [data-field]')) return;
    dirty = true;
    scheduleSave();
  });
  pane.addEventListener('change', (e) => {
    if (!e.target?.closest?.('[data-field], [data-requires], [data-industry], [data-catalog-row]')) return;
    dirty = true;
    scheduleSave();
  });
  pane.querySelector('.mod-sheet-row')?.addEventListener('click', () => {
    const btn = pane.querySelector('[data-field="sheet"]');
    if (!btn) return;
    setToggleSwitch(btn, btn.getAttribute('aria-checked') !== 'true');
    const item = findItem(activeKey);
    if (item) {
      item.saleSheet = btn.getAttribute('aria-checked') === 'true';
      const row = catalogRows.find((r) => r.key === item.catalogKey);
      if (row) row.saleSheet = item.saleSheet;
      syncSaleSheetBadge(item);
    }
    dirty = true;
    scheduleSave();
  });
  pane.querySelector('.mod-buy-btn')?.addEventListener('click', (e) => {
    void purchaseFromButton(e.currentTarget, 'purchase');
  });
  pane.querySelector('.mod-mark-paid')?.addEventListener('click', (e) => {
    void purchaseFromButton(e.currentTarget, 'mark_paid');
  });
}

async function purchaseFromButton(btn, action) {
  const feature = btn?.getAttribute('data-feature');
  if (!feature) return;
  btn.disabled = true;
  try {
    const data = await purchaseModule(feature, action);
    if (!data.ok) throw new Error(data.error || 'Update failed');
    if (action === 'purchase') {
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer');
        void osAlert({
          title: 'Invoice ready',
          bodyHtml:
            'Pay the invoice to purchase this module. We turn it on after the payment clears — you cannot enable it yourself.',
        });
      } else {
        void osAlert({
          title: 'Request sent',
          bodyHtml: data.invoiceError
            ? `We logged the request. Invoicing is not available here yet (${escHtml(data.invoiceError)}). We will call you for a card.`
            : 'We logged the request and will follow up for payment. Modules are not self-serve toggles.',
        });
      }
    } else {
      void osAlert({
        title: 'Marked paid',
        bodyHtml: 'Payment recorded. Enable the module in this install’s features[] on the next deploy.',
      });
    }
    skipQuietUntil = Date.now() + 1500;
    void loadModulesTab({ force: true });
  } catch (e) {
    btn.disabled = false;
    void osAlert({ title: action === 'purchase' ? 'Purchase failed' : 'Update failed', bodyHtml: escHtml(e.message) });
  }
}

async function purchaseModule(feature, action) {
  const res = await adminFetch('/api/admin/modules/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, feature }),
  });
  return readAdminJson(res, 'module-purchase');
}

function scheduleSave() {
  if (!canEditCatalog()) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void persistCatalog();
  }, 700);
}

async function persistCatalog({ reset = false } = {}) {
  if (!canEditCatalog() || saving) return;
  if (!reset) readDetailIntoCatalog();
  saving = true;
  try {
    const body = reset ? { reset: true } : { rows: catalogRows };
    const res = await fetch(CATALOG_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    const selectedFeature = findItem(activeKey)?.feature;
    catalogRows = json.rows || [];
    if (Array.isArray(json.groups) && json.groups.length) catalogGroups = json.groups;
    items = mergeItems(catalogRows, lastPayload);
    dirty = false;
    if (activeKey && !findItem(activeKey)) {
      const byFeature = selectedFeature
        ? items.find((item) => item.feature === selectedFeature)
        : null;
      activeKey = byFeature ? itemKey(byFeature) : null;
      if (!activeKey) rootEl()?.classList.remove('de-pane-active');
    }
    const selected = findItem(activeKey);
    const groupChanged = selected && filter !== 'all' && selected.group !== filter;
    if (groupChanged) filter = selected.group;
    if (reset || groupChanged) renderShell();
    else refreshSidebarList();
  } catch (e) {
    void osAlert({ title: 'Catalog', bodyHtml: escHtml(e.message || 'Could not save catalog.') });
  } finally {
    saving = false;
  }
}

async function resetCatalog() {
  if (!canEditCatalog()) return;
  if (!window.confirm('Reset the catalog to the shipped defaults? Your saved edits will be replaced.')) return;
  window.clearTimeout(saveTimer);
  dirty = false;
  await persistCatalog({ reset: true });
}

async function deleteItem(item) {
  if (!canDeleteItem(item)) return;
  if (catalogRows.length <= 1) {
    void osAlert({
      title: 'Catalog',
      bodyHtml: 'At least one catalog row is required.',
    });
    return;
  }
  window.clearTimeout(saveTimer);
  readDetailIntoCatalog();
  catalogRows = catalogRows.filter((row) => row.key !== item.catalogKey);
  if (activeKey === itemKey(item)) {
    activeKey = null;
    rootEl()?.classList.remove('de-pane-active');
  }
  dirty = true;
  await persistCatalog();
  renderDetailPane();
}

function addCustomRow() {
  if (!canEditCatalog()) return;
  readDetailIntoCatalog();
  const group = filter !== 'all' && GROUP_META[filter] ? filter : 'other';
  const row = newCustomRow(group);
  catalogRows.push(row);
  items = mergeItems(catalogRows, lastPayload);
  activeKey = row.key;
  dirty = true;
  refreshSidebarList();
  renderDetailPane();
  rootEl()?.classList.add('de-pane-active');
  scheduleSave();
  rootEl()?.querySelector('[data-field="label"]')?.focus();
}

function renderShell() {
  const root = rootEl();
  if (!root) return;
  const savedScroll = captureSidebarScroll(root);
  const savedFilter = captureFilterTabsScroll(root);
  const visible = filteredItems();
  root.innerHTML = '';
  root.classList.toggle('de-pane-active', !!findItem(activeKey));

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const searchOpts = {
    value: search,
    placeholder: `Search ${visible.length} ${visible.length === 1 ? 'Module' : 'Modules'}`,
    onInput(value) {
      search = value;
      const next = filteredItems();
      if (activeKey && !next.some((item) => itemKey(item) === activeKey)) {
        activeKey = null;
        root.classList.remove('de-pane-active');
        renderDetailPane();
      }
      refreshSidebarList();
    },
  };

  const subheader = listSearchAddNew({
    itemCount: visible.length,
    search: searchOpts,
    addNew: canEditCatalog() ? { label: 'New module', onClick: addCustomRow } : false,
    below: renderFilterTabs(savedFilter),
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  fillSidebarList(list);
  attachIosPullToRefresh(list, () => {
    if (!isActiveTab()) return;
    return loadModulesTab({ force: true });
  });
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  root.appendChild(pane);
  renderDetailPane();
  restoreSidebarScroll(root, savedScroll);
}

async function fetchStatus() {
  const res = await adminFetch(STATUS_API, { cache: 'no-store' });
  const data = await readAdminJson(res, 'deploy-status');
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function fetchCatalog() {
  if (!canEditCatalog()) return null;
  const res = await fetch(CATALOG_API, { cache: 'no-store' });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function fetchIndustries() {
  if (!canEditCatalog()) return [];
  const res = await fetch(INDUSTRIES_API, { cache: 'no-store' });
  if (res.status === 404) return [];
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return [];
  return Array.isArray(data.industries)
    ? data.industries
        .filter((item) => item && item.slug && item.label)
        .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }))
    : [];
}

function renderSignedOutGate(title) {
  return (
    `<div class="modules-panel-scroll">` +
    `<div class="mod-auth-gate prof-card">` +
    `<h1 class="prof-title">${escHtml(title)}</h1>` +
    `<p class="prof-subtitle">Sign in to view module status and the catalog for this install.</p>` +
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

export async function loadModulesTab(opts = {}) {
  const root = rootEl();
  if (!root) return;

  if (!document.body?.dataset?.userId?.trim()) {
    root.innerHTML = renderSignedOutGate('Modules');
    bindSignedOutGate(root);
    stopPoll();
    return;
  }

  const quiet = opts.quiet === true;
  if (opts.feature) queueModuleDeepLink(opts.feature);
  if (quiet && (dirty || saving || Date.now() < skipQuietUntil)) return;

  if (!quiet && !root.querySelector('.ch-sidebar')) {
    mountPanelSkeleton(root, 'list', 'Loading modules…');
  }

  try {
    const [status, catalog, industries] = await Promise.all([
      fetchStatus(),
      fetchCatalog().catch(() => null),
      fetchIndustries().catch(() => []),
    ]);
    lastPayload = status;
    industryOptions = industries;
    if (status.pollMs) pollMs = status.pollMs;
    if (catalog) {
      catalogRows = Array.isArray(catalog.rows) ? catalog.rows : [];
      catalogGroups = Array.isArray(catalog.groups) ? catalog.groups : [];
      if (!industryOptions.length && Array.isArray(catalog.industries)) {
        industryOptions = catalog.industries.filter((item) => item && item.slug && item.label);
      }
    } else if (!canEditCatalog()) {
      catalogRows = [];
      catalogGroups = Array.isArray(status.groups) ? status.groups : [];
    }
    items = mergeItems(catalogRows.length ? catalogRows : null, status);
    consumePendingFeature({ allowUrl: !quiet });
    if (activeKey && !findItem(activeKey)) {
      activeKey = null;
      root.classList.remove('de-pane-active');
    }
    if (quiet && root.querySelector('.ch-sidebar')) {
      refreshSidebarList();
      if (activeKey) renderDetailPane();
      root.classList.toggle('de-pane-active', !!findItem(activeKey));
    } else {
      renderShell();
    }
    startPoll();
  } catch (e) {
    if (e.message === 'Session expired') return;
    if (quiet && lastPayload) return;
    root.innerHTML =
      `<div class="modules-panel-scroll"><p class="mod-empty mod-empty--error">Could not load modules: ${escHtml(e.message)}</p></div>`;
    if (!quiet) {
      void osAlert({ title: 'Modules', bodyHtml: escHtml(e.message) });
    }
  }
}

export function teardownModulesPanel() {
  window.clearTimeout(saveTimer);
  stopPoll();
}
