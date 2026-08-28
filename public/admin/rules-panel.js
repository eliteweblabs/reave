/**
 * rules panel — extracted from os-map-loader.js
 */
import {
  IOS_ICONS,
  iosIcon,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  syncSearchFieldAdornment,
  createSlidingPillSelect,
  createToggleSwitch,
  setToggleSwitch,
  createPanelBackBtn,
  flushTitleFocus,
  matchesListSearch,
  initSidebarLayout,
  syncAdminSplitView,
  scanPanelSidebars,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  bindListMultiSelect,
  showContextMenu,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  swipeJunkAction,
  swipeReceiptAction,
  swipeClearAction,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  paneDeleteIcon,
  paneShareIcon,
} from './admin-ui.js?v=20260825h';
import { createPaneHeader } from './pane-header.js?v=20260821c';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, mountPanelSkeleton, showPersonal } from './shared.js?v=20260810a';
import { osAlert, openOsDialogBackdrop, closeOsDialogBackdrop } from './os-dialog.js?v=20260826a';
import {
  formatRuleWhenClause,
  formatRuleLabMeta,
  formatRuleProcessLabel,
  insertDragWithinScope,
} from './email-triage-lab.js?v=20260828a';
import {
  createChipPair,
  chipsFromRulePhrases,
  phrasesFromChips,
  fieldsFromChips,
  titleFromRulePhrases,
} from './rule-chip-editor.js?v=20260828a';
import { NOTICE_ACTION_ICONS } from './admin-notice.js?v=20260828a';
import { queueUndoableDelete } from './shake-undo.js?v=20260824a';

/** Injected by os-map-loader via initRulesPanel(). */
let shell = {};

export function initRulesPanel(deps) {
  shell = deps;
}

// ---- extracted from os-map-loader.js:8260-8914 ----
let ruleState = {
  rules: [],
  notifyOnUnmatched: false,
  storage: 'files',
  search: '',
  /** Inclusive on/off chips — default all on. */
  scopeOn: { personal: true, universal: true },
  processOn: { delete: true, archive: true, receipt: true, classify: true },
  activeId: null,
  dirty: false,
  missingTitle: '',
  /** When set, the rule editor chevron returns to this inbox message. */
  returnToEmailId: null,
};

let ruleAutosaveTimer = null;
/** @type {null | (() => Promise<boolean>)} */
let ruleAutosaveFlush = null;
let ruleAutosaveError = '';

function ruleScope(rule) {
  return rule?.scope === 'universal' ? 'universal' : 'personal';
}

function isCatalogRule(rule) {
  return ruleScope(rule) === 'universal';
}

function canManageUniversalRules() {
  return window.__installConfig?.canManageUniversalRules === true;
}

function isCatalogReadOnly(rule) {
  return isCatalogRule(rule) && !canManageUniversalRules();
}

const REPO_CATALOG_STATUSES = new Set([
  'VERIFICATION_CODE',
  'AUTH_LINK',
  'ANTHROPIC_BILLING',
  'RAILWAY_ALERT',
  'DOWN',
  'NEEDS_CHECK',
  'RECEIPT',
  'AUTO_ARCHIVED',
  'DELETE',
]);

function isRepoCatalogRuleClient(rule) {
  if (ruleScope(rule) !== 'universal') return false;
  const status = String(rule.status || '').toUpperCase();
  if (!REPO_CATALOG_STATUSES.has(status)) return false;
  const fields = rule.fields || [];
  if (!fields.includes('from')) return true;
  // Catalog shipment-tracked is the only default that searches `from`.
  return (rule.phrases || []).some((p) => /shipment\s*[-]?track/i.test(String(p)));
}

function canDeleteRule(rule) {
  if (isRepoCatalogRuleClient(rule) || isCatalogReadOnly(rule)) return false;
  return true;
}

function ruleScopeLabel(rule) {
  return ruleScope(rule) === 'universal' ? 'Universal' : 'Personal';
}

function phraseSummary(phrases, max = 3) {
  if (!phrases?.length) return '(any phrase)';
  const shown = phrases.slice(0, max);
  const tail = phrases.length > max ? ` +${phrases.length - max}` : '';
  return shown.map((p) => `"${p}"`).join(' · ') + tail;
}

function exceptSummary(phrases, max = 2) {
  if (!phrases?.length) return '';
  const shown = phrases.slice(0, max).map((p) => `!"${p}"`);
  const tail = phrases.length > max ? ` +${phrases.length - max}` : '';
  return shown.join(' · ') + tail;
}

function flowWhenSubline(rule) {
  const positive = phraseSummary(rule.phrases);
  const except = exceptSummary(rule.exceptPhrases);
  return except ? `${positive} · except ${except}` : positive;
}

function fieldsSummary(fields) {
  return (fields || ['subject', 'body']).join(', ');
}

function getRuleEditor() {
  return document.getElementById('rule-editor');
}

function isRuleExpired(rule) {
  if (!rule?.expiresAt) return false;
  const t = new Date(rule.expiresAt).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

function formatRuleExpiresLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toRuleDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromRuleDatetimeLocalValue(local) {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function defaultRuleExpiresLocalValue() {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return toRuleDatetimeLocalValue(d.toISOString());
}

function ruleHitCount(rule) {
  return Math.max(0, Number(rule?.hitCount) || 0);
}

function formatRuleHitLabel(rule) {
  const n = ruleHitCount(rule);
  return n === 1 ? '1 hit' : `${n} hits`;
}

function formatRuleLastMatchedLabel(rule) {
  if (!rule?.lastMatchedAt) return null;
  const label = shell.formatChatDate?.(rule.lastMatchedAt);
  return label ? `last ${label}` : null;
}

function ruleHitsSubline(rule) {
  const bits = [formatRuleHitLabel(rule)];
  const last = formatRuleLastMatchedLabel(rule);
  if (last) bits.push(last);
  return bits.join(' · ');
}

function ruleNotifyChannels(rule) {
  const push = rule.notifyPush != null ? !!rule.notifyPush : !!rule.notify;
  const dashboard = rule.notifyDashboard != null ? !!rule.notifyDashboard : !!rule.notify;
  return { push, dashboard, notify: push || dashboard };
}

function ruleNotifyActions(rule) {
  if (Array.isArray(rule.notifyActions) && rule.notifyActions.length) {
    return rule.notifyActions.map(String);
  }
  const status = String(rule.status || '').toUpperCase();
  if (status === 'VERIFICATION_CODE') return ['copy', 'delete'];
  if (status === 'AUTH_LINK') return ['activate', 'delete'];
  if (status === 'RECEIPT') return ['expense', 'archive'];
  return ['view', 'archive'];
}

const RULE_PROCESS_OPTIONS = [
  { value: 'delete', label: 'Auto delete' },
  { value: 'archive', label: 'Archive' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'classify', label: 'Keep' },
];

function ruleProcessValue(ruleOrStatus) {
  const status = String(
    typeof ruleOrStatus === 'string' ? ruleOrStatus : ruleOrStatus?.status || '',
  ).toUpperCase();
  if (status === 'DELETE' || status === 'JUNK') return 'delete';
  if (status === 'AUTO_ARCHIVED') return 'archive';
  if (status === 'RECEIPT') return 'receipt';
  return 'classify';
}

function statusForProcess(process, currentStatus) {
  if (process === 'delete') return 'DELETE';
  if (process === 'archive') return 'AUTO_ARCHIVED';
  if (process === 'receipt') return 'RECEIPT';
  const cur = String(currentStatus || '').toUpperCase();
  if (cur === 'DELETE' || cur === 'JUNK' || cur === 'AUTO_ARCHIVED' || cur === 'RECEIPT') {
    return 'CUSTOM';
  }
  return currentStatus || 'CUSTOM';
}

function processIsSilentFile(process) {
  return process === 'delete' || process === 'archive' || process === 'receipt';
}

/** Primary action shown on the list row (icon + chip). */
function ruleKind(rule) {
  const process = ruleProcessValue(rule);
  if (process === 'delete') {
    return { id: 'delete', label: 'Auto delete', icon: 'trash', statusClass: 'em-status-delete' };
  }
  if (process === 'archive') {
    return { id: 'archive', label: 'Archive', icon: 'archive', statusClass: 'em-status-auto_archived' };
  }
  if (process === 'receipt') {
    return { id: 'receipt', label: 'Receipt', icon: 'receipt', statusClass: 'em-cat-receipt' };
  }
  if (rule?.forwardTo) {
    return { id: 'forward', label: 'Forward', icon: 'send', statusClass: 'em-status-sent' };
  }
  const status = String(rule?.status || '').toUpperCase();
  if (status === 'VERIFICATION_CODE') {
    return { id: 'otp', label: 'Verification', icon: 'key', statusClass: 'em-cat-otp' };
  }
  if (status === 'AUTH_LINK') {
    return { id: 'auth', label: 'Auth link', icon: 'link', statusClass: 'em-cat-otp' };
  }
  if (ruleNotifyChannels(rule).notify) {
    return { id: 'notify', label: formatRuleProcessLabel(rule), icon: 'bell', statusClass: 'em-cat-alert' };
  }
  return { id: 'keep', label: 'Keep', icon: 'mail', statusClass: 'em-status-default' };
}

function ruleListSummary(rule) {
  const bits = [];
  if (ruleScope(rule) === 'universal' || showPersonal()) bits.push(ruleScopeLabel(rule));
  bits.push(fieldsSummary(rule.fields));
  if (rule.forwardTo) bits.push(`→ ${rule.forwardTo}`);
  return bits.join(' · ');
}

function ruleListItemInnerHtml(rule) {
  const kind = ruleKind(rule);
  const extras = [];
  if (kind.id !== 'forward' && rule.forwardTo) {
    extras.push('<span class="em-status em-status-sent">Forward</span>');
  }
  if (rule.enabled === false) extras.push('<span class="em-status em-status-default">Off</span>');
  if (isRuleExpired(rule)) extras.push('<span class="em-status em-status-rejected">Expired</span>');
  return `
    <span class="sidebar-list-author-icon re-kind-icon re-kind-icon--${escHtml(kind.id)}" aria-hidden="true">${iosIcon(kind.icon, 14)}</span>
    <span class="ch-list-content">
      <span class="em-item-row em-item-header">
        <span class="em-status ${kind.statusClass}">${escHtml(kind.label)}</span>
        ${extras.join('')}
        <span class="em-item-date">${escHtml(formatRuleHitLabel(rule))}</span>
      </span>
      <span class="em-item-subject">${escHtml(titleFromRulePhrases(rule.phrases, rule.title || rule.status || 'Rule'))}</span>
      <span class="em-item-summary">${escHtml(ruleListSummary(rule))}</span>
    </span>`;
}

function processHintText(process) {
  if (process === 'delete') {
    return 'Matched mail goes to Auto deleted (filtered review). Junk is only for spam. No notification.';
  }
  if (process === 'archive') {
    return 'Matched mail is filed to Archive. No notification.';
  }
  if (process === 'receipt') {
    return 'Matched mail is filed as a tax receipt. No alert.';
  }
  return 'Keep leaves the email in the inbox. Turn on Notify below for an alert. Notification buttons do not process the mail.';
}

function isProcessDerivedStatus(status) {
  const s = String(status || '').toUpperCase();
  return s === 'DELETE' || s === 'JUNK' || s === 'AUTO_ARCHIVED' || s === 'RECEIPT' || s === 'CUSTOM';
}

function ruleScopePillHtml(rule) {
  const scope = ruleScope(rule);
  if (scope !== 'universal' && !showPersonal()) return '';
  return `<span class="re-scope-pill re-scope-pill--${scope}">${escHtml(ruleScopeLabel(rule))}</span>`;
}

function ruleSubline(rule) {
  const bits = [];
  if (ruleScope(rule) === 'universal' || showPersonal()) bits.push(ruleScopeLabel(rule));
  if (rule.status && !isProcessDerivedStatus(rule.status)) bits.push(rule.status);
  bits.push(formatRuleProcessLabel(rule));
  bits.push(formatRuleHitLabel(rule));
  if (!rule.enabled) bits.push('Off');
  if (rule.expiresAt) {
    bits.push(isRuleExpired(rule) ? 'Expired' : `Until ${formatRuleExpiresLabel(rule.expiresAt)}`);
  }
  if (rule.forwardTo) {
    bits.push(`→ ${rule.forwardTo}`);
    if (rule.createProject) bits.push('create project');
  }
  return bits.join(' · ');
}

function ruleToggleOn(el) {
  return el?.getAttribute?.('aria-checked') === 'true';
}

function createRuleToggle({ checked = false, label, onToggle }) {
  return createToggleSwitch({
    checked,
    label,
    onClick: (btn) => {
      const next = btn.getAttribute('aria-checked') !== 'true';
      setToggleSwitch(btn, next);
      onToggle?.(next, btn);
      btn.dispatchEvent(new Event('change', { bubbles: true }));
    },
  });
}

function createRuleToggleRow(label, toggle, opts = {}) {
  const row = document.createElement('div');
  row.className = 'prof-plugin-row re-toggle-row';
  const copy = document.createElement('div');
  copy.className = 'prof-plugin-copy';
  const lab = document.createElement('div');
  lab.className = 'prof-plugin-label';
  if (opts.iconKey) {
    lab.classList.add('re-toggle-label--icon');
    const icon = document.createElement('span');
    icon.className = 're-action-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iosIcon(opts.iconKey, 16);
    const text = document.createElement('span');
    text.textContent = label;
    lab.append(icon, text);
  } else {
    lab.textContent = label;
  }
  copy.appendChild(lab);
  row.append(copy, toggle);
  row.addEventListener('click', (e) => {
    if (toggle.disabled) return;
    if (e.target === toggle || toggle.contains(/** @type {Node} */ (e.target))) return;
    toggle.click();
  });
  return row;
}

function appendRuleField(parent, label, el, hint, opts = {}) {
  const wrap = document.createElement(opts.as === 'div' ? 'div' : 'label');
  wrap.className = 'de-label';
  wrap.textContent = label;
  let hintEl = null;
  if (hint) {
    hintEl = document.createElement('span');
    hintEl.className = 're-field-hint';
    hintEl.textContent = hint;
    wrap.appendChild(hintEl);
  }
  wrap.appendChild(el);
  parent.appendChild(wrap);
  return { wrap, hintEl };
}

let rulesLoadGen = 0;

function revealRuleInFilters(rule) {
  if (!rule) return;
  const scope = ruleScope(rule);
  if (ruleState.scopeOn?.[scope] === false) ruleState.scopeOn[scope] = true;
  const process = ruleProcessValue(rule);
  if (ruleState.processOn?.[process] === false) ruleState.processOn[process] = true;
  if (!ruleMatchesSidebarSearch(rule)) ruleState.search = '';
}

function syncRulesTabUrl() {
  shell.syncAdminTabUrl?.('rules', { ruleId: ruleState.activeId || '' });
}

async function loadRulesTab(opts = {}) {
  const root = getRuleEditor();
  if (!root) return;
  if (opts.flush !== false && ruleState.activeId && typeof ruleAutosaveFlush === 'function') {
    if (!(await flushRuleAutosave())) return;
  }
  const requested = String(opts.ruleId || ruleState.activeId || '').trim();
  if (requested) ruleState.activeId = requested;
  const gen = ++rulesLoadGen;
  mountPanelSkeleton(root, 'list', 'Loading rules…', { contentSelector: '.ch-sidebar' });
  try {
    const res = await fetch('/api/email/rules', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (gen !== rulesLoadGen) return;
    ruleState.rules = data.rules || [];
    ruleState.notifyOnUnmatched = !!data.notifyOnUnmatched;
    ruleState.storage = data.storage || 'files';
  } catch (e) {
    if (gen !== rulesLoadGen) return;
    root.innerHTML = `<div class="de-loading de-error">Failed to load rules: ${escHtml(e.message)}</div>`;
    return;
  }
  if (gen !== rulesLoadGen) return;
  if (requested) {
    const found = ruleState.rules.find((r) => String(r.id) === requested);
    revealRuleInFilters(found);
    ruleState.activeId = requested;
    if (!found) ruleState.dirty = false;
  } else if (ruleState.activeId && !ruleState.rules.some((r) => String(r.id) === String(ruleState.activeId))) {
    // Keep the requested id so Edit rule can show a missing-rule stub instead of
    // wiping the selection and leaving an empty filtered pipeline.
    ruleState.dirty = false;
  }
  renderRulesEditor();
  syncRulesTabUrl();
}

function createRuleListItem(rule, activeId) {
  const isActive = activeId === rule.id || String(activeId) === String(rule.id);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `em-list-item${isActive ? ' active' : ''}${rule.enabled === false || isRuleExpired(rule) ? ' re-list-disabled' : ''}`;
  btn.dataset.id = rule.id;
  if (isActive) btn.setAttribute('aria-current', 'page');
  btn.innerHTML = ruleListItemInnerHtml(rule);
  btn.addEventListener('click', () => void openRuleEditor(rule.id));
  return btn;
}

function createRuleSwipeRow(rule, activeId) {
  const actions = [swipeAgentAction(() => shell.askAgentAboutRule?.(rule))];
  if (canDeleteRule(rule)) {
    actions.push(swipeDeleteAction({
      onClick: () => deleteRule(rule.id),
    }));
  }
  return createSwipeRow(createRuleListItem(rule, activeId), actions);
}

function ruleMatchesScopeFilter(rule) {
  const scope = ruleScope(rule);
  return ruleState.scopeOn?.[scope] !== false;
}

function ruleMatchesProcessFilter(rule) {
  const process = ruleProcessValue(rule);
  return ruleState.processOn?.[process] !== false;
}

function ruleMatchesSidebarSearch(rule) {
  const kind = ruleKind(rule);
  return matchesListSearch(
    ruleState.search,
    rule.title,
    rule.status,
    kind.label,
    ruleSubline(rule),
    ruleListSummary(rule),
    rule.description,
    ruleScopeLabel(rule),
    formatRuleWhenClause(rule),
    formatRuleLabMeta(rule),
    rule.forwardTo,
    ...(rule.phrases || []),
    ...(rule.exceptPhrases || []),
  );
}

function filteredRules() {
  return [...ruleState.rules]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .filter((rule) =>
      ruleMatchesScopeFilter(rule) &&
      ruleMatchesProcessFilter(rule) &&
      ruleMatchesSidebarSearch(rule),
    );
}

const RULE_SCOPE_CHIPS = [
  { id: 'personal', label: 'Personal' },
  { id: 'universal', label: 'Universal' },
];
const RULE_PROCESS_CHIPS = [
  { id: 'delete', label: 'Auto delete' },
  { id: 'archive', label: 'Archive' },
  { id: 'receipt', label: 'Receipt' },
  { id: 'classify', label: 'Keep' },
];

function ruleCountForFilters() {
  return ruleState.rules.filter(
    (rule) => ruleMatchesScopeFilter(rule) && ruleMatchesProcessFilter(rule),
  ).length;
}

function ruleScopeCounts() {
  const counts = { personal: 0, universal: 0 };
  for (const rule of ruleState.rules) {
    counts[ruleScope(rule)] += 1;
  }
  return counts;
}

function ruleProcessCounts() {
  const counts = { delete: 0, archive: 0, receipt: 0, classify: 0 };
  for (const rule of ruleState.rules) {
    counts[ruleProcessValue(rule)] += 1;
  }
  return counts;
}

function ruleFiltersNarrowed() {
  return (
    Boolean(ruleState.search.trim()) ||
    RULE_SCOPE_CHIPS.some((c) => ruleState.scopeOn?.[c.id] === false) ||
    RULE_PROCESS_CHIPS.some((c) => ruleState.processOn?.[c.id] === false)
  );
}

function applyRuleFilters() {
  const visible = filteredRules();
  let cleared = false;
  if (
    ruleState.activeId &&
    !visible.some((r) => String(r.id) === String(ruleState.activeId))
  ) {
    ruleState.activeId = null;
    ruleState.dirty = false;
    getRuleEditor()?.classList.remove('de-pane-active');
    cleared = true;
  }
  refreshRulesSidebarList();
  if (cleared) {
    syncRulesTabUrl();
    renderRulesPane();
  }
}

function renderFilterChipRow({ chips, stateKey, counts, ariaLabel }) {
  const nav = document.createElement('div');
  nav.className = 'em-filter-tabs re-filter-chips';
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', ariaLabel);
  for (const chip of chips) {
    const on = ruleState[stateKey]?.[chip.id] !== false;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `em-filter-tab re-filter-chip${on ? ' is-on' : ' is-off'}`;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.dataset.filter = chip.id;
    const count = counts[chip.id];
    btn.innerHTML =
      `<span class="re-filter-check" aria-hidden="true">${on ? iosIcon('check', 9) : ''}</span>` +
      `<span class="em-filter-tab-label">${escHtml(chip.label)}</span>` +
      (count != null ? `<span class="em-filter-count">${count}</span>` : '');
    btn.addEventListener('click', () => {
      if (!ruleState[stateKey]) ruleState[stateKey] = {};
      const currentlyOn = ruleState[stateKey][chip.id] !== false;
      ruleState[stateKey][chip.id] = !currentlyOn;
      applyRuleFilters();
    });
    nav.appendChild(btn);
  }
  return nav;
}

function renderRuleFilters() {
  const wrap = document.createElement('div');
  wrap.className = 're-rule-filters';
  wrap.append(
    renderFilterChipRow({
      chips: RULE_SCOPE_CHIPS,
      stateKey: 'scopeOn',
      counts: ruleScopeCounts(),
      ariaLabel: 'Rule scope',
    }),
    renderFilterChipRow({
      chips: RULE_PROCESS_CHIPS,
      stateKey: 'processOn',
      counts: ruleProcessCounts(),
      ariaLabel: 'Rule type',
    }),
  );
  return wrap;
}

function syncRuleFilterChips(root = getRuleEditor()) {
  const filters = root?.querySelector('.re-rule-filters');
  if (!filters) return;
  const scopeCounts = ruleScopeCounts();
  const processCounts = ruleProcessCounts();
  filters.querySelectorAll('.re-filter-chip').forEach((btn) => {
    const id = btn.dataset.filter;
    const isScope = RULE_SCOPE_CHIPS.some((c) => c.id === id);
    const on = ruleState[isScope ? 'scopeOn' : 'processOn']?.[id] !== false;
    btn.classList.toggle('is-on', on);
    btn.classList.toggle('is-off', !on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const check = btn.querySelector('.re-filter-check');
    if (check) check.innerHTML = on ? iosIcon('check', 9) : '';
    const countEl = btn.querySelector('.em-filter-count');
    if (countEl) {
      const next = String((isScope ? scopeCounts : processCounts)[id] ?? 0);
      if (countEl.textContent !== next) countEl.textContent = next;
    }
  });
}

function fillRulesSidebarList(list) {
  const { activeId } = ruleState;
  const ordered = filteredRules();
  list.replaceChildren();
  for (const rule of ordered) {
    list.appendChild(createRuleSwipeRow(rule, activeId));
  }
  if (ordered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = ruleFiltersNarrowed() ? 'No matches.' : 'No rules yet.';
    list.appendChild(empty);
  }
}

function refreshRulesSidebarList() {
  const root = getRuleEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderRulesEditor();
    return;
  }
  const n = ruleCountForFilters();
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput instanceof HTMLInputElement) {
    searchInput.placeholder = `Search ${n} ${n === 1 ? 'Rule' : 'Rules'}`;
  }
  syncRuleFilterChips(root);
  fillRulesSidebarList(list);
  syncRulesSidebarActiveState();
}

function syncRulesSidebarActiveState(opts = {}) {
  const { scroll = false } = opts;
  const root = getRuleEditor();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .em-list-item, .ch-sidebar .ch-list-item').forEach((el) => {
    const isActive = el.dataset.id === String(ruleState.activeId);
    el.classList.toggle('active', isActive);
    if (isActive) {
      el.setAttribute('aria-current', 'page');
      activeEl = el;
    } else {
      el.removeAttribute('aria-current');
    }
  });
  if (scroll && activeEl) {
    const list = root.querySelector('.ch-sidebar .ch-list');
    if (list) {
      requestAnimationFrame(() => shell.scrollSidebarListItemIntoView(list, activeEl));
    }
  }
}

function orderedRulesForFlow() {
  return [...ruleState.rules].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function createFlowRuleCard(rule, index) {
  const row = document.createElement('div');
  row.className = `re-flow-row${rule.enabled === false || isRuleExpired(rule) ? ' re-flow-row--off' : ''}${String(ruleState.activeId) === String(rule.id) ? ' re-flow-row--active' : ''}`;
  row.dataset.id = rule.id;
  row.dataset.scope = ruleScope(rule);
  row.setAttribute('aria-label', `Priority ${index + 1}: ${titleFromRulePhrases(rule.phrases, rule.title || rule.status)}`);

  const catalog = isCatalogReadOnly(rule);
  if (catalog) row.dataset.locked = '1';
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 're-flow-grip';
  grip.disabled = catalog;
  grip.title = catalog ? 'Catalog rule order comes from the repo' : 'Drag to reorder priority';
  grip.setAttribute('aria-label', catalog ? 'Catalog order is fixed' : 'Drag to reorder');
  grip.innerHTML = iosIcon('grip', 16);

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 're-flow-row-main';
  openBtn.addEventListener('click', () => openRuleEditor(rule.id));

  const pri = document.createElement('span');
  pri.className = 're-flow-pri';
  pri.textContent = `#${index + 1}`;
  pri.title = 'Evaluation priority — lower number wins first';

  const when = document.createElement('span');
  when.className = 're-flow-node re-flow-node--when';
  when.innerHTML = `
    <span class="re-flow-badge">When</span>
    ${ruleScopePillHtml(rule)}
    <span class="re-flow-title">${escHtml(titleFromRulePhrases(rule.phrases, rule.title || rule.status))}</span>
    <span class="re-flow-sub">${escHtml(flowWhenSubline(rule))}</span>
    <span class="re-flow-meta">${escHtml(`${fieldsSummary(rule.fields)} · ${formatRuleHitLabel(rule)}`)}</span>`;

  const arrow = document.createElement('span');
  arrow.className = 're-flow-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';

  const then = document.createElement('span');
  const processLabel = formatRuleProcessLabel(rule);
  const processKind = ruleProcessValue(rule);
  const thenAlert = !processIsSilentFile(processKind) && ruleNotifyChannels(rule).notify;
  then.className = `re-flow-node re-flow-node--then${thenAlert ? ' re-flow-node--alert' : ' re-flow-node--quiet'}`;
  then.innerHTML = `
    <span class="re-flow-badge">Then</span>
    <span class="re-flow-title">${escHtml(processLabel)}</span>
    <span class="re-flow-sub">${escHtml(`status → ${rule.status || '—'}`)}</span>
    <span class="re-flow-meta">${escHtml(ruleSubline(rule))}</span>`;

  openBtn.append(pri, when, arrow, then);
  row.append(grip, openBtn);
  return row;
}

async function persistFlowRuleOrder(ids) {
  try {
    const res = await fetch('/api/email/rules/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ruleState.rules = data.rules || ruleState.rules;
    renderRulesEditor();
  } catch (e) {
    await osAlert({ title: 'Could not save rule order', bodyHtml: e.message });
    renderRulesEditor();
  }
}

function attachFlowRuleReorder(rowsEl) {
  let dragEl = null;
  let moved = false;
  rowsEl.querySelectorAll('.re-flow-grip').forEach((grip) => {
    grip.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (grip.disabled) return;
      const row = grip.closest('.re-flow-row');
      if (!row || row.dataset.locked === '1') return;
      dragEl = row;
      moved = false;
      row.classList.add('re-flow-row--dragging');
      grip.setPointerCapture(ev.pointerId);

      const onMove = (moveEv) => {
        if (!dragEl) return;
        moved = true;
        insertDragWithinScope(rowsEl, dragEl, moveEv.clientY, ':scope > .re-flow-row');
      };

      const onUp = (upEv) => {
        grip.releasePointerCapture(upEv.pointerId);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        dragEl?.classList.remove('re-flow-row--dragging');
        if (dragEl && moved) {
          const ids = [...rowsEl.querySelectorAll(':scope > .re-flow-row')].map(
            (el) => el.dataset.id,
          );
          void persistFlowRuleOrder(ids.filter(Boolean));
        }
        dragEl = null;
        moved = false;
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}

function renderRulesFlowShell(root) {
  const shellEl = document.createElement('div');
  shellEl.className = 're-flow-shell';

  const toolbar = document.createElement('div');
  toolbar.className = 're-flow-toolbar';

  const left = document.createElement('div');
  left.className = 're-flow-toolbar-left';

  const hint = document.createElement('p');
  hint.className = 're-flow-hint';
  hint.textContent = 'Universal first · drag within each group · tap a rule to edit';
  left.appendChild(hint);
  toolbar.appendChild(left);

  const right = document.createElement('div');
  right.className = 're-flow-toolbar-right';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'dash-panel-btn';
  addBtn.textContent = '+ Rule';
  addBtn.addEventListener('click', () => void startNewRule());
  right.append(addBtn);
  toolbar.appendChild(right);
  shellEl.appendChild(toolbar);

  if (ruleState.storage === 'files') {
    const warn = document.createElement('div');
    warn.className = 're-warn-inline';
    warn.textContent = 'Using local file storage — set DATABASE_URL on Railway for production.';
    shellEl.appendChild(warn);
  }

  const scroll = document.createElement('div');
  scroll.className = 're-flow-scroll';

  const trigger = document.createElement('div');
  trigger.className = 're-flow-trigger';
  trigger.innerHTML = `
    <span class="re-flow-badge">Trigger</span>
    <span class="re-flow-title">Inbound email</span>
    <span class="re-flow-sub">Resend webhook · /api/email/inbound</span>`;
  scroll.appendChild(trigger);

  const spine = document.createElement('div');
  spine.className = 're-flow-spine';
  spine.setAttribute('aria-hidden', 'true');
  spine.textContent = '↓ evaluate in order · drag to reorder';
  scroll.appendChild(spine);

  const rows = document.createElement('div');
  rows.className = 're-flow-rows';
  const ordered = orderedRulesForFlow();
  if (!ordered.length) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = 'No rules yet — create one to see the flow.';
    rows.appendChild(empty);
  } else {
    ordered.forEach((rule, i) => rows.appendChild(createFlowRuleCard(rule, i)));
    attachFlowRuleReorder(rows);
  }
  scroll.appendChild(rows);

  const elseRow = document.createElement('div');
  elseRow.className = 're-flow-else';
  elseRow.innerHTML = `
    <span class="re-flow-node re-flow-node--when re-flow-node--else">
      <span class="re-flow-badge">Else</span>
      <span class="re-flow-title">Inbox</span>
      <span class="re-flow-sub">No match → stay in inbox</span>
    </span>
    <span class="re-flow-arrow" aria-hidden="true">→</span>
    <span class="re-flow-node re-flow-node--then">
      <span class="re-flow-badge">Then</span>
      <span class="re-flow-title">Review later</span>
      <span class="re-flow-sub">Teach from dashboard if it should become a rule</span>
    </span>`;
  scroll.appendChild(elseRow);
  shellEl.appendChild(scroll);
  root.appendChild(shellEl);
}

function renderRulesEditor() {
  const root = getRuleEditor();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll?.(root);
  root.innerHTML = '';
  root.classList.remove('re-view-flow', 're-view-lab', 're-view-list', 'de-drawer-host');
  root.classList.toggle('de-pane-active', Boolean(ruleState.activeId));

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const countForTab = ruleCountForFilters();
  const subheader = listSearchSubheader({
    itemCount: countForTab,
    search: {
      value: ruleState.search,
      placeholder: `Search ${countForTab} ${countForTab === 1 ? 'Rule' : 'Rules'}`,
      onInput: (value) => {
        ruleState.search = value;
        refreshRulesSidebarList();
      },
    },
    below: renderRuleFilters(),
  });
  if (subheader) sidebar.appendChild(subheader.el);

  if (ruleState.storage === 'files') {
    const warn = document.createElement('div');
    warn.className = 're-warn-inline';
    warn.textContent = 'Using local file storage — set DATABASE_URL on Railway for production.';
    sidebar.appendChild(warn);
  }

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  bindListMultiSelect(list, { onBulkDelete: bulkDeleteRules });
  fillRulesSidebarList(list);
  attachIosPullToRefresh(list, () => loadRulesTab());
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  root.appendChild(pane);
  renderRulesPane();
  shell.finishSidebarListScroll?.(root, savedSidebarScroll);
  scanPanelSidebars?.();
}

function ruleEditorBack() {
  return {
    label: ruleState.returnToEmailId ? 'Back to email' : 'Back to rules',
    onClick: () => void closeRuleEditor(),
  };
}

function renderMissingRulePane(pane) {
  pane.appendChild(
    createPaneHeader({
      back: ruleEditorBack(),
      title: ruleState.missingTitle || 'Rule not found',
      subtitle: 'This classification still cites this rule, but it is not in the current list.',
    }).root,
  );
}

function renderRulesPane() {
  const root = getRuleEditor();
  if (!root) return;
  const pane = root.querySelector('.de-pane');
  if (!pane) {
    renderRulesEditor();
    return;
  }
  pane.innerHTML = '';
  if (ruleState.activeId) {
    root.classList.add('de-pane-active');
    const rule = ruleState.rules.find((r) => String(r.id) === String(ruleState.activeId));
    if (!rule) renderMissingRulePane(pane);
    else renderRuleEditPane(pane);
  } else {
    root.classList.remove('de-pane-active');
    shell.clearEditorFooterSave();
    shell.appendEmptyDetailPane(pane, {
      mapKey: 'rules',
      iconName: 'flask',
      bodyHtml: '<p>Select a rule to edit, or create a new one.</p>',
      onCreate: () => void startNewRule(),
    });
  }
  flushTitleFocus('rules');
}

async function leaveRuleIfSaved() {
  const ok = await flushRuleAutosave();
  if (ok) return true;
  await osAlert({
    title: 'Couldn’t save this rule',
    bodyHtml: ruleAutosaveError || 'Check the highlighted fields.',
  });
  return false;
}

async function openRuleEditor(id) {
  if (
    String(id) === String(ruleState.activeId) &&
    getRuleEditor()?.querySelector('.de-pane .re-form-scroll')
  ) {
    syncRulesTabUrl();
    return;
  }
  if (!(await leaveRuleIfSaved())) return;
  const resolved = resolveLabRuleId(id) || id;
  ruleState.activeId = resolved;
  ruleState.dirty = false;
  const selected = ruleState.rules.find((r) => String(r.id) === String(resolved));
  revealRuleInFilters(selected);
  shell.clearEditorFooterSave();
  const root = getRuleEditor();
  if (!root?.querySelector('.ch-sidebar')) {
    renderRulesEditor();
    syncRulesTabUrl();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput instanceof HTMLInputElement) searchInput.value = ruleState.search;
  refreshRulesSidebarList();
  syncRulesSidebarActiveState({ scroll: true });
  renderRulesPane();
  syncRulesTabUrl();
}

async function closeRuleEditor() {
  await flushRuleAutosave();
  const returnEmailId = String(ruleState.returnToEmailId || '').trim();
  ruleAutosaveFlush = null;
  ruleState.activeId = null;
  ruleState.dirty = false;
  ruleState.missingTitle = '';
  ruleState.returnToEmailId = null;
  shell.clearEditorFooterSave();
  getRuleEditor()?.classList.remove('de-pane-active');
  syncRulesSidebarActiveState();
  if (returnEmailId && typeof shell.navigateToEmail === 'function') {
    shell.navigateToEmail(returnEmailId);
    return;
  }
  syncRulesTabUrl();
  renderRulesPane();
}

function renderRuleEditPane(pane, opts = {}) {
  const accordion = opts.accordion === true;
  ruleState.dirty = false;
  let headerTitleEl = null;
  const rule = ruleState.rules.find((r) => r.id === ruleState.activeId);
  if (!rule) {
    pane.innerHTML = '<div class="de-loading de-error">Rule not found.</div>';
    return;
  }

  if (accordion) {
    const actions = document.createElement('div');
    actions.className = 're-lab-rule-actions';
    const hits = document.createElement('span');
    hits.className = 're-lab-rule-hits';
    hits.textContent = ruleHitsSubline(rule) || (isCatalogReadOnly(rule) ? 'Catalog rule' : 'Edit rule');
    if (canDeleteRule(rule)) {
      actions.append(hits, paneDeleteIcon({
        label: 'Delete rule',
        onClick: () => deleteRule(rule.id),
      }));
    } else {
      actions.append(hits);
    }
    pane.appendChild(actions);
  } else {
    const inDrawer = shell.isCreateDrawerOpen('rules');
    const header = createPaneHeader({
      back: inDrawer ? null : ruleEditorBack(),
      title: titleFromRulePhrases(rule.phrases, rule.title || rule.status || 'Rule'),
      subtitle: ruleHitsSubline(rule),
      icons: inDrawer || !canDeleteRule(rule)
        ? []
        : [
            paneDeleteIcon({
              label: 'Delete rule',
              onClick: () => deleteRule(rule.id),
            }),
          ],
    });
    headerTitleEl = header.root.querySelector('.de-doc-name');
    pane.appendChild(header.root);
  }

  const form = document.createElement('div');
  form.className = accordion ? 're-form-scroll re-lab-rule-form' : 're-form-scroll';

  const matchChipSeed = chipsFromRulePhrases(rule.phrases, rule.fields);
  const exceptChipSeed = chipsFromRulePhrases(rule.exceptPhrases, rule.fields);
  const chipPair = createChipPair({
    targets: matchChipSeed,
    exemptions: exceptChipSeed,
    targetField: (rule.fields || []).length === 1 ? rule.fields[0] : matchChipSeed.at(-1)?.field || 'subject',
    exemptField: (rule.fields || []).length === 1 ? rule.fields[0] : exceptChipSeed.at(-1)?.field || 'subject',
    disabled: isCatalogReadOnly(rule),
  });
  const matchChips = chipPair.targets;
  const exceptChips = chipPair.exemptions;

  const scopeIn = document.createElement('input');
  scopeIn.type = 'hidden';
  scopeIn.value = ruleScope(rule);
  const scopeWrap = document.createElement('div');
  scopeWrap.className = 're-scope-field';
  if (canManageUniversalRules()) {
    const scopePill = createSlidingPillSelect({
      label: 'Applies to',
      value: scopeIn.value,
      options: [
        { value: 'personal', label: 'Personal' },
        { value: 'universal', label: 'Universal' },
      ],
      ariaLabel: 'Applies to',
      scrollable: false,
      onChange: (value) => {
        scopeIn.value = value;
        scopeIn.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
    scopeWrap.append(scopePill.el, scopeIn);
  }

  const statusIn = document.createElement('input');
  statusIn.type = 'hidden';
  statusIn.value = rule.status || 'CUSTOM';

  const descIn = document.createElement('textarea');
  descIn.className = 're-textarea';
  descIn.rows = 2;
  descIn.value = rule.description || '';

  const matchModeIn = document.createElement('input');
  matchModeIn.type = 'hidden';
  matchModeIn.value = rule.matchMode === 'all' ? 'all' : 'any';

  const processSel = document.createElement('input');
  processSel.type = 'hidden';
  processSel.value = ruleProcessValue(rule);
  let processPill = null;

  const notifyChannelsWrap = document.createElement('div');
  notifyChannelsWrap.className = 're-toggle-stack';
  const channels = ruleNotifyChannels(rule);
  const pushToggle = createRuleToggle({
    checked: channels.push,
    label: 'Push notifications',
    onToggle: () => syncNotifyActionsEnabled(),
  });
  const dashToggle = createRuleToggle({
    checked: channels.dashboard,
    label: 'Dashboard notifications',
    onToggle: () => syncNotifyActionsEnabled(),
  });
  notifyChannelsWrap.append(
    createRuleToggleRow('Push', pushToggle),
    createRuleToggleRow('Dashboard', dashToggle),
  );

  const notifyActionsWrap = document.createElement('div');
  notifyActionsWrap.className = 're-toggle-stack';
  const selectedActions = new Set(ruleNotifyActions(rule));
  const actionDefs = [
    ['view', 'View'],
    ['archive', 'Archive'],
    ['delete', 'Delete'],
    ['copy', 'Copy code'],
    ['activate', 'Activate'],
    ['explain', 'Explain'],
    ['expense', 'Expense'],
    ['rules', 'Email Lab'],
  ];
  const actionToggles = [];
  for (const [val, lab] of actionDefs) {
    const toggle = createRuleToggle({
      checked: selectedActions.has(val),
      label: lab,
    });
    toggle.dataset.notifyAction = val;
    actionToggles.push(toggle);
    notifyActionsWrap.appendChild(
      createRuleToggleRow(lab, toggle, { iconKey: NOTICE_ACTION_ICONS[val] }),
    );
  }
  const syncNotifyActionsEnabled = () => {
    const process = processSel.value;
    const isDelete = process === 'delete';
    const silent = processIsSilentFile(process);
    const on = !silent && (ruleToggleOn(pushToggle) || ruleToggleOn(dashToggle));
    actionToggles.forEach((btn) => {
      btn.disabled = !on;
    });
    if (createProjectRow) createProjectRow.hidden = isDelete;
    if (expiresWrap) expiresWrap.hidden = isDelete;
    if (notifyField) notifyField.wrap.hidden = silent || isDelete;
    if (actionsField) actionsField.wrap.hidden = !on || isDelete;
  };

  let notifyField = null;
  let actionsField = null;
  let processField = null;

  const syncProcessUi = ({ fromStatus } = {}) => {
    const process = processSel.value;
    if (!fromStatus) {
      statusIn.value = statusForProcess(process, statusIn.value);
    }
    if (processIsSilentFile(process)) {
      setToggleSwitch(pushToggle, false);
      setToggleSwitch(dashToggle, false);
    }
    if (processField?.hintEl) processField.hintEl.textContent = processHintText(process);
    syncNotifyActionsEnabled();
  };

  processSel.addEventListener('change', () => {
    syncProcessUi();
  });

  processPill = createSlidingPillSelect({
    label: 'Email processing action',
    value: processSel.value,
    options: RULE_PROCESS_OPTIONS,
    ariaLabel: 'Email processing action',
    scrollable: false,
    onChange: (value) => {
      processSel.value = value;
      processSel.dispatchEvent(new Event('change', { bubbles: true }));
    },
  });

  const forwardIn = document.createElement('input');
  forwardIn.className = 'de-input';
  forwardIn.type = 'email';
  forwardIn.autocomplete = 'off';
  forwardIn.placeholder = 'e.g. teammate@company.com (optional)';
  forwardIn.value = rule.forwardTo || '';

  const createProjectToggle = createRuleToggle({
    checked: rule.createProject === true,
    label: 'Also create a project',
  });
  const createProjectRow = createRuleToggleRow('Also create a project', createProjectToggle);
  const forwardWrap = document.createElement('div');
  forwardWrap.className = 're-forward-field';
  forwardWrap.append(forwardIn, createProjectRow);

  const expiresAtIn = document.createElement('input');
  expiresAtIn.className = 'de-input';
  expiresAtIn.type = 'datetime-local';
  expiresAtIn.value = toRuleDatetimeLocalValue(rule.expiresAt);
  expiresAtIn.setAttribute('aria-label', 'Expiration date and time');

  const expireInSecs = document.createElement('input');
  expireInSecs.className = 'de-input re-expire-in-secs';
  expireInSecs.type = 'text';
  expireInSecs.inputMode = 'numeric';
  expireInSecs.autocomplete = 'off';
  expireInSecs.placeholder = '300';
  expireInSecs.value = '300';
  expireInSecs.setAttribute('aria-label', 'Seconds until this rule expires');

  const expireInReveal = document.createElement('div');
  expireInReveal.className = 're-toggle-reveal re-expire-in-reveal';
  expireInReveal.append(expireInSecs, document.createTextNode(' seconds'));

  const expiresAtReveal = document.createElement('div');
  expiresAtReveal.className = 're-toggle-reveal';
  expiresAtReveal.appendChild(expiresAtIn);

  const expiresToggle = createRuleToggle({
    checked: !!rule.expiresAt,
    label: 'Expires on',
    onToggle: (on) => {
      if (on && ruleToggleOn(expireInToggle)) setToggleSwitch(expireInToggle, false);
      if (on && !expiresAtIn.value) expiresAtIn.value = defaultRuleExpiresLocalValue();
      syncExpireUi();
    },
  });
  const expireInToggle = createRuleToggle({
    checked: false,
    label: 'Expire in',
    onToggle: (on) => {
      if (on && ruleToggleOn(expiresToggle)) setToggleSwitch(expiresToggle, false);
      if (on && (!expireInSecs.value || Number(expireInSecs.value) < 1)) expireInSecs.value = '300';
      syncExpireUi();
    },
  });

  const syncExpireUi = () => {
    const absOn = ruleToggleOn(expiresToggle);
    const relOn = ruleToggleOn(expireInToggle);
    expiresAtReveal.hidden = !absOn;
    expireInReveal.hidden = !relOn;
    expiresAtIn.disabled = !absOn;
    expireInSecs.disabled = !relOn;
  };
  syncExpireUi();

  const expiresWrap = document.createElement('div');
  expiresWrap.className = 're-expires-field';
  expiresWrap.append(
    createRuleToggleRow('Expires on', expiresToggle, { iconKey: 'clock' }),
    expiresAtReveal,
    createRuleToggleRow('Expire in', expireInToggle, { iconKey: 'stopwatch' }),
    expireInReveal,
  );

  appendRuleField(form, 'Description', descIn);
  const top = document.createElement('div');
  top.className = 're-rule-top';
  if (scopeWrap.childNodes.length) {
    top.appendChild(scopeWrap);
  }
  const processFieldWrap = document.createElement('div');
  processFieldWrap.className = 're-process-field';
  const processHint = document.createElement('span');
  processHint.className = 're-field-hint';
  processHint.textContent = processHintText(processSel.value);
  processFieldWrap.append(processPill.el, processHint, processSel);
  top.append(processFieldWrap, statusIn);
  form.appendChild(top);
  processField = { wrap: processFieldWrap, hintEl: processHint };
  form.appendChild(chipPair.el);
  appendRuleField(form, 'Forward to', forwardWrap);
  notifyField = appendRuleField(
    form,
    'Notify',
    notifyChannelsWrap,
    'Optional alert. Off = silent. Does not delete or archive the email.',
    { as: 'div' },
  );
  actionsField = appendRuleField(
    form,
    'Notification buttons',
    notifyActionsWrap,
    'Buttons on the Push/Dashboard alert only — they do not process the email.',
    { as: 'div' },
  );
  form.appendChild(expiresWrap);
  syncProcessUi({ fromStatus: true });
  pane.appendChild(form);

  const ruleInputs = {
    matchChips,
    exceptChips,
    matchModeIn,
    scopeIn,
    scopeWrap,
    statusIn,
    processSel,
    descIn,
    originalFields: Array.isArray(rule.fields) && rule.fields.length ? rule.fields : ['subject', 'body'],
    pushToggle,
    dashToggle,
    notifyActionsWrap,
    forwardIn,
    createProjectToggle,
    expiresToggle,
    expiresAtIn,
    expireInToggle,
    expireInSecs,
    syncExpireUi,
    headerTitleEl,
  };
  const inDrawer = !accordion && shell.isCreateDrawerOpen('rules');
  if (isCatalogReadOnly(rule)) {
    ruleAutosaveFlush = null;
    form.classList.add('re-lab-rule-form--catalog');
    form.querySelectorAll('input, textarea, select, button').forEach((el) => {
      el.disabled = true;
    });
  } else {
    bindRuleAutosave(rule, ruleInputs, { defer: inDrawer });
    if (!(rule.phrases || []).length) matchChips.focusDraft();
  }
  shell.clearEditorFooterSave();
}

function collectRulePayload(inputs) {
  inputs.matchChips?.commitDraft?.();
  inputs.exceptChips?.commitDraft?.();
  const matchChips = inputs.matchChips?.getChips?.() || [];
  const exceptChips = inputs.exceptChips?.getChips?.() || [];
  const phrases = phrasesFromChips(matchChips);
  const exceptPhrases = phrasesFromChips(exceptChips);
  const fields = fieldsFromChips(matchChips, inputs.originalFields);
  const notifyActions = [];
  inputs.notifyActionsWrap.querySelectorAll('[data-notify-action]').forEach((btn) => {
    if (ruleToggleOn(btn)) notifyActions.push(btn.dataset.notifyAction);
  });
  const process = inputs.processSel?.value || ruleProcessValue(inputs.statusIn.value);
  const isDelete = process === 'delete';
  const notifyPush = !isDelete && ruleToggleOn(inputs.pushToggle);
  const notifyDashboard = !isDelete && ruleToggleOn(inputs.dashToggle);
  const scope = inputs.scopeIn?.value === 'universal' ? 'universal' : 'personal';
  let expiresAt = null;
  if (!isDelete && ruleToggleOn(inputs.expireInToggle)) {
    const secs = Math.floor(Number(inputs.expireInSecs?.value));
    if (Number.isFinite(secs) && secs > 0) {
      expiresAt = new Date(Date.now() + secs * 1000).toISOString();
    }
  } else if (!isDelete && ruleToggleOn(inputs.expiresToggle)) {
    expiresAt = fromRuleDatetimeLocalValue(inputs.expiresAtIn.value);
  }
  return {
    title: titleFromRulePhrases(phrases),
    scope,
    status: statusForProcess(process, inputs.statusIn.value.trim()),
    description: inputs.descIn.value.trim(),
    phrases,
    exceptPhrases,
    matchMode: inputs.matchModeIn?.value === 'all' ? 'all' : 'any',
    fields,
    notify: notifyPush || notifyDashboard,
    notifyPush,
    notifyDashboard,
    notifyActions: isDelete ? [] : notifyActions,
    enabled: true,
    forwardTo: inputs.forwardIn.value.trim() || null,
    createProject: !isDelete && ruleToggleOn(inputs.createProjectToggle),
    expiresAt,
  };
}

function serializeRulePayload(payload) {
  return JSON.stringify(payload);
}

function syncRuleListItem(id, payload, savedRule) {
  const rule = ruleState.rules.find((r) => r.id === id);
  if (rule) Object.assign(rule, payload, savedRule || {});
  const root = getRuleEditor();
  const item = root?.querySelector(
    `.em-list-item[data-id="${CSS.escape(id)}"], .ch-list-item[data-id="${CSS.escape(id)}"]`,
  );
  if (item && rule) {
    item.innerHTML = ruleListItemInnerHtml(rule);
    item.classList.toggle('re-list-disabled', rule.enabled === false || isRuleExpired(rule));
  }
  const card = root?.querySelector(
    `.re-lab-pipe-card--rule[data-rule-id="${CSS.escape(String(id))}"]`,
  );
  if (card && rule) {
    const title = card.querySelector('.re-lab-pipe-title');
    const sub = card.querySelector('.re-lab-pipe-sub');
    const whenClause = formatRuleWhenClause(rule);
    if (title) title.textContent = whenClause;
    if (sub) sub.textContent = formatRuleLabMeta(rule);
    const toggle = card.querySelector('.re-lab-pipe-card-toggle');
    const pri = card.querySelector('.re-lab-pri')?.textContent || '';
    if (toggle) toggle.setAttribute('aria-label', `${pri}: ${whenClause}`.replace(/^#/, 'Priority '));
  }
}

function bindRuleAutosave(rule, inputs, opts = {}) {
  let baseline = serializeRulePayload(collectRulePayload(inputs));
  let activeEl = null;
  let savingLock = Promise.resolve();

  const allFields = () => [
    inputs.matchChips?.probe,
    inputs.exceptChips?.probe,
    inputs.scopeIn,
    ...(inputs.processSel ? [inputs.processSel] : []),
    inputs.descIn,
    inputs.pushToggle,
    inputs.dashToggle,
    ...inputs.notifyActionsWrap.querySelectorAll('[data-notify-action]'),
    inputs.forwardIn,
    inputs.createProjectToggle,
    inputs.expiresToggle,
    inputs.expiresAtIn,
    inputs.expireInToggle,
    inputs.expireInSecs,
  ].filter(Boolean);

  const flush = async () => {
    const previous = savingLock;
    let release = () => {};
    savingLock = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await runFlush();
    } finally {
      release();
    }
  };

  const runFlush = async () => {
    clearTimeout(ruleAutosaveTimer);
    ruleAutosaveTimer = null;

    let payload;
    try {
      payload = collectRulePayload(inputs);
    } catch (e) {
      console.warn('[rules] collect payload failed', e);
      ruleAutosaveError = e instanceof Error ? e.message : 'Could not read the form.';
      if (activeEl) shell.setFormFieldState(activeEl, 'invalid');
      return false;
    }
    const current = serializeRulePayload(payload);
    if (current === baseline) {
      ruleState.dirty = false;
      ruleAutosaveError = '';
      return true;
    }
    if (!payload.status) {
      ruleAutosaveError = 'Status is required.';
      if (activeEl) shell.setFormFieldState(activeEl, 'invalid');
      return false;
    }
    const process = inputs.processSel?.value || '';
    if (process !== 'delete' && ruleToggleOn(inputs.expireInToggle)) {
      const secs = Math.floor(Number(inputs.expireInSecs?.value));
      if (!Number.isFinite(secs) || secs < 1 || !payload.expiresAt) {
        ruleAutosaveError = 'Enter a valid expire-in time.';
        shell.setFormFieldState(inputs.expireInSecs, 'invalid');
        return false;
      }
    } else if (process !== 'delete' && ruleToggleOn(inputs.expiresToggle) && !payload.expiresAt) {
      ruleAutosaveError = 'Enter an expiration date.';
      shell.setFormFieldState(inputs.expiresAtIn, 'invalid');
      return false;
    }

    if (activeEl) shell.setFormFieldState(activeEl, 'saving');
    let ok = false;

    try {
      const res = await fetch(`/api/email/rules/${encodeURIComponent(rule.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Relative TTL is write-time only — switch to absolute so autosave doesn't keep extending.
      if (ruleToggleOn(inputs.expireInToggle) && data.rule?.expiresAt) {
        setToggleSwitch(inputs.expireInToggle, false);
        setToggleSwitch(inputs.expiresToggle, true);
        inputs.expiresAtIn.value = toRuleDatetimeLocalValue(data.rule.expiresAt);
        payload.expiresAt = data.rule.expiresAt;
        inputs.syncExpireUi?.();
      }
      baseline = serializeRulePayload(payload);
      ruleState.dirty = false;
      ruleAutosaveError = '';
      syncRuleListItem(rule.id, payload, data.rule);
      if (inputs.headerTitleEl) {
        inputs.headerTitleEl.textContent = data.rule?.title || payload.title;
      }
      if (activeEl) shell.flashFormFieldSaved(activeEl);
      ok = true;
    } catch (e) {
      console.warn('[rules] autosave failed', e);
      ruleAutosaveError = e instanceof Error ? e.message : 'Save failed.';
      if (activeEl) shell.setFormFieldState(activeEl, 'invalid');
      ok = false;
    } finally {
      if (
        activeEl &&
        !activeEl.classList.contains(shell.FORM_FIELD_SAVED) &&
        !activeEl.classList.contains(shell.FORM_FIELD_INVALID)
      ) {
        shell.setFormFieldState(activeEl, null);
      }
    }
    return ok;
  };

  const schedule = (el) => {
    activeEl = el;
    try {
      ruleState.dirty = serializeRulePayload(collectRulePayload(inputs)) !== baseline;
    } catch {
      return;
    }
    shell.setFormFieldState(el, null);
    clearTimeout(ruleAutosaveTimer);
    ruleAutosaveTimer = setTimeout(flush, shell.AUTOSAVE_DEBOUNCE_MS);
  };

  ruleAutosaveFlush = flush;
  if (opts.defer) return;

  for (const el of allFields()) {
    const handler = () => schedule(el);
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
    el.addEventListener('blur', () => {
      activeEl = el;
      const payload = collectRulePayload(inputs);
      clearTimeout(ruleAutosaveTimer);
      void flush();
    });
    el.addEventListener('focus', () => {
      if (!el.classList.contains(shell.FORM_FIELD_INVALID)) shell.setFormFieldState(el, null);
    });
  }
}

async function flushRuleAutosave() {
  if (ruleAutosaveTimer) {
    clearTimeout(ruleAutosaveTimer);
    ruleAutosaveTimer = null;
  }
  if (typeof ruleAutosaveFlush === 'function') {
    return (await ruleAutosaveFlush()) !== false;
  }
  // No live form — leftover dirty is a false positive (teardown blur / catalog).
  ruleState.dirty = false;
  ruleAutosaveError = '';
  return true;
}

async function saveRule(id, inputs) {
  const payload = collectRulePayload(inputs);
  if (!payload.status) {
    alert('Status is required.');
    return;
  }
  if (inputs.saveBtn) {
    inputs.saveBtn.disabled = true;
    inputs.saveBtn.textContent = 'Saving…';
  }
  try {
    const res = await fetch(`/api/email/rules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ruleState.dirty = false;
    await loadRulesTab();
    openRuleEditor(id);
  } catch (e) {
    if (inputs.saveBtn) {
      inputs.saveBtn.textContent = 'Save';
      inputs.saveBtn.disabled = false;
    }
    alert(`Save failed: ${e.message}`);
  }
}

function removeRulesLocally(ids) {
  const idSet = new Set(ids.map(String));
  ruleState.rules = ruleState.rules.filter((r) => !idSet.has(String(r.id)));
  if (ruleState.activeId != null && idSet.has(String(ruleState.activeId))) {
    ruleState.dirty = false;
    ruleState.activeId = null;
    getRuleEditor()?.classList.remove('de-pane-active');
    syncRulesTabUrl();
  }
  renderRulesEditor();
}

function restoreRulesLocally(snapshots, { restoreId = null } = {}) {
  const have = new Set(ruleState.rules.map((r) => String(r.id)));
  const next = ruleState.rules.slice();
  for (const snap of snapshots) {
    if (have.has(String(snap.rule.id))) continue;
    next.splice(Math.min(snap.idx, next.length), 0, snap.rule);
    have.add(String(snap.rule.id));
  }
  ruleState.rules = next;
  renderRulesEditor();
  if (restoreId != null) void openRuleEditor(restoreId);
}

async function bulkDeleteRules(ids) {
  if (!ids.length) return;
  closeOpenSwipeRow();
  const unique = [...new Set(ids.filter((id) => id != null))];
  const snapshots = unique
    .map((id) => {
      const idx = ruleState.rules.findIndex((r) => String(r.id) === String(id));
      return idx === -1 ? null : { idx, rule: ruleState.rules[idx] };
    })
    .filter(Boolean);
  if (!snapshots.length) return;
  await queueUndoableDelete({
    key: `delete:rules:${unique.join(',')}`,
    ids: unique.map((id) => `rule:${id}`),
    hide: () => removeRulesLocally(unique),
    restore: () => restoreRulesLocally(snapshots),
    commit: async () => {
      for (const id of unique) {
        try {
          const res = await fetch(`/api/email/rules/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          if (!res.ok) continue;
        } catch {
          /* continue */
        }
      }
    },
  });
}

async function deleteRule(id) {
  const idx = ruleState.rules.findIndex((r) => String(r.id) === String(id));
  const rule = idx === -1 ? null : ruleState.rules[idx];
  if (!rule) return;
  const wasActive = String(ruleState.activeId) === String(id);
  await queueUndoableDelete({
    key: `delete:rule:${id}`,
    ids: [`rule:${id}`],
    hide: () => removeRulesLocally([id]),
    restore: () => restoreRulesLocally([{ idx, rule }], { restoreId: wasActive ? id : null }),
    commit: async () => {
      const res = await fetch(`/api/email/rules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onCommitError: (e) => {
      alert(`Delete failed: ${e.message}`);
    },
  });
}

async function startNewRule(draft = null) {
  const fromLab = Boolean(draft && typeof draft === 'object');
  if (!(await leaveRuleIfSaved())) {
    return null;
  }
  const phrases = fromLab
    ? (Array.isArray(draft.phrases) ? draft.phrases : [])
        .map((p) => String(p || '').trim())
        .filter(Boolean)
    : [];
  const payload = fromLab
    ? {
        title: titleFromRulePhrases(phrases, String(draft.title || '').trim() || 'New rule'),
        status: String(draft.status || 'CUSTOM').trim() || 'CUSTOM',
        scope: draft.scope === 'universal' ? 'universal' : 'personal',
        description: String(draft.description || ''),
        phrases,
        exceptPhrases: Array.isArray(draft.exceptPhrases) ? draft.exceptPhrases : [],
        matchMode: draft.matchMode === 'all' ? 'all' : 'any',
        fields: Array.isArray(draft.fields) && draft.fields.length ? draft.fields : ['body'],
        notify: draft.notify === true,
        notifyPush: draft.notifyPush === true,
        notifyDashboard: draft.notifyDashboard === true,
        notifyActions: Array.isArray(draft.notifyActions) && draft.notifyActions.length
          ? draft.notifyActions
          : ['view', 'archive'],
        enabled: draft.enabled !== false,
        expiresAt: draft.expiresAt ?? null,
        createProject: draft.createProject === true,
      }
    : {
        title: 'New rule',
        status: 'CUSTOM',
        scope: 'personal',
        description: '',
        phrases: [],
        exceptPhrases: [],
        matchMode: 'any',
        fields: ['subject', 'body'],
        notify: true,
        notifyPush: true,
        notifyDashboard: true,
        notifyActions: ['view', 'archive'],
        enabled: true,
        expiresAt: null,
        createProject: false,
      };
  try {
    const res = await fetch('/api/email/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      if (data.colliding && typeof data.colliding === 'object') err.colliding = data.colliding;
      throw err;
    }
    ruleState.activeId = data.rule.id;
    ruleState.dirty = false;
    await loadRulesTab();
    return data.rule;
  } catch (e) {
    if (fromLab) throw e;
    await showKeywordCollisionAlert(e);
    return null;
  }
}

function collidingRuleFromError(err) {
  const hit = err?.colliding;
  if (!hit || typeof hit !== 'object') return null;
  const id = String(hit.id || '').trim();
  if (!id) return null;
  return {
    id,
    title: String(hit.title || '').trim(),
    phrases: Array.isArray(hit.phrases) ? hit.phrases.map((p) => String(p || '')).filter(Boolean) : [],
  };
}

function keywordCollisionBodyHtml(err) {
  const hit = collidingRuleFromError(err);
  const fallback = escHtml(err?.message || String(err || 'Could not create rule'));
  if (!hit) return `<p>${fallback}</p>`;
  const label = hit.title || 'another rule';
  const shown = hit.phrases.slice(0, 6).join(', ');
  const extra = hit.phrases.length > 6 ? ` (+${hit.phrases.length - 6} more)` : '';
  const detail = shown ? ` (${escHtml(shown)}${escHtml(extra)})` : '';
  return (
    `<p>Keywords already used by “<a class="os-dialog-link" href="/admin/?tab=rules&rule=${encodeURIComponent(hit.id)}" data-em-open-rule="${escHtml(hit.id)}">${escHtml(label)}</a>”${detail}. Edit that rule instead of creating another.</p>`
  );
}

async function showKeywordCollisionAlert(err, opts = {}) {
  const hit = collidingRuleFromError(err);
  await osAlert({
    title: opts.title || 'Could not create rule',
    bodyHtml: keywordCollisionBodyHtml(err),
    onOpen: hit
      ? ({ bodyEl, finish }) => {
          const link = bodyEl.querySelector('[data-em-open-rule]');
          if (!link) return;
          link.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            finish(true);
            const open = opts.onOpenRule || ((id) => openRulesLabWithRule(id));
            void open(hit.id);
          });
        }
      : undefined,
  });
}

/**
 * Open Rules from an inbox record (notification / teach-from-email deep link).
 * Selects the matched rule when known; otherwise seeds search from the subject.
 * @param {object} emailRecord
 */
function rememberRuleReturnEmail(emailOrId) {
  const id =
    typeof emailOrId === 'string'
      ? emailOrId.trim()
      : String(emailOrId?.id || '').trim();
  ruleState.returnToEmailId = id || null;
}

async function openRulesLabWithEmail(emailRecord) {
  if (!emailRecord || typeof emailRecord !== 'object') return;
  rememberRuleReturnEmail(emailRecord);
  const matchedId = String(emailRecord.matchedRuleId || '').trim();
  if (matchedId) ruleState.activeId = matchedId;
  else {
    const subject = String(emailRecord.subject || '').trim();
    if (subject) ruleState.search = subject.slice(0, 80);
  }
  shell.setActiveMap?.('rules', { force: true, ruleId: matchedId || undefined });
  await loadRulesTab({ ruleId: matchedId || undefined });
  if (matchedId) await openRuleEditor(matchedId);
}

function resolveLabRuleId(ruleId) {
  const id = String(ruleId || '').trim();
  if (id && ruleState.rules.some((r) => String(r.id) === id)) return id;
  return '';
}

/** Open Rules and select the rule the inbox classification landed on. */
async function openRulesLabWithRule(ruleId, opts = {}) {
  const requested = String(ruleId || '').trim();
  rememberRuleReturnEmail(opts.email || opts.fromEmailId);
  if (requested) ruleState.activeId = requested;
  ruleState.missingTitle = String(opts.ruleTitle || opts.email?.matchedRuleTitle || '').trim();
  shell.setActiveMap?.('rules', { force: true, ruleId: requested || undefined });
  await loadRulesTab({ ruleId: requested || undefined });
  const id = resolveLabRuleId(requested);
  ruleState.activeId = id || requested || null;
  if (!id) {
    renderRulesPane();
    syncRulesTabUrl();
    return;
  }
  await openRuleEditor(id);
}

export {
  ruleState,
  loadRulesTab,
  getRuleEditor,
  isRuleExpired,
  formatRuleExpiresLabel,
  toRuleDatetimeLocalValue,
  ruleSubline,
  formatRuleHitLabel,
  startNewRule,
  showKeywordCollisionAlert,
  openRulesLabWithEmail,
  openRulesLabWithRule,
};
