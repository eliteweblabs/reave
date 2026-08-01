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
  createPaneSubheader,
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
} from './admin-ui.js?v=20260728q';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText } from './shared.js?v=20260728q';
import { osAlert, openOsDialogBackdrop, closeOsDialogBackdrop } from './os-dialog.js?v=20260728q';
import { confirmDiscardChanges } from './clients-panel.js?v=20260728q';

/** Injected by os-map-loader via initRulesPanel(). */
let shell = {};

export function initRulesPanel(deps) {
  shell = deps;
}

// ---- extracted from os-map-loader.js:8260-8914 ----
let ruleState = {
  rules: [],
  notifyOnUnmatched: true,
  storage: 'files',
  search: '',
  activeId: null,
  dirty: false,
};

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
  root.innerHTML = '<div class="de-loading">Loading rules…</div>';
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
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ch-list-item${activeId === rule.id ? ' active' : ''}${rule.enabled === false || isRuleExpired(rule) ? ' re-list-disabled' : ''}`;
  btn.dataset.id = rule.id;
  btn.innerHTML = `
    <span class="ch-item-row">
      <span class="ch-item-title">${escHtml(rule.title || rule.status)}</span>
      <span class="ch-item-date">${escHtml(formatChatDate(rule.updatedAt || rule.createdAt))}</span>
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

function renderRulesEditor() {
  const root = getRuleEditor();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll(root);
  const { rules, activeId, notifyOnUnmatched, storage } = ruleState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const ordered = [...rules]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .filter((rule) =>
      matchesListSearch(ruleState.search, rule.title, rule.status, ruleSubline(rule), rule.description),
    );

  const subheader = listSearchSubheader({
    itemCount: rules.length,
    search: {
      value: ruleState.search,
      placeholder: `Search ${rules.length} ${rules.length === 1 ? 'Rule' : 'Rules'}`,
      onInput: (value) => {
        ruleState.search = value;
        renderRulesEditor();
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
  for (const rule of ordered) {
    list.appendChild(createRuleSwipeRow(rule, activeId));
  }
  if (ordered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = ruleState.search.trim() ? 'No matches.' : 'No rules yet.';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  if (activeId) {
    renderRuleEditPane(pane);
    shell.mountCreateDrawerChrome(pane);
  } else {
    shell.clearEditorFooterSave();
    shell.appendEmptyDetailPane(pane, {
      mapKey: 'rules',
      iconName: 'zap',
      bodyHtml: '<p>Select a rule to edit, or create a new one.</p>',
      onCreate: () => void startNewRule(),
    });
  }
  root.appendChild(pane);
  flushTitleFocus('rules');
  shell.finishSidebarListScroll(root, savedSidebarScroll);
}

async function openRuleEditor(id) {
  await flushRuleAutosave();
  if (ruleState.dirty && ruleState.activeId && ruleState.activeId !== id) {
    if (!(await confirmDiscardChanges())) return;
  }
  ruleState.activeId = id;
  ruleState.dirty = false;
  if (!shell.isCreateDrawerOpen('rules')) getRuleEditor()?.classList.add('de-pane-active');
  renderRulesEditor();
}

async function closeRuleEditor(checkDirty = true) {
  await flushRuleAutosave();
  if (checkDirty && ruleState.dirty && !(await confirmDiscardChanges())) return;
  ruleState.activeId = null;
  ruleState.dirty = false;
  shell.clearEditorFooterSave();
  getRuleEditor()?.classList.remove('de-pane-active');
  renderRulesEditor();
}

function renderRuleEditPane(pane) {
  const rule = ruleState.rules.find((r) => r.id === ruleState.activeId);
  if (!rule) {
    pane.innerHTML = '<div class="de-loading de-error">Rule not found.</div>';
    return;
  }

  const agentBtn = document.createElement('button');
  agentBtn.type = 'button';
  agentBtn.className = 'de-new-btn em-agent-btn em-header-action-btn';
  agentBtn.setAttribute('aria-label', 'Agent');
  agentBtn.title = 'Agent';
  agentBtn.innerHTML = shell.navIcon('agent', 16);
  agentBtn.addEventListener('click', () => askAgentAboutRule(rule));

  const inDrawer = shell.isCreateDrawerOpen('rules');
  const header = createPaneSubheader({
    back: inDrawer ? null : { label: 'Back to rules', onClick: () => closeRuleEditor() },
    title: rule.title || rule.status || 'Rule',
    subtitle: rule.status || '',
    beforeIcons: [agentBtn],
    icons: inDrawer
      ? []
      : [
          paneDeleteIcon({
            label: 'Delete rule',
            onClick: () => deleteRule(rule.id),
          }),
        ],
  }).header;
  pane.appendChild(header);

  const form = document.createElement('div');
  form.className = 're-form-scroll';

  const titleIn = document.createElement('input');
  titleIn.className = 'de-input';
  titleIn.type = 'text';
  titleIn.value = rule.title || '';
  titleIn.addEventListener('input', () => { ruleState.dirty = true; });
  requestTitleFocus('rules', titleIn);

  const statusIn = document.createElement('input');
  statusIn.className = 'de-input';
  statusIn.type = 'text';
  statusIn.value = rule.status || '';
  statusIn.placeholder = 'DOWN, RECEIPT, …';
  statusIn.addEventListener('input', () => { ruleState.dirty = true; });

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
  bindRuleAutosave(rule, ruleInputs);
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
    dateEl.textContent = formatChatDate(when);
  }
  const subEl = item.querySelector('.de-item-slug');
  if (subEl && rule) subEl.textContent = ruleSubline(rule);
  item.classList.toggle('re-list-disabled', rule?.enabled === false || isRuleExpired(rule));
}

function bindRuleAutosave(rule, inputs) {
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

  ruleAutosaveFlush = flush;
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
        await flushRuleAutosave();
        shell.finishCreateDrawer();
        getRuleEditor()?.classList.add('de-pane-active');
        renderRulesEditor();
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
