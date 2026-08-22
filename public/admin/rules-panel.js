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
  createEditableHeaderTitleInput,
  wrapEditableHeaderTitle,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
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
  createAgentBtn,
} from './admin-ui.js?v=20260812a';
import { createPaneHeader } from './pane-header.js?v=20260821c';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, mountPanelSkeleton, showPersonal } from './shared.js?v=20260810a';
import { osAlert, openOsDialogBackdrop, closeOsDialogBackdrop } from './os-dialog.js?v=20260815a';
import {
  createEmailTriageLab,
  formatRuleWhenClause,
  formatRuleLabMeta,
  formatRuleProcessLabel,
} from './email-triage-lab.js?v=20260822a';
import { NOTICE_ACTION_ICONS } from './admin-notice.js?v=20260812e';

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
  /** @type {'all' | 'universal' | 'personal'} */
  scopeFilter: 'all',
  activeId: null,
  dirty: false,
  /** Live tester (left filter) + accordion rule editor (right). */
  view: 'flow',
};

/** @type {ReturnType<typeof createEmailTriageLab> | null} */
let triageLab = null;

let ruleAutosaveTimer = null;
/** @type {null | (() => Promise<boolean>)} */
let ruleAutosaveFlush = null;
let ruleAutosaveError = '';

function getTriageLab() {
  if (!triageLab) {
    triageLab = createEmailTriageLab({
      getRuleState: () => ruleState,
      getRuleEditor,
      reloadRules: async () => {
        const res = await fetch('/api/email/rules', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        ruleState.rules = data.rules || [];
        ruleState.notifyOnUnmatched = !!data.notifyOnUnmatched;
        ruleState.storage = data.storage || 'files';
      },
      toggleRuleEditor: (id) => openRuleEditor(id),
      renderRuleForm: (container) => renderRuleEditPane(container, { accordion: true }),
      getActiveRuleId: () => ruleState.activeId,
      flushRuleAutosave: () => flushRuleAutosave(),
      inboundAddressExample: () =>
        String(shell.companyBrand?.()?.inboundEmailExample || '').trim() ||
        'inbox@inbound.example.com',
    });
  }
  return triageLab;
}

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
  return !(rule.fields || []).includes('from');
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
  { value: 'delete', label: 'Delete' },
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

function processHintText(process) {
  if (process === 'delete') {
    return 'Matched mail is filed as junk and hidden from the inbox. No notification.';
  }
  if (process === 'archive') {
    return 'Matched mail is filed as junk without an alert.';
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

async function loadRulesTab() {
  const root = getRuleEditor();
  if (!root) return;
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
  if (ruleState.activeId && !ruleState.rules.some((r) => r.id === ruleState.activeId)) {
    ruleState.activeId = null;
    ruleState.dirty = false;
    getRuleEditor()?.classList.remove('de-pane-active');
  }
  renderRulesEditor();
}

function createRuleListItem(rule, activeId) {
  const isActive = activeId === rule.id || String(activeId) === String(rule.id);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ch-list-item${isActive ? ' active' : ''}${rule.enabled === false || isRuleExpired(rule) ? ' re-list-disabled' : ''}`;
  btn.dataset.id = rule.id;
  if (isActive) btn.setAttribute('aria-current', 'page');
  btn.innerHTML = `
    <span class="ch-item-row">
      <span class="ch-item-title">${escHtml(rule.title || rule.status)}</span>
      <span class="ch-item-date">${escHtml(formatRuleHitLabel(rule))}</span>
    </span>
    <span class="de-item-slug">${ruleScopePillHtml(rule)} ${escHtml(ruleSubline(rule).replace(/^(Universal|Personal) · /, ''))}</span>`;
  btn.addEventListener('click', () => openRuleEditor(rule.id));
  return btn;
}

function createRuleSwipeRow(rule, activeId) {
  const actions = [swipeAgentAction(() => askAgentAboutRule(rule))];
  if (canDeleteRule(rule)) {
    actions.push(swipeDeleteAction({
      onClick: () => deleteRule(rule.id),
    }));
  }
  return createSwipeRow(createRuleListItem(rule, activeId), actions);
}

function fillRulesSidebarList(list) {
  const { rules, activeId } = ruleState;
  const ordered = [...rules]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .filter((rule) => {
      if (ruleState.scopeFilter === 'universal' && ruleScope(rule) !== 'universal') return false;
      if (ruleState.scopeFilter === 'personal' && ruleScope(rule) !== 'personal') return false;
      return matchesListSearch(
        ruleState.search,
        rule.title,
        rule.status,
        ruleSubline(rule),
        rule.description,
        ruleScopeLabel(rule),
        ...(rule.exceptPhrases || []),
      );
    });
  list.replaceChildren();
  for (const rule of ordered) {
    list.appendChild(createRuleSwipeRow(rule, activeId));
  }
  if (ordered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = ruleState.search.trim() || ruleState.scopeFilter !== 'all'
      ? 'No matches.'
      : 'No rules yet.';
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
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput instanceof HTMLInputElement) {
    const n = ruleState.rules.length;
    searchInput.placeholder = `Search ${n} ${n === 1 ? 'Rule' : 'Rules'}`;
  }
  fillRulesSidebarList(list);
  syncRulesSidebarActiveState();
}

function syncRulesSidebarActiveState(opts = {}) {
  const { scroll = false } = opts;
  const root = getRuleEditor();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .ch-list-item').forEach((el) => {
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

function renderRulesPane() {
  getTriageLab().syncExpandedRule();
  flushTitleFocus('rules');
}

function orderedRulesForFlow() {
  return [...ruleState.rules].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function createFlowRuleCard(rule, index) {
  const row = document.createElement('div');
  row.className = `re-flow-row${rule.enabled === false || isRuleExpired(rule) ? ' re-flow-row--off' : ''}${String(ruleState.activeId) === String(rule.id) ? ' re-flow-row--active' : ''}`;
  row.dataset.id = rule.id;
  row.setAttribute('aria-label', `Priority ${index + 1}: ${rule.title || rule.status}`);

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
    <span class="re-flow-title">${escHtml(rule.title || rule.status)}</span>
    <span class="re-flow-sub">${escHtml(flowWhenSubline(rule))}</span>
    <span class="re-flow-meta">${escHtml(`${rule.matchMode || 'any'} · ${fieldsSummary(rule.fields)} · ${formatRuleHitLabel(rule)}`)}</span>`;

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
    await osAlert(`Could not save rule order: ${e.message}`);
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
        const siblings = [...rowsEl.querySelectorAll(':scope > .re-flow-row')].filter(
          (n) => n !== dragEl,
        );
        for (const sib of siblings) {
          const rect = sib.getBoundingClientRect();
          if (moveEv.clientY < rect.top + rect.height / 2) {
            rowsEl.insertBefore(dragEl, sib);
            return;
          }
        }
        rowsEl.appendChild(dragEl);
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
  hint.textContent = 'First match wins · drag ⋮⋮ to set priority · tap a rule to edit';
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
  root.innerHTML = '';
  root.classList.remove('re-view-flow', 're-view-list', 'de-pane-active');
  getTriageLab().render(root);
}

function isRuleAccordionMounted(id) {
  const root = getRuleEditor();
  if (!root || id == null) return false;
  const card = root.querySelector(`.re-lab-pipe-card[data-rule-id="${CSS.escape(String(id))}"]`);
  const body = card?.querySelector('.re-lab-pipe-card-body');
  return Boolean(body && body.dataset.mounted === '1' && !body.hidden);
}

async function leaveRuleIfSaved() {
  const ok = await flushRuleAutosave();
  if (ok) return true;
  const detail = ruleAutosaveError ? ` ${ruleAutosaveError}` : ' Check the highlighted fields.';
  await osAlert(`Couldn’t save this rule.${detail}`);
  return false;
}

async function openRuleEditor(id) {
  // Tap the open accordion again to collapse. If activeId is stale and the
  // form never mounted, treat the tap as open — not a discard/close.
  if (String(id) === String(ruleState.activeId) && isRuleAccordionMounted(id)) {
    await closeRuleEditor(true);
    return;
  }
  if (!(await leaveRuleIfSaved())) return;
  ruleState.activeId = id;
  ruleState.dirty = false;
  shell.clearEditorFooterSave();
  getRuleEditor()?.classList.remove('de-pane-active');
  getTriageLab().syncExpandedRule();
}

async function closeRuleEditor(checkDirty = true) {
  if (checkDirty) {
    if (!(await leaveRuleIfSaved())) return;
  } else {
    await flushRuleAutosave();
  }
  ruleAutosaveFlush = null;
  ruleState.activeId = null;
  ruleState.dirty = false;
  shell.clearEditorFooterSave();
  getRuleEditor()?.classList.remove('de-pane-active');
  getTriageLab().syncExpandedRule();
}

function renderRuleEditPane(pane, opts = {}) {
  const accordion = opts.accordion === true;
  ruleState.dirty = false;
  const rule = ruleState.rules.find((r) => r.id === ruleState.activeId);
  if (!rule) {
    pane.innerHTML = '<div class="de-loading de-error">Rule not found.</div>';
    return;
  }

  const agentBtn = createAgentBtn({
    label: 'Agent',
    onClick: () => askAgentAboutRule(rule),
  });

  if (accordion) {
    const actions = document.createElement('div');
    actions.className = 're-lab-rule-actions';
    const hits = document.createElement('span');
    hits.className = 're-lab-rule-hits';
    hits.textContent = ruleHitsSubline(rule) || (isCatalogReadOnly(rule) ? 'Catalog rule' : 'Edit rule');
    if (canDeleteRule(rule)) {
      actions.append(hits, agentBtn, paneDeleteIcon({
        label: 'Delete rule',
        onClick: () => deleteRule(rule.id),
      }));
    } else {
      actions.append(hits, agentBtn);
    }
    pane.appendChild(actions);
  } else {
    const inDrawer = shell.isCreateDrawerOpen('rules');
    pane.appendChild(
      createPaneHeader({
        back: inDrawer ? null : { label: 'Back to rules', onClick: () => closeRuleEditor() },
        title: rule.title || rule.status || 'Rule',
        subtitle: ruleHitsSubline(rule),
        beforeIcons: [agentBtn],
        icons: inDrawer || !canDeleteRule(rule)
          ? []
          : [
              paneDeleteIcon({
                label: 'Delete rule',
                onClick: () => deleteRule(rule.id),
              }),
            ],
      }).root,
    );
  }

  const form = document.createElement('div');
  form.className = accordion ? 're-form-scroll re-lab-rule-form' : 're-form-scroll';

  const titleIn = document.createElement('input');
  titleIn.className = 'de-input';
  titleIn.type = 'text';
  titleIn.value = rule.title || '';
  titleIn.autocomplete = 'off';
  if (!isCatalogReadOnly(rule)) requestTitleFocus('rules', titleIn);

  const scopeWrap = document.createElement('div');
  scopeWrap.className = 're-checks re-scope-radios';
  const scopeHint = document.createElement('p');
  scopeHint.className = 're-scope-hint';
  if (canManageUniversalRules()) {
    const syncScopeHint = (value) => {
      scopeHint.textContent =
        value === 'universal'
          ? 'Universal — REΛVE catalog. Other installs receive these from the repo; only this Railway install can create or edit them.'
          : 'Personal — this install only. Teach/correct and custom filters stay here.';
    };
    let scopeValue = ruleScope(rule);
    for (const [val, lab] of [
      ['personal', 'Personal (this install)'],
      ['universal', 'Universal (REΛVE catalog)'],
    ]) {
      const lb = document.createElement('label');
      lb.className = 're-check';
      const rb = document.createElement('input');
      rb.type = 'radio';
      rb.name = `re-scope-${rule.id}`;
      rb.value = val;
      rb.checked = scopeValue === val;
      rb.addEventListener('change', () => {
        if (!rb.checked) return;
        scopeValue = val;
        syncScopeHint(val);
      });
      lb.append(rb, document.createTextNode(` ${lab}`));
      scopeWrap.appendChild(lb);
    }
    syncScopeHint(scopeValue);
    scopeWrap.appendChild(scopeHint);
  } else if (isCatalogRule(rule)) {
    scopeHint.textContent =
      'Universal catalog — shipped from the REΛVE repo. This install cannot create or edit catalog rules.';
    scopeWrap.appendChild(scopeHint);
  } else if (showPersonal()) {
    scopeHint.textContent = 'Personal — this install only. Teach/correct and custom filters stay here.';
    const lb = document.createElement('label');
    lb.className = 're-check';
    const rb = document.createElement('input');
    rb.type = 'radio';
    rb.name = `re-scope-${rule.id}`;
    rb.value = 'personal';
    rb.checked = true;
    rb.disabled = true;
    lb.append(rb, document.createTextNode(' Personal (this install)'));
    scopeWrap.append(lb, scopeHint);
  }

  const statusIn = document.createElement('input');
  statusIn.type = 'hidden';
  statusIn.value = rule.status || 'CUSTOM';

  const descIn = document.createElement('textarea');
  descIn.className = 're-textarea';
  descIn.rows = 2;
  descIn.value = rule.description || '';

  const phrasesIn = document.createElement('textarea');
  phrasesIn.className = 're-textarea';
  phrasesIn.rows = 6;
  phrasesIn.placeholder = 'One keyword or phrase per line';
  phrasesIn.value = (rule.phrases || []).join('\n');

  const exceptIn = document.createElement('textarea');
  exceptIn.className = 're-textarea';
  exceptIn.rows = 3;
  exceptIn.placeholder = 'One phrase per line — if any appear, this rule does not match';
  exceptIn.value = (rule.exceptPhrases || []).join('\n');

  const matchSel = document.createElement('select');
  matchSel.className = 'de-input';
  matchSel.innerHTML = '<option value="any">Any phrase matches</option><option value="all">All phrases must match</option>';
  matchSel.value = rule.matchMode === 'all' ? 'all' : 'any';

  const fieldsWrap = document.createElement('div');
  fieldsWrap.className = 're-checks';
  const fieldSet = new Set(rule.fields || ['subject', 'body']);
  for (const [val, lab] of [['subject', 'Subject'], ['body', 'Body'], ['from', 'From']]) {
    const lb = document.createElement('label');
    lb.className = 're-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = val;
    cb.checked = fieldSet.has(val);
    lb.append(cb, document.createTextNode(` ${lab}`));
    fieldsWrap.appendChild(lb);
  }

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
    label: 'Expires',
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
    createRuleToggleRow('Expires', expiresToggle),
    expiresAtReveal,
    createRuleToggleRow('Expire in', expireInToggle),
    expireInReveal,
  );

  appendRuleField(form, 'Title', titleIn);
  if (scopeWrap.childNodes.length) appendRuleField(form, 'Applies to', scopeWrap);
  appendRuleField(form, 'Description', descIn);
  appendRuleField(form, 'Keywords / phrases', phrasesIn);
  appendRuleField(form, 'Except (NOT)', exceptIn);
  appendRuleField(form, 'Match mode', matchSel);
  appendRuleField(form, 'Search in', fieldsWrap);
  const processFieldWrap = document.createElement('div');
  processFieldWrap.className = 're-process-field';
  const processHint = document.createElement('span');
  processHint.className = 're-field-hint';
  processHint.textContent = processHintText(processSel.value);
  processFieldWrap.append(processPill.el, processHint, processSel);
  form.appendChild(processFieldWrap);
  processField = { wrap: processFieldWrap, hintEl: processHint };
  form.appendChild(statusIn);
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
    titleIn,
    scopeWrap,
    statusIn,
    processSel,
    descIn,
    phrasesIn,
    exceptIn,
    matchSel,
    fieldsWrap,
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
  }
  shell.clearEditorFooterSave();
}

function collectRulePayload(inputs) {
  const fields = [];
  inputs.fieldsWrap.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    if (cb.checked) fields.push(cb.value);
  });
  const notifyActions = [];
  inputs.notifyActionsWrap.querySelectorAll('[data-notify-action]').forEach((btn) => {
    if (ruleToggleOn(btn)) notifyActions.push(btn.dataset.notifyAction);
  });
  const process = inputs.processSel?.value || ruleProcessValue(inputs.statusIn.value);
  const isDelete = process === 'delete';
  const notifyPush = !isDelete && ruleToggleOn(inputs.pushToggle);
  const notifyDashboard = !isDelete && ruleToggleOn(inputs.dashToggle);
  const scopeRb = inputs.scopeWrap.querySelector('input[type=radio]:checked');
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
    title: inputs.titleIn.value.trim(),
    scope: scopeRb?.value === 'universal' ? 'universal' : 'personal',
    status: statusForProcess(process, inputs.statusIn.value.trim()),
    description: inputs.descIn.value.trim(),
    phrases: inputs.phrasesIn.value.split('\n').map((s) => s.trim()).filter(Boolean),
    exceptPhrases: inputs.exceptIn.value.split('\n').map((s) => s.trim()).filter(Boolean),
    matchMode: inputs.matchSel.value,
    fields: fields.length ? fields : ['subject', 'body'],
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
  const item = root?.querySelector(`.ch-list-item[data-id="${CSS.escape(id)}"]`);
  if (item) {
    const titleEl = item.querySelector('.ch-item-title');
    if (titleEl) titleEl.textContent = payload.title || payload.status || 'Rule';
    const dateEl = item.querySelector('.ch-item-date');
    if (dateEl) {
      dateEl.textContent = formatRuleHitLabel(rule || { hitCount: savedRule?.hitCount });
    }
    const subEl = item.querySelector('.de-item-slug');
    if (subEl && rule) {
      subEl.innerHTML = `${ruleScopePillHtml(rule)} ${escHtml(ruleSubline(rule).replace(/^(Universal|Personal) · /, ''))}`;
    }
    item.classList.toggle('re-list-disabled', rule?.enabled === false || isRuleExpired(rule));
  }
  const card = root?.querySelector(`.re-lab-pipe-card[data-rule-id="${CSS.escape(String(id))}"]`);
  if (card && rule) {
    const titleEl = card.querySelector('.re-lab-pipe-title');
    if (titleEl) titleEl.textContent = formatRuleWhenClause(rule);
    const subEl = card.querySelector('.re-lab-pipe-sub');
    if (subEl) subEl.textContent = formatRuleLabMeta(rule);
    const toggle = card.querySelector('.re-lab-pipe-card-toggle');
    const pri = card.querySelector('.re-lab-pri')?.textContent?.replace(/^#/, '') || '';
    if (toggle) {
      toggle.setAttribute(
        'aria-label',
        `Priority ${pri || '?'}: ${formatRuleWhenClause(rule)}`,
      );
    }
    card.classList.toggle('re-lab-pipe-card--off', rule.enabled === false || isRuleExpired(rule));
  }
}

function bindRuleAutosave(rule, inputs, opts = {}) {
  let baseline = serializeRulePayload(collectRulePayload(inputs));
  let activeEl = null;
  let savingLock = Promise.resolve();

  const allFields = () => [
    inputs.titleIn,
    ...inputs.scopeWrap.querySelectorAll('input[type=radio]'),
    ...(inputs.processSel ? [inputs.processSel] : []),
    inputs.descIn,
    inputs.phrasesIn,
    inputs.exceptIn,
    inputs.matchSel,
    ...inputs.fieldsWrap.querySelectorAll('input[type=checkbox]'),
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
    if (!payload.title || !payload.status) {
      ruleAutosaveError = 'Title is required.';
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
      if (!payload.title && el === inputs.titleIn) shell.setFormFieldState(el, 'invalid');
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
  if (!payload.title || !payload.status) {
    alert('Title is required.');
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

async function bulkDeleteRules(ids) {
  if (!ids.length) return;
  closeOpenSwipeRow();
  const idSet = new Set(ids.map(String));
  for (const id of ids) {
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
  if (ruleState.activeId != null && idSet.has(String(ruleState.activeId))) {
    ruleState.dirty = false;
    ruleState.activeId = null;
    getRuleEditor()?.classList.remove('de-pane-active');
  }
  await loadRulesTab();
}

async function deleteRule(id) {
  try {
    const res = await fetch(`/api/email/rules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ruleState.dirty = false;
    ruleState.activeId = null;
    getRuleEditor()?.classList.remove('de-pane-active');
    await loadRulesTab();
  } catch (e) {
    alert(`Delete failed: ${e.message}`);
  }
}

async function startNewRule(draft = null) {
  const fromLab = Boolean(draft && typeof draft === 'object');
  if (!fromLab) armTitleFocus('rules');
  if (!(await leaveRuleIfSaved())) {
    if (!fromLab) cancelTitleFocus();
    return null;
  }
  const phrases = fromLab
    ? (Array.isArray(draft.phrases) ? draft.phrases : [])
        .map((p) => String(p || '').trim())
        .filter(Boolean)
    : [];
  const payload = fromLab
    ? {
        title: String(draft.title || phrases[0] || 'New rule').trim() || 'New rule',
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
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ruleState.activeId = data.rule.id;
    ruleState.dirty = false;
    await loadRulesTab();
    return data.rule;
  } catch (e) {
    if (!fromLab) cancelTitleFocus();
    if (fromLab) throw e;
    alert(`Could not create rule: ${e.message}`);
    return null;
  }
}

/**
 * Open Rules and prefill tester terms from an inbox record (notification deep link).
 * @param {object} emailRecord
 * @param {{ run?: boolean }} [opts]
 */
async function openRulesLabWithEmail(emailRecord, opts = {}) {
  if (!emailRecord || typeof emailRecord !== 'object') return;
  shell.setActiveMap?.('rules', { force: true });
  await loadRulesTab();
  const lab = getTriageLab();
  await lab.loadInboxEmail(emailRecord, { run: opts.run !== false });
}

/** Open Email Lab and expand the rule the inbox classification landed on. */
async function openRulesLabWithRule(ruleId, opts = {}) {
  const id = String(ruleId || '').trim();
  shell.setActiveMap?.('rules', { force: true });
  await loadRulesTab();
  if (opts.email && typeof opts.email === 'object') {
    await getTriageLab().loadInboxEmail(opts.email, { run: opts.run !== false });
  }
  if (!id) return;
  if (String(ruleState.activeId) === id) {
    getTriageLab().syncExpandedRule();
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
  openRulesLabWithEmail,
  openRulesLabWithRule,
};
