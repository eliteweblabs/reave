/**
 * rules panel — extracted from os-map-loader.js
 */
import {
  IOS_ICONS,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  syncSearchFieldAdornment,
  createSlidingPillSelect,
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
} from './admin-ui.js?v=20260811a';
import { createPaneHeader } from './pane-header.js?v=20260808d';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, mountPanelSkeleton } from './shared.js?v=20260810a';
import { osAlert, openOsDialogBackdrop, closeOsDialogBackdrop } from './os-dialog.js?v=20260728q';
import { confirmDiscardChanges } from './clients-panel.js?v=20260811b';

/** Injected by os-map-loader via initRulesPanel(). */
let shell = {};

/** Built-in + common triage status tags offered in the rule editor autosuggest. */
const KNOWN_RULE_STATUS_TAGS = [
  'VERIFICATION_CODE',
  'AUTH_LINK',
  'ANTHROPIC_BILLING',
  'RAILWAY_ALERT',
  'DOWN',
  'NEEDS_CHECK',
  'RECEIPT',
  'AUTO_ARCHIVED',
  'DELETE',
  'CUSTOM',
];

const RULE_STATUS_DATALIST_ID = 're-status-suggestions';

export function initRulesPanel(deps) {
  shell = deps;
}

/** Unique status tags from known builtins + currently loaded rules (sorted). */
function ruleStatusSuggestions() {
  const seen = new Set();
  const out = [];
  for (const tag of KNOWN_RULE_STATUS_TAGS) {
    const key = String(tag || '').trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  for (const rule of ruleState.rules || []) {
    const key = String(rule?.status || '').trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function syncRuleStatusDatalist() {
  let datalist = document.getElementById(RULE_STATUS_DATALIST_ID);
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = RULE_STATUS_DATALIST_ID;
    document.body.appendChild(datalist);
  }
  datalist.replaceChildren();
  for (const tag of ruleStatusSuggestions()) {
    const opt = document.createElement('option');
    opt.value = tag;
    datalist.appendChild(opt);
  }
  return datalist;
}

const RULES_VIEW_KEY = 'admin.rules.view';

function readRulesView() {
  try {
    const v = sessionStorage.getItem(RULES_VIEW_KEY);
    if (v === 'list' || v === 'flow') return v;
  } catch {}
  return 'flow';
}

function writeRulesView(view) {
  try {
    sessionStorage.setItem(RULES_VIEW_KEY, view);
  } catch {}
}

// ---- extracted from os-map-loader.js:8260-8914 ----
let ruleState = {
  rules: [],
  notifyOnUnmatched: true,
  storage: 'files',
  search: '',
  activeId: null,
  dirty: false,
  /** @type {'flow' | 'list'} n8n-style priority map vs sidebar list */
  view: readRulesView(),
};

function phraseSummary(phrases, max = 3) {
  if (!phrases?.length) return '(any phrase)';
  const shown = phrases.slice(0, max);
  const tail = phrases.length > max ? ` +${phrases.length - max}` : '';
  return shown.map((p) => `"${p}"`).join(' · ') + tail;
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

function ruleSubline(rule) {
  const bits = [];
  if (rule.status) bits.push(rule.status);
  bits.push(rule.notify ? 'Notify' : 'Silent');
  if (!rule.enabled) bits.push('Off');
  if (rule.expiresAt) {
    bits.push(isRuleExpired(rule) ? 'Expired' : `Until ${formatRuleExpiresLabel(rule.expiresAt)}`);
  }
  if (rule.forwardTo) bits.push(`→ ${rule.forwardTo}`);
  return bits.join(' · ');
}

function appendRuleField(parent, label, el) {
  const wrap = document.createElement('label');
  wrap.className = 'de-label';
  wrap.textContent = label;
  wrap.appendChild(el);
  parent.appendChild(wrap);
}

async function loadRulesTab() {
  const root = getRuleEditor();
  if (!root) return;
  mountPanelSkeleton(root, 'list', 'Loading rules…', { contentSelector: '.ch-sidebar' });
  try {
    const res = await fetch('/api/email/rules', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    ruleState.rules = data.rules || [];
    ruleState.notifyOnUnmatched = !!data.notifyOnUnmatched;
    ruleState.storage = data.storage || 'files';
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load rules: ${escHtml(e.message)}</div>`;
    return;
  }
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
      <span class="ch-item-date">${escHtml(shell.formatChatDate(rule.updatedAt || rule.createdAt))}</span>
    </span>
    <span class="de-item-slug">${escHtml(ruleSubline(rule))}</span>`;
  btn.addEventListener('click', () => openRuleEditor(rule.id));
  return btn;
}

function createRuleSwipeRow(rule, activeId) {
  return createSwipeRow(createRuleListItem(rule, activeId), [
    swipeAgentAction(() => askAgentAboutRule(rule)),
    swipeDeleteAction({
      onClick: () => deleteRule(rule.id),
    }),
  ]);
}

function fillRulesSidebarList(list) {
  const { rules, activeId } = ruleState;
  const ordered = [...rules]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .filter((rule) =>
      matchesListSearch(ruleState.search, rule.title, rule.status, ruleSubline(rule), rule.description),
    );
  list.replaceChildren();
  for (const rule of ordered) {
    list.appendChild(createRuleSwipeRow(rule, activeId));
  }
  if (ordered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = ruleState.search.trim() ? 'No matches.' : 'No rules yet.';
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
  const root = getRuleEditor();
  if (!root) return;
  let pane = root.querySelector('.de-pane');
  if (!pane) {
    renderRulesEditor();
    return;
  }
  const { activeId } = ruleState;

  if (activeId) {
    pane.innerHTML = '';
    renderRuleEditPane(pane);
    shell.mountCreateDrawerChrome(pane);
  } else {
    shell.clearEditorFooterSave();
    pane.innerHTML = '';
    if (ruleState.view === 'list') {
      shell.appendEmptyDetailPane(pane, {
        mapKey: 'rules',
        iconName: 'zap',
        bodyHtml: '<p>Select a rule to edit, or create a new one.</p>',
        onCreate: () => void startNewRule(),
      });
    }
  }
  // Keep flow row highlight in sync when editor opens/closes.
  if (ruleState.view === 'flow') {
    root.querySelectorAll('.re-flow-row').forEach((el) => {
      el.classList.toggle('re-flow-row--active', el.dataset.id === String(ruleState.activeId));
    });
  }
  flushTitleFocus('rules');
}

function setRulesView(view) {
  if (view !== 'flow' && view !== 'list') return;
  if (ruleState.view === view) return;
  ruleState.view = view;
  writeRulesView(view);
  renderRulesEditor();
}

function orderedRulesForFlow() {
  return [...ruleState.rules].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function createRulesViewPicker() {
  return createSlidingPillSelect({
    value: ruleState.view,
    options: [
      { value: 'flow', label: 'Flow' },
      { value: 'list', label: 'List' },
    ],
    ariaLabel: 'Rules view',
    onChange: (next) => setRulesView(next),
  });
}

function createFlowRuleCard(rule, index) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = `re-flow-row${rule.enabled === false || isRuleExpired(rule) ? ' re-flow-row--off' : ''}${String(ruleState.activeId) === String(rule.id) ? ' re-flow-row--active' : ''}`;
  row.dataset.id = rule.id;
  row.setAttribute('aria-label', `Priority ${index + 1}: ${rule.title || rule.status}`);

  const pri = document.createElement('span');
  pri.className = 're-flow-pri';
  pri.textContent = `#${index + 1}`;
  pri.title = 'Evaluation priority — lower number wins first';

  const when = document.createElement('span');
  when.className = 're-flow-node re-flow-node--when';
  when.innerHTML = `
    <span class="re-flow-badge">When</span>
    <span class="re-flow-title">${escHtml(rule.title || rule.status)}</span>
    <span class="re-flow-sub">${escHtml(phraseSummary(rule.phrases))}</span>
    <span class="re-flow-meta">${escHtml(`${rule.matchMode || 'any'} · ${fieldsSummary(rule.fields)}`)}</span>`;

  const arrow = document.createElement('span');
  arrow.className = 're-flow-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';

  const then = document.createElement('span');
  then.className = `re-flow-node re-flow-node--then${rule.notify ? ' re-flow-node--alert' : ' re-flow-node--quiet'}`;
  const action = rule.notify ? 'Notify' : 'Silent';
  then.innerHTML = `
    <span class="re-flow-badge">Then</span>
    <span class="re-flow-title">${escHtml(action)}</span>
    <span class="re-flow-sub">${escHtml(`status → ${rule.status || '—'}`)}</span>
    <span class="re-flow-meta">${escHtml(ruleSubline(rule))}</span>`;

  row.append(pri, when, arrow, then);
  row.addEventListener('click', () => openRuleEditor(rule.id));
  return row;
}

function renderRulesFlowShell(root) {
  const shellEl = document.createElement('div');
  shellEl.className = 're-flow-shell';

  const toolbar = document.createElement('div');
  toolbar.className = 're-flow-toolbar';

  const left = document.createElement('div');
  left.className = 're-flow-toolbar-left';
  left.appendChild(createRulesViewPicker().el);

  const hint = document.createElement('p');
  hint.className = 're-flow-hint';
  hint.textContent = 'First match wins · top = highest priority';
  left.appendChild(hint);
  toolbar.appendChild(left);

  const right = document.createElement('div');
  right.className = 're-flow-toolbar-right';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'dash-panel-btn';
  addBtn.textContent = '+ Rule';
  addBtn.addEventListener('click', () => void startNewRule());
  right.appendChild(addBtn);
  toolbar.appendChild(right);
  shellEl.appendChild(toolbar);

  if (ruleState.storage === 'files') {
    const warn = document.createElement('div');
    warn.className = 're-warn-inline';
    warn.textContent = 'Using local file storage — set DATABASE_URL on Railway for production.';
    shellEl.appendChild(warn);
  }

  const settings = document.createElement('div');
  settings.className = 're-settings re-flow-settings';
  const notifyLb = document.createElement('label');
  notifyLb.className = 're-check';
  const notifyCb = document.createElement('input');
  notifyCb.type = 'checkbox';
  notifyCb.checked = ruleState.notifyOnUnmatched;
  notifyCb.addEventListener('change', async (e) => {
    const next = e.target.checked;
    try {
      const res = await fetch('/api/email/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyOnUnmatched: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ruleState.notifyOnUnmatched = next;
      const elseSub = shellEl.querySelector('.re-flow-else .re-flow-sub');
      if (elseSub) elseSub.textContent = next ? 'Notify by default' : 'Stay silent';
    } catch (err) {
      e.target.checked = !next;
      alert(`Could not save setting: ${err.message}`);
    }
  });
  notifyLb.append(notifyCb, document.createTextNode(' Notify when no rule matches'));
  settings.appendChild(notifyLb);
  shellEl.appendChild(settings);

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
  spine.textContent = '↓ evaluate in order';
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
  }
  scroll.appendChild(rows);

  const elseRow = document.createElement('div');
  elseRow.className = 're-flow-else';
  elseRow.innerHTML = `
    <span class="re-flow-node re-flow-node--when re-flow-node--else">
      <span class="re-flow-badge">Else</span>
      <span class="re-flow-title">No rule matched</span>
      <span class="re-flow-sub">${escHtml(ruleState.notifyOnUnmatched ? 'Notify by default' : 'Stay silent')}</span>
    </span>
    <span class="re-flow-arrow" aria-hidden="true">→</span>
    <span class="re-flow-node re-flow-node--then ${ruleState.notifyOnUnmatched ? 're-flow-node--alert' : 're-flow-node--quiet'}">
      <span class="re-flow-badge">Then</span>
      <span class="re-flow-title">${escHtml(ruleState.notifyOnUnmatched ? 'Notify' : 'Silent')}</span>
      <span class="re-flow-sub">status → UNMATCHED</span>
    </span>`;
  scroll.appendChild(elseRow);
  shellEl.appendChild(scroll);
  root.appendChild(shellEl);
}

function renderRulesEditor() {
  const root = getRuleEditor();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll(root);
  root.innerHTML = '';
  root.classList.toggle('re-view-flow', ruleState.view === 'flow');
  root.classList.toggle('re-view-list', ruleState.view === 'list');

  if (ruleState.view === 'flow') {
    renderRulesFlowShell(root);
    const pane = document.createElement('div');
    pane.className = 'de-pane';
    root.appendChild(pane);
    renderRulesPane();
    return;
  }

  const { rules, notifyOnUnmatched, storage } = ruleState;

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const viewBar = document.createElement('div');
  viewBar.className = 're-list-view-bar';
  viewBar.appendChild(createRulesViewPicker().el);
  sidebar.appendChild(viewBar);

  const subheader = listSearchSubheader({
    itemCount: rules.length,
    search: {
      value: ruleState.search,
      placeholder: `Search ${rules.length} ${rules.length === 1 ? 'Rule' : 'Rules'}`,
      onInput: (value) => {
        ruleState.search = value;
        refreshRulesSidebarList();
      },
    },
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const hint = document.createElement('div');
  hint.className = 'de-empty';
  hint.style.padding = '0 0.65rem 0.5rem';
  hint.textContent = 'First match wins · inbound email triage';
  sidebar.appendChild(hint);

  if (storage === 'files') {
    const warn = document.createElement('div');
    warn.className = 're-warn-inline';
    warn.textContent = 'Using local file storage — set DATABASE_URL on Railway for production.';
    sidebar.appendChild(warn);
  }

  const settings = document.createElement('div');
  settings.className = 're-settings';
  const notifyLb = document.createElement('label');
  notifyLb.className = 're-check';
  const notifyCb = document.createElement('input');
  notifyCb.type = 'checkbox';
  notifyCb.checked = notifyOnUnmatched;
  notifyCb.addEventListener('change', async (e) => {
    const next = e.target.checked;
    try {
      const res = await fetch('/api/email/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyOnUnmatched: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ruleState.notifyOnUnmatched = next;
    } catch (err) {
      e.target.checked = !next;
      alert(`Could not save setting: ${err.message}`);
    }
  });
  notifyLb.append(notifyCb, document.createTextNode(' Notify when no rule matches'));
  settings.appendChild(notifyLb);
  sidebar.appendChild(settings);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  bindListMultiSelect(list, { onBulkDelete: bulkDeleteRules });
  fillRulesSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  root.appendChild(pane);
  renderRulesPane();
  shell.finishSidebarListScroll(root, savedSidebarScroll);
}

async function openRuleEditor(id) {
  if (String(id) === String(ruleState.activeId)) {
    syncRulesSidebarActiveState({ scroll: true });
    if (!shell.isCreateDrawerOpen('rules')) getRuleEditor()?.classList.add('de-pane-active');
    return;
  }
  await flushRuleAutosave();
  if (ruleState.dirty && ruleState.activeId && String(ruleState.activeId) !== String(id)) {
    if (!(await confirmDiscardChanges())) return;
  }
  ruleState.activeId = id;
  ruleState.dirty = false;
  if (!shell.isCreateDrawerOpen('rules')) getRuleEditor()?.classList.add('de-pane-active');
  syncRulesSidebarActiveState({ scroll: true });
  renderRulesPane();
}

async function closeRuleEditor(checkDirty = true) {
  await flushRuleAutosave();
  if (checkDirty && ruleState.dirty && !(await confirmDiscardChanges())) return;
  ruleState.activeId = null;
  ruleState.dirty = false;
  shell.clearEditorFooterSave();
  getRuleEditor()?.classList.remove('de-pane-active');
  syncRulesSidebarActiveState();
  renderRulesPane();
}

function renderRuleEditPane(pane) {
  const rule = ruleState.rules.find((r) => r.id === ruleState.activeId);
  if (!rule) {
    pane.innerHTML = '<div class="de-loading de-error">Rule not found.</div>';
    return;
  }

  const agentBtn = createAgentBtn({
    label: 'Agent',
    onClick: () => askAgentAboutRule(rule),
  });

  const inDrawer = shell.isCreateDrawerOpen('rules');
  pane.appendChild(
    createPaneHeader({
      back: inDrawer ? null : { label: 'Back to rules', onClick: () => closeRuleEditor() },
      title: rule.title || rule.status || 'Rule',
      beforeIcons: [agentBtn],
      icons: inDrawer
        ? []
        : [
            paneDeleteIcon({
              label: 'Delete rule',
              onClick: () => deleteRule(rule.id),
            }),
          ],
    }).root,
  );

  const form = document.createElement('div');
  form.className = 're-form-scroll';

  const titleIn = document.createElement('input');
  titleIn.className = 'de-input';
  titleIn.type = 'text';
  titleIn.value = rule.title || '';
  titleIn.addEventListener('input', () => { ruleState.dirty = true; });
  requestTitleFocus('rules', titleIn);

  syncRuleStatusDatalist();
  const statusIn = document.createElement('input');
  statusIn.className = 'de-input';
  statusIn.type = 'text';
  statusIn.setAttribute('list', RULE_STATUS_DATALIST_ID);
  statusIn.setAttribute('autocomplete', 'off');
  statusIn.setAttribute('spellcheck', 'false');
  statusIn.value = rule.status || '';
  statusIn.placeholder = 'DOWN, RECEIPT, …';
  statusIn.addEventListener('input', () => { ruleState.dirty = true; });
  statusIn.addEventListener('change', () => { ruleState.dirty = true; });
  statusIn.addEventListener('focus', () => { syncRuleStatusDatalist(); });

  const descIn = document.createElement('textarea');
  descIn.className = 're-textarea';
  descIn.rows = 2;
  descIn.value = rule.description || '';
  descIn.addEventListener('input', () => { ruleState.dirty = true; });

  const phrasesIn = document.createElement('textarea');
  phrasesIn.className = 're-textarea';
  phrasesIn.rows = 6;
  phrasesIn.placeholder = 'One keyword or phrase per line';
  phrasesIn.value = (rule.phrases || []).join('\n');
  phrasesIn.addEventListener('input', () => { ruleState.dirty = true; });

  const matchSel = document.createElement('select');
  matchSel.className = 'de-input';
  matchSel.innerHTML = '<option value="any">Any phrase matches</option><option value="all">All phrases must match</option>';
  matchSel.value = rule.matchMode === 'all' ? 'all' : 'any';
  matchSel.addEventListener('change', () => { ruleState.dirty = true; });

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
    cb.addEventListener('change', () => { ruleState.dirty = true; });
    lb.append(cb, document.createTextNode(` ${lab}`));
    fieldsWrap.appendChild(lb);
  }

  const notifyLb = document.createElement('label');
  notifyLb.className = 're-check';
  const notifyCb = document.createElement('input');
  notifyCb.type = 'checkbox';
  notifyCb.checked = !!rule.notify;
  notifyCb.addEventListener('change', () => { ruleState.dirty = true; });
  notifyLb.append(notifyCb, document.createTextNode(' Send push alert'));

  const enabledLb = document.createElement('label');
  enabledLb.className = 're-check';
  const enabledCb = document.createElement('input');
  enabledCb.type = 'checkbox';
  enabledCb.checked = rule.enabled !== false;
  enabledCb.addEventListener('change', () => { ruleState.dirty = true; });
  enabledLb.append(enabledCb, document.createTextNode(' Rule enabled'));

  const forwardIn = document.createElement('input');
  forwardIn.className = 'de-input';
  forwardIn.type = 'email';
  forwardIn.placeholder = 'e.g. teammate@company.com (optional)';
  forwardIn.value = rule.forwardTo || '';
  forwardIn.addEventListener('input', () => { ruleState.dirty = true; });

  const expiresLb = document.createElement('label');
  expiresLb.className = 're-check';
  const expiresCb = document.createElement('input');
  expiresCb.type = 'checkbox';
  expiresCb.checked = !!rule.expiresAt;
  expiresLb.append(expiresCb, document.createTextNode(' Expires'));

  const expiresAtIn = document.createElement('input');
  expiresAtIn.className = 'de-input';
  expiresAtIn.type = 'datetime-local';
  expiresAtIn.value = toRuleDatetimeLocalValue(rule.expiresAt);
  expiresAtIn.disabled = !expiresCb.checked;
  expiresAtIn.style.marginTop = '0.4rem';

  const expiresWrap = document.createElement('div');
  expiresWrap.className = 're-expires-field';
  expiresWrap.appendChild(expiresLb);
  expiresWrap.appendChild(expiresAtIn);

  const syncExpiresUi = () => {
    expiresAtIn.disabled = !expiresCb.checked;
    if (expiresCb.checked && !expiresAtIn.value) {
      expiresAtIn.value = defaultRuleExpiresLocalValue();
    }
    ruleState.dirty = true;
  };
  expiresCb.addEventListener('change', syncExpiresUi);
  expiresAtIn.addEventListener('input', () => { ruleState.dirty = true; });
  expiresAtIn.addEventListener('change', () => { ruleState.dirty = true; });

  appendRuleField(form, 'Title', titleIn);
  appendRuleField(form, 'Status tag', statusIn);
  appendRuleField(form, 'Description', descIn);
  appendRuleField(form, 'Keywords / phrases', phrasesIn);
  appendRuleField(form, 'Match mode', matchSel);
  appendRuleField(form, 'Search in', fieldsWrap);
  appendRuleField(form, 'Forward to', forwardIn);
  form.appendChild(notifyLb);
  form.appendChild(enabledLb);
  form.appendChild(expiresWrap);
  pane.appendChild(form);

  const ruleInputs = {
    titleIn,
    statusIn,
    descIn,
    phrasesIn,
    matchSel,
    fieldsWrap,
    notifyCb,
    enabledCb,
    forwardIn,
    expiresCb,
    expiresAtIn,
  };
  bindRuleAutosave(rule, ruleInputs, { defer: inDrawer });
  shell.clearEditorFooterSave();
}

function collectRulePayload(inputs) {
  const fields = [];
  inputs.fieldsWrap.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    if (cb.checked) fields.push(cb.value);
  });
  return {
    title: inputs.titleIn.value.trim(),
    status: inputs.statusIn.value.trim(),
    description: inputs.descIn.value.trim(),
    phrases: inputs.phrasesIn.value.split('\n').map((s) => s.trim()).filter(Boolean),
    matchMode: inputs.matchSel.value,
    fields: fields.length ? fields : ['subject', 'body'],
    notify: inputs.notifyCb.checked,
    enabled: inputs.enabledCb.checked,
    forwardTo: inputs.forwardIn.value.trim() || null,
    expiresAt: inputs.expiresCb.checked ? fromRuleDatetimeLocalValue(inputs.expiresAtIn.value) : null,
  };
}

let ruleAutosaveTimer = null;
let ruleAutosaveFlush = null;

function serializeRulePayload(payload) {
  return JSON.stringify(payload);
}

function syncRuleListItem(id, payload, savedRule) {
  const rule = ruleState.rules.find((r) => r.id === id);
  if (rule) Object.assign(rule, payload, savedRule || {});
  const item = getRuleEditor()?.querySelector(`.ch-list-item[data-id="${CSS.escape(id)}"]`);
  if (!item) return;
  const titleEl = item.querySelector('.ch-item-title');
  if (titleEl) titleEl.textContent = payload.title || payload.status || 'Rule';
  const dateEl = item.querySelector('.ch-item-date');
  if (dateEl) {
    const when = (savedRule && (savedRule.updatedAt || savedRule.createdAt)) || (rule && (rule.updatedAt || rule.createdAt));
    dateEl.textContent = shell.formatChatDate(when);
  }
  const subEl = item.querySelector('.de-item-slug');
  if (subEl && rule) subEl.textContent = ruleSubline(rule);
  item.classList.toggle('re-list-disabled', rule?.enabled === false || isRuleExpired(rule));
}

function bindRuleAutosave(rule, inputs, opts = {}) {
  let baseline = serializeRulePayload(collectRulePayload(inputs));
  let activeEl = null;
  let saving = false;
  let pendingFlush = false;

  const allFields = () => [
    inputs.titleIn,
    inputs.statusIn,
    inputs.descIn,
    inputs.phrasesIn,
    inputs.matchSel,
    ...inputs.fieldsWrap.querySelectorAll('input[type=checkbox]'),
    inputs.notifyCb,
    inputs.enabledCb,
    inputs.forwardIn,
    inputs.expiresCb,
    inputs.expiresAtIn,
  ];

  const flush = async () => {
    clearTimeout(ruleAutosaveTimer);
    ruleAutosaveTimer = null;

    if (saving) {
      pendingFlush = true;
      return;
    }

    const payload = collectRulePayload(inputs);
    const current = serializeRulePayload(payload);
    if (current === baseline) {
      ruleState.dirty = false;
      return;
    }
    if (!payload.title || !payload.status) {
      if (activeEl) shell.setFormFieldState(activeEl, 'invalid');
      return;
    }
    if (inputs.expiresCb.checked && !payload.expiresAt) {
      shell.setFormFieldState(inputs.expiresAtIn, 'invalid');
      return;
    }

    saving = true;
    if (activeEl) shell.setFormFieldState(activeEl, 'saving');

    try {
      const res = await fetch(`/api/email/rules/${encodeURIComponent(rule.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      baseline = current;
      ruleState.dirty = false;
      syncRuleListItem(rule.id, payload, data.rule);
      syncRuleStatusDatalist();
      if (activeEl) shell.flashFormFieldSaved(activeEl);
    } catch (e) {
      console.warn('[rules] autosave failed', e);
      if (activeEl) shell.setFormFieldState(activeEl, 'invalid');
    } finally {
      saving = false;
      if (
        activeEl &&
        !activeEl.classList.contains(shell.FORM_FIELD_SAVED) &&
        !activeEl.classList.contains(shell.FORM_FIELD_INVALID)
      ) {
        shell.setFormFieldState(activeEl, null);
      }
      if (pendingFlush) {
        pendingFlush = false;
        await flush();
      }
    }
  };

  const schedule = (el) => {
    activeEl = el;
    ruleState.dirty = serializeRulePayload(collectRulePayload(inputs)) !== baseline;
    if (!el.classList.contains(shell.FORM_FIELD_INVALID) && !el.classList.contains(shell.FORM_FIELD_SAVED)) {
      shell.setFormFieldState(el, null);
    }
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
      else if (!payload.status && el === inputs.statusIn) shell.setFormFieldState(el, 'invalid');
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
    await ruleAutosaveFlush();
    ruleAutosaveFlush = null;
  }
}

async function saveRule(id, inputs) {
  const payload = collectRulePayload(inputs);
  if (!payload.title || !payload.status) {
    alert('Title and status tag are required.');
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

async function startNewRule() {
  armTitleFocus('rules');
  if (ruleState.dirty && !(await confirmDiscardChanges())) {
    cancelTitleFocus();
    return;
  }
  try {
    const res = await fetch('/api/email/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'New rule',
        status: 'CUSTOM',
        description: '',
        phrases: [],
        matchMode: 'any',
        fields: ['subject', 'body'],
        notify: true,
        enabled: true,
        expiresAt: null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const newId = data.rule.id;
    ruleState.activeId = newId;
    ruleState.dirty = false;
    // The rule row has to exist before its form can be edited, so Cancel here
    // means "delete the placeholder I just made".
    shell.beginCreateDrawer({
      key: 'rules',
      title: 'New Rule',
      submitLabel: 'Add',
      onSubmit: async () => {
        const pane = shell.getCreateDrawerPane();
        const titleIn = pane?.querySelector('.re-form-scroll > label.de-label .de-input');
        if (!titleIn?.value.trim()) {
          if (titleIn) {
            shell.setFormFieldState(titleIn, 'invalid');
            titleIn.focus({ preventScroll: true });
          }
          return;
        }
        await flushRuleAutosave();
        shell.finishCreateDrawer();
        getRuleEditor()?.classList.add('de-pane-active');
        syncRulesSidebarActiveState({ scroll: true });
        renderRulesPane();
      },
      onDismiss: () => {
        void deleteRule(newId);
      },
    });
    // `loadRulesTab` renders the pane for the id set above; opening the editor
    // on top of that would re-render and drop the auto-focused title field.
    await loadRulesTab();
  } catch (e) {
    cancelTitleFocus();
    alert(`Could not create rule: ${e.message}`);
  }
}
export {
  ruleState,
  loadRulesTab,
  getRuleEditor,
  isRuleExpired,
  formatRuleExpiresLabel,
  toRuleDatetimeLocalValue,
  ruleSubline,
  startNewRule,
};
