/**
 * Email triage Lab — rule generator. Typed email fields filter the
 * keyword-rule list; live-test (POST /api/email/simulate rulesOnly)
 * still highlights the first match.
 */
import {
  iosIcon,
  listSearchSubheader,
  createSlidingPillSelect,
  matchesListSearch,
} from './admin-ui.js?v=20260812f';
import { escHtml, showPersonal } from './shared.js?v=20260810a';
import { osAlert } from './os-dialog.js?v=20260815a';

/** Mirror of src/lib/emailBody.looksLikeHtml for client-side preview. */
function looksLikeHtml(text) {
  const t = String(text || '').trimStart();
  if (!t) return false;
  if (/^<!DOCTYPE\s/i.test(t) || /^<html[\s>]/i.test(t)) return true;
  return /^<[a-z!/]/i.test(t) && /<\/[a-z][^>]*>/i.test(t);
}

function resolveLabHtml(html, text) {
  const fromHtml = String(html || '').trim();
  if (fromHtml) return fromHtml;
  const fromText = String(text || '').trim();
  return looksLikeHtml(fromText) ? fromText : '';
}

/** True for HTML markup or minified CSS dumps that are useless as “plain text”. */
function looksLikeMarkupBlob(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (looksLikeHtml(t)) return true;
  const punct = (t.match(/[{};]/g) || []).length;
  if (punct >= 20 && /[{}]/.test(t)) return true;
  // Long unbroken lines = minified source, not readable prose.
  if (t.length > 1500 && (t.match(/\S{120,}/g) || []).length > 0) return true;
  return false;
}

/** Mirror of src/lib/emailBody.htmlToPlainText — keep in sync. */
function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function plainTextForLab(text, html) {
  const raw = String(text || '').trim();
  if (raw && !looksLikeHtml(raw) && !looksLikeMarkupBlob(raw)) return raw;
  return htmlToPlainText(html || raw) || raw;
}

function normalizeTargetPhrase(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

const LAB_PROCESS_OPTIONS = [
  { value: 'delete', label: 'Delete' },
  { value: 'archive', label: 'Archive' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'classify', label: 'Keep' },
];

function labProcessIsSilent(process) {
  return process === 'delete' || process === 'archive' || process === 'receipt';
}

function labStatusForProcess(process) {
  if (process === 'delete') return 'DELETE';
  if (process === 'archive') return 'AUTO_ARCHIVED';
  if (process === 'receipt') return 'RECEIPT';
  return 'CUSTOM';
}

/** Display label for a rule match field (SQL-ish). */
function ruleFieldLabel(field) {
  if (field === 'from') return 'sender';
  return String(field || '').trim() || 'body';
}

/** Bracket a phrase list: `['a', 'b', +3]`. */
function formatRulePhraseList(phrases, max = 4) {
  const list = (Array.isArray(phrases) ? phrases : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  if (!list.length) return '[]';
  const shown = list.slice(0, max).map((p) => `'${p}'`);
  const tail = list.length > max ? `, +${list.length - max}` : '';
  return `[${shown.join(', ')}${tail}]`;
}

/**
 * SQL-ish WHEN line for a keyword rule card.
 * Reflects live matching: phrases/except share the selected fields haystack.
 * e.g. `When sender IS ['a@b.com'] AND NOT ['unsubscribe']`
 *      `When (subject OR body) CONTAINS ANY ['otp', 'login code', +3]`
 */
export function formatRuleWhenClause(rule) {
  const fields = (rule?.fields?.length ? rule.fields : ['subject', 'body']).map(ruleFieldLabel);
  const fieldExpr = fields.length === 1 ? fields[0] : `(${fields.join(' OR ')})`;
  const phrases = (rule?.phrases || []).map((p) => String(p || '').trim()).filter(Boolean);
  const except = (rule?.exceptPhrases || []).map((p) => String(p || '').trim()).filter(Boolean);
  const allMode = rule?.matchMode === 'all';

  let positive;
  if (!phrases.length) {
    positive = `${fieldExpr} (no phrases)`;
  } else if (!allMode && fields.length === 1 && fields[0] === 'sender' && phrases.length === 1) {
    positive = `sender IS ${formatRulePhraseList(phrases, 1)}`;
  } else if (!allMode && phrases.length === 1) {
    positive = `${fieldExpr} ${formatRulePhraseList(phrases, 1)}`;
  } else {
    positive = `${fieldExpr} CONTAINS ${allMode ? 'ALL' : 'ANY'} ${formatRulePhraseList(phrases)}`;
  }

  const parts = [`When ${positive}`];
  if (except.length) {
    parts.push(
      fields.length === 1
        ? `AND NOT ${fields[0]} ${formatRulePhraseList(except)}`
        : `AND NOT ${formatRulePhraseList(except)}`,
    );
  }
  return parts.join(' ');
}

/** What the rule actually does to matched mail (not notification button chrome). */
export function formatRuleProcessLabel(rule) {
  const status = String(rule?.status || '').toUpperCase();
  if (status === 'DELETE' || status === 'JUNK') return 'Delete';
  if (status === 'AUTO_ARCHIVED') return 'Archive';
  if (status === 'RECEIPT') return 'Receipt';
  const push = rule?.notifyPush != null ? !!rule.notifyPush : !!rule.notify;
  const dashboard = rule?.notifyDashboard != null ? !!rule.notifyDashboard : !!rule.notify;
  if (!push && !dashboard) return 'Silent';
  const bits = [];
  if (push) bits.push('Push');
  if (dashboard) bits.push('Dashboard');
  return bits.join('+') || 'Silent';
}

/** Scope · process · notify/silent meta under the WHEN clause. */
export function formatRuleLabMeta(rule) {
  const scope = rule?.scope === 'universal' ? 'Universal' : 'Personal';
  const status = String(rule?.status || '').trim();
  const derived = /^(DELETE|JUNK|AUTO_ARCHIVED|RECEIPT|CUSTOM)$/i.test(status);
  const bits = [];
  if (scope === 'Universal' || showPersonal()) bits.push(scope);
  if (status && !derived) bits.push(status);
  bits.push(formatRuleProcessLabel(rule));
  if (rule?.enabled === false) bits.push('Off');
  return bits.join(' · ');
}

/** Fixed downstream stages (production order) — not user-reorderable. */
export const PIPELINE_FUNCTIONS = [
  { id: 'normalize', label: 'Normalize message', sub: 'Body · attachments · OTP extract' },
  { id: 'rules', label: 'Keyword rules', sub: 'First match wins · sort order' },
  { id: 'agent_else', label: 'Agent (else)', sub: 'No match → agent handles this mail' },
  { id: 'contact', label: 'Resolve sender', sub: 'Contacts · client kind · open jobs' },
  { id: 'ai', label: 'AI classify / triage', sub: 'Agent-first or rules-first' },
  { id: 'override', label: 'Receipt / OTP overrides', sub: 'Money heuristics · auth links' },
  { id: 'project_reply', label: 'Project reply detect', sub: 'Thread / subject match' },
  { id: 'meeting', label: 'Meeting automation', sub: 'Follow-up · auto-book · conflict' },
  { id: 'project', label: 'Project automation', sub: 'Match · auto-create' },
  { id: 'persist', label: 'Inbox + notify', sub: 'Push · agent alerts · dashboard' },
];

/**
 * @param {object} deps
 * @param {() => object} deps.getRuleState
 * @param {() => HTMLElement | null} deps.getRuleEditor
 * @param {() => Promise<void>} deps.reloadRules
 * @param {(ruleId: string) => void | Promise<void>} deps.toggleRuleEditor
 * @param {(container: HTMLElement) => void} deps.renderRuleForm
 * @param {() => string | null} deps.getActiveRuleId
 * @param {() => void | Promise<void>} [deps.startNewRule]
 * @param {(draft: object) => Promise<object | null | void>} [deps.createRuleFromLab]
 * @param {() => Promise<void>} [deps.flushRuleAutosave]
 * @param {() => string} [deps.inboundAddressExample]
 */
export function createEmailTriageLab(deps) {
  const state = {
    from: '',
    fromName: '',
    to: '',
    cc: '',
    subject: '',
    text: '',
    /** Sanitized HTML body when loaded from inbox (or pasted markup). */
    html: '',
    /** Body pane: render HTML when available, else edit source. */
    bodyMode: /** @type {'preview' | 'source'} */ ('source'),
    attachments: /** @type {{ id: string, filename: string, contentType: string, size: number }[]} */ ([]),
    skipGates: true,
    /** Local rule id order for live test (may differ from saved until Save order). */
    ruleOrder: /** @type {string[]} */ ([]),
    contacts: /** @type {{ uid: string, name: string, email?: string }[]} */ ([]),
    contactQuery: '',
    dirtyOrder: false,
    inboundExample: '',
    /** Bumps to ignore stale contact-fetch opens after dismiss/select. */
    suggestGen: 0,
    suggestOpen: false,
    _suggestOutsideBound: null,
    /** Inbox email id when compose was loaded from a notification / deep link. */
    sourceEmailId: null,
    /** Live-test debounce / in-flight generation. */
    liveTimer: null,
    liveGen: 0,
    liveStatus: /** @type {'idle' | 'running' | 'match' | 'nomatch' | 'error'} */ ('idle'),
    liveError: '',
    liveMatchRuleId: /** @type {string | null} */ (null),
    liveMatchIndex: 0,
    liveMatchWhen: '',
    liveMatchMeta: '',
    ruleTitle: '',
    rulePhrases: '',
    ruleProcess: 'delete',
    ruleNotifyPush: false,
    ruleNotifyDashboard: false,
    ruleMatchMode: /** @type {'any' | 'all'} */ ('any'),
    ruleExcept: '',
    ruleFields: /** @type {string[]} */ ([]),
    /** User edited the draft — don't overwrite on the next no-match. */
    draftTouched: false,
    creatingRule: false,
  };

  const LIVE_DEBOUNCE_MS = 500;
  const LIVE_SPIN_MIN_MS = 600;

  function inboundExample() {
    return (
      state.inboundExample ||
      deps.inboundAddressExample?.() ||
      'inbox@inbound.example.com'
    );
  }

  function ruleState() {
    return deps.getRuleState();
  }

  function syncRuleOrderFromState() {
    const rules = [...(ruleState().rules || [])].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    const ids = rules.map((r) => r.id);
    if (!state.ruleOrder.length) {
      state.ruleOrder = ids;
      return;
    }
    // Keep dragged order; append new rules; drop deleted.
    const keep = state.ruleOrder.filter((id) => ids.includes(id));
    for (const id of ids) {
      if (!keep.includes(id)) keep.push(id);
    }
    state.ruleOrder = keep;
  }

  function orderedRules() {
    const byId = new Map((ruleState().rules || []).map((r) => [r.id, r]));
    return state.ruleOrder.map((id) => byId.get(id)).filter(Boolean);
  }

  function composeFilterTokens() {
    const raw = [state.fromName, fromEmailValue(), state.subject, state.text]
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .join(' ');
    if (!raw) return [];
    const tokens = new Set();
    for (const part of raw.split(/[\s,;<>/"']+/)) {
      const t = part.trim().toLowerCase();
      if (t.length >= 3) tokens.add(t);
      const at = t.match(/^([^@]+)@(.+)$/);
      if (at) {
        if (at[1].length >= 3) tokens.add(at[1]);
        if (at[2].length >= 3) tokens.add(at[2]);
      }
    }
    return [...tokens];
  }

  function ruleSearchHaystack(rule) {
    return [
      rule.title,
      rule.status,
      rule.description,
      formatRuleWhenClause(rule),
      formatRuleLabMeta(rule),
      rule.scope === 'universal' ? 'Universal' : showPersonal() ? 'Personal' : '',
      rule.forwardTo,
      rule.notify ? 'Notify' : 'Silent',
      ...(rule.phrases || []),
      ...(rule.exceptPhrases || []),
    ];
  }

  function ruleMatchesComposeFilter(rule) {
    const tokens = composeFilterTokens();
    if (!tokens.length) return true;
    const emailHay = [state.fromName, fromEmailValue(), state.subject, state.text]
      .join(' ')
      .toLowerCase();
    const phrases = (rule.phrases || [])
      .map((p) => String(p || '').trim().toLowerCase())
      .filter((p) => p.length >= 2);
    if (phrases.some((p) => emailHay.includes(p))) return true;
    const ruleHay = ruleSearchHaystack(rule).filter(Boolean).join(' ').toLowerCase();
    return tokens.some((t) => ruleHay.includes(t));
  }

  function isRulesFilterActive() {
    const rs = ruleState();
    return (
      Boolean(String(rs.search || '').trim()) ||
      (rs.scopeFilter && rs.scopeFilter !== 'all') ||
      composeFilterTokens().length > 0
    );
  }

  function ruleMatchesLabFilter(rule) {
    if (!rule) return false;
    const rs = ruleState();
    // Keep the open accordion visible while filtering.
    if (rs.activeId != null && String(rule.id) === String(rs.activeId)) return true;
    if (rs.scopeFilter === 'universal' && rule.scope !== 'universal') return false;
    if (rs.scopeFilter === 'personal' && rule.scope === 'universal') return false;
    if (!ruleMatchesComposeFilter(rule)) return false;
    return matchesListSearch(rs.search, ...ruleSearchHaystack(rule));
  }

  function applyRulesFilter(root = deps.getRuleEditor()) {
    if (!root) return;
    const rs = ruleState();
    const searchInput = root.querySelector('.re-lab-rules-filter .panel-list-search');
    if (searchInput instanceof HTMLInputElement) {
      rs.search = searchInput.value;
    }
    const cards = [...root.querySelectorAll('.re-lab-pipe-card--rule')];
    let visible = 0;
    for (const card of cards) {
      const rule = orderedRules().find((r) => String(r.id) === String(card.dataset.ruleId));
      const show = ruleMatchesLabFilter(rule);
      card.hidden = !show;
      card.classList.toggle('re-lab-pipe-card--filtered-out', !show);
      if (show) visible += 1;
    }
    const empty = root.querySelector('[data-lab-rules-empty]');
    if (empty) {
      empty.hidden = visible > 0;
      empty.textContent = isRulesFilterActive() ? 'No matching rules.' : 'No rules yet.';
    }
    const filterActive = isRulesFilterActive();
    root.querySelectorAll('.re-lab-pipe-card--rule .re-lab-grip').forEach((grip) => {
      const locked = grip.closest('.re-lab-pipe-card')?.dataset.locked === '1';
      grip.disabled = filterActive || locked;
      grip.title = locked
        ? 'Catalog rule order comes from the repo'
        : filterActive
          ? 'Clear filter to reorder'
          : 'Drag to reorder';
    });
    if (searchInput instanceof HTMLInputElement) {
      const n = orderedRules().length;
      searchInput.placeholder = `Search ${n} ${n === 1 ? 'Rule' : 'Rules'}`;
    }
  }

  function bindRulesFilterInput(input, root) {
    if (!(input instanceof HTMLInputElement) || input.dataset.labRulesFilterBound === '1') return;
    input.dataset.labRulesFilterBound = '1';
    const run = () => {
      ruleState().search = input.value;
      applyRulesFilter(root);
    };
    input.addEventListener('input', run);
    input.addEventListener('change', run);
    input.addEventListener('search', run);
  }

  async function ensureContacts(q = '') {
    try {
      const url = q.trim()
        ? `/api/clients?q=${encodeURIComponent(q.trim())}&limit=40`
        : '/api/clients?limit=80';
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      state.contacts = (data.clients || [])
        .filter((c) => c.email)
        .map((c) => ({
          uid: c.uid,
          name: c.name || c.email,
          email: c.email,
        }));
    } catch {
      state.contacts = [];
    }
  }

  function readForm(root) {
    const from = root.querySelector('[data-lab-from]')?.value?.trim() || '';
    const fromName = root.querySelector('[data-lab-from-name]')?.value?.trim() || '';
    state.from = fromName && from ? `${fromName} <${from}>` : from;
    state.fromName = fromName;
    state.to = root.querySelector('[data-lab-to]')?.value?.trim() || '';
    state.subject = root.querySelector('[data-lab-subject]')?.value || '';
    const bodyIn = root.querySelector('[data-lab-body]');
    // Preview hides the textarea — don't clobber html/text from an empty field.
    if (bodyIn && bodyIn.offsetParent !== null) {
      const bodyVal = bodyIn.value || '';
      state.text = bodyVal;
      if (looksLikeHtml(bodyVal)) state.html = bodyVal;
    }
    const modeBtn = root.querySelector('[data-lab-body-mode].is-active');
    if (modeBtn?.dataset.labBodyMode === 'preview' || modeBtn?.dataset.labBodyMode === 'source') {
      state.bodyMode = modeBtn.dataset.labBodyMode;
    }
    state.skipGates = Boolean(root.querySelector('[data-lab-skip-gates]')?.checked);
    const titleIn = root.querySelector('[data-lab-rule-title]');
    if (titleIn instanceof HTMLInputElement) {
      state.ruleTitle = titleIn.value.trim();
    }
    const phrasesIn = root.querySelector('[data-lab-rule-phrases]');
    if (phrasesIn instanceof HTMLTextAreaElement || phrasesIn instanceof HTMLInputElement) {
      state.rulePhrases = phrasesIn.value;
    }
    const exceptIn = root.querySelector('[data-lab-rule-except]');
    if (exceptIn instanceof HTMLTextAreaElement || exceptIn instanceof HTMLInputElement) {
      state.ruleExcept = exceptIn.value;
    }
    const matchSel = root.querySelector('[data-lab-rule-match]');
    if (matchSel instanceof HTMLSelectElement && (matchSel.value === 'all' || matchSel.value === 'any')) {
      state.ruleMatchMode = matchSel.value;
    }
    const processSel = root.querySelector('[data-lab-rule-process]');
    if (processSel instanceof HTMLInputElement && processSel.value) {
      state.ruleProcess = processSel.value;
    }
    const pushCb = root.querySelector('[data-lab-rule-push]');
    const dashCb = root.querySelector('[data-lab-rule-dash]');
    if (pushCb instanceof HTMLInputElement) state.ruleNotifyPush = pushCb.checked;
    if (dashCb instanceof HTMLInputElement) state.ruleNotifyDashboard = dashCb.checked;
    state.ruleFields = selectedRuleFields(root);
  }

  function selectedRuleFields(root) {
    const fields = [];
    root?.querySelectorAll('[data-lab-rule-field]').forEach((cb) => {
      if (cb instanceof HTMLInputElement && cb.checked) fields.push(cb.value);
    });
    return fields.length ? fields : state.ruleFields.length ? state.ruleFields : ['body'];
  }

  function fromEmailValue() {
    return state.from.match(/<([^>]+)>/)?.[1]?.trim() || state.from.trim();
  }

  function phraseLines(raw) {
    return String(raw || '')
      .split('\n')
      .map((s) => normalizeTargetPhrase(s))
      .filter((s) => s.length >= 2);
  }

  function hasTestableContent() {
    return Boolean(fromEmailValue() || state.fromName.trim() || state.subject.trim() || state.text.trim());
  }

  function draftFromEmail() {
    const fromEmail = fromEmailValue();
    const subject = state.subject.trim();
    const body = state.text.trim();
    const phrases = [];
    const fields = [];
    if (fromEmail) {
      phrases.push(fromEmail);
      fields.push('from');
    }
    if (subject) {
      phrases.push(subject);
      fields.push('subject');
    }
    if (body) {
      fields.push('body');
      const snippet = body
        .split('\n')
        .map((s) => s.trim())
        .find(Boolean);
      if (snippet && snippet.length <= 80) phrases.push(snippet);
    }
    const titleSource = subject || fromEmail || phrases[0] || '';
    return {
      title: titleSource.length > 48 ? `${titleSource.slice(0, 47)}…` : titleSource,
      phrases,
      fields: fields.length ? fields : ['body'],
      matchMode: phrases.length > 1 ? 'all' : 'any',
    };
  }

  function applyDraftFromEmail(root) {
    const draft = draftFromEmail();
    state.ruleTitle = draft.title;
    state.rulePhrases = draft.phrases.join('\n');
    state.ruleFields = draft.fields;
    state.ruleMatchMode = draft.matchMode;
    if (!root) return;
    const titleIn = root.querySelector('[data-lab-rule-title]');
    if (titleIn instanceof HTMLInputElement) titleIn.value = state.ruleTitle;
    const phrasesIn = root.querySelector('[data-lab-rule-phrases]');
    if (phrasesIn instanceof HTMLTextAreaElement) phrasesIn.value = state.rulePhrases;
    const matchSel = root.querySelector('[data-lab-rule-match]');
    if (matchSel instanceof HTMLSelectElement) matchSel.value = state.ruleMatchMode;
    root.querySelectorAll('[data-lab-rule-field]').forEach((cb) => {
      if (cb instanceof HTMLInputElement) cb.checked = draft.fields.includes(cb.value);
    });
  }

  function liveResultHtml() {
    if (state.liveStatus === 'match') {
      const when = state.liveMatchWhen || 'keyword rule';
      const meta = state.liveMatchMeta ? ` · ${state.liveMatchMeta}` : '';
      return `<div class="re-lab-outcome re-lab-outcome--ok" data-lab-live-result aria-live="polite">
        <strong>Rule ${escHtml(String(state.liveMatchIndex))} match — ${escHtml(when)}</strong>
        <span>${escHtml(meta.replace(/^ · /, ''))}</span>
      </div>`;
    }
    if (state.liveStatus === 'error') {
      return `<div class="re-lab-outcome re-lab-outcome--blocked" data-lab-live-result aria-live="polite">
        <strong>Could not test</strong>
        <span>${escHtml(state.liveError || 'Try again')}</span>
      </div>`;
    }
    return `<div class="re-lab-outcome re-lab-outcome--idle" data-lab-live-result hidden></div>`;
  }

  function applyLiveResult(root = deps.getRuleEditor()) {
    if (!root) return;
    const banner = root.querySelector('[data-lab-live-result]');
    if (banner) {
      const wrap = document.createElement('div');
      wrap.innerHTML = liveResultHtml();
      banner.replaceWith(wrap.firstElementChild);
    }
    const spin = root.querySelector('[data-lab-live-spin]');
    if (spin) spin.hidden = state.liveStatus !== 'running' && !state.liveTimer;
    const draft = root.querySelector('[data-lab-rule-draft]');
    if (draft) draft.hidden = state.liveStatus !== 'nomatch';
    const matchedId = state.liveMatchRuleId;
    root.querySelectorAll('.re-lab-pipe-card--rule').forEach((card) => {
      const hit = Boolean(matchedId && card.dataset.ruleId === String(matchedId));
      card.classList.toggle('re-lab-pipe-card--matched', hit);
      card.classList.toggle('re-lab-pipe-card--hit', hit);
    });
    const elseCard = root.querySelector('.re-lab-pipe-card--else');
    if (elseCard) elseCard.classList.remove('re-lab-pipe-card--matched');
    if (state.liveStatus === 'match' && matchedId) {
      const hit = root.querySelector(`.re-lab-pipe-card--rule[data-rule-id="${CSS.escape(String(matchedId))}"]`);
      hit?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function scheduleLiveTest() {
    if (state.liveTimer) {
      clearTimeout(state.liveTimer);
      state.liveTimer = null;
    }
    state.liveTimer = setTimeout(() => {
      state.liveTimer = null;
      void runLiveTest();
    }, LIVE_DEBOUNCE_MS);
  }

  function bindLiveTestField(el, root) {
    if (!el || el.dataset.labLiveBound === '1') return;
    el.dataset.labLiveBound = '1';
    const sync = () => {
      if (root) {
        readForm(root);
        applyRulesFilter(root);
      }
      scheduleLiveTest();
    };
    el.addEventListener('input', sync);
    el.addEventListener('change', sync);
  }

  function resetLiveState() {
    state.liveStatus = 'idle';
    state.liveError = '';
    state.liveMatchRuleId = null;
    state.liveMatchIndex = 0;
    state.liveMatchWhen = '';
    state.liveMatchMeta = '';
  }

  async function createRuleFromCompose() {
    const root = deps.getRuleEditor();
    if (!root || state.creatingRule) return;
    readForm(root);
    const phrases = phraseLines(state.rulePhrases);
    if (!phrases.length) {
      await osAlert('Add at least one phrase to match.');
      return;
    }
    const process = state.ruleProcess || 'delete';
    const silent = labProcessIsSilent(process);
    const title =
      state.ruleTitle.trim() ||
      (phrases[0].length > 48 ? `${phrases[0].slice(0, 47)}…` : phrases[0]);
    state.creatingRule = true;
    const btn = root.querySelector('[data-lab-create-rule]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creating…';
    }
    try {
      await deps.createRuleFromLab?.({
        title,
        status: labStatusForProcess(process),
        scope: 'personal',
        description: '',
        phrases,
        exceptPhrases: String(state.ruleExcept || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        matchMode: phrases.length > 1 ? state.ruleMatchMode || 'all' : 'any',
        fields: selectedRuleFields(root),
        notify: silent ? false : state.ruleNotifyPush || state.ruleNotifyDashboard,
        notifyPush: silent ? false : !!state.ruleNotifyPush,
        notifyDashboard: silent ? false : !!state.ruleNotifyDashboard,
        notifyActions: ['view', 'archive'],
        enabled: true,
        expiresAt: null,
      });
      state.draftTouched = false;
      scheduleLiveTest();
    } catch (e) {
      await osAlert(`Could not create rule: ${e.message}`);
    } finally {
      state.creatingRule = false;
      const next = deps.getRuleEditor()?.querySelector('[data-lab-create-rule]');
      if (next) {
        next.disabled = false;
        next.textContent = 'Create Rule';
      }
    }
  }

  function loadFromInboxEmail(record) {
    if (!record || typeof record !== 'object') return;
    const rawFrom = String(record.from || '').trim();
    const angle = rawFrom.match(/^(.*?)\s*<([^>]+)>\s*$/);
    let fromName = '';
    let fromEmail = rawFrom;
    if (angle) {
      fromName = angle[1].replace(/^["']|["']$/g, '').trim();
      fromEmail = angle[2].trim();
    }
    state.fromName = fromName;
    state.from = fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail;
    const toRaw = record.to;
    state.to = Array.isArray(toRaw)
      ? toRaw.map(String).filter(Boolean).join(', ')
      : String(toRaw || state.to || inboundExample()).trim();
    const ccRaw = record.cc;
    state.cc = Array.isArray(ccRaw)
      ? ccRaw.map(String).filter(Boolean).join(', ')
      : String(ccRaw || '').trim();
    state.subject = String(record.subject || '');
    const text = String(
      record.bodyText || record.text || record.bodySnippet || record.summary || '',
    );
    const html = resolveLabHtml(record.bodyHtml || record.html || '', text);
    state.html = html;
    state.text = plainTextForLab(text, html);
    state.bodyMode = 'source';
    state.draftTouched = false;
    state.ruleTitle = '';
    state.rulePhrases = '';
    state.ruleExcept = '';
    state.ruleFields = [];
    state.attachments = Array.isArray(record.attachments)
      ? record.attachments.map((a, i) => ({
          id: String(a.id || `att-${i}`),
          filename: String(a.filename || a.name || `file-${i + 1}`),
          contentType: String(a.contentType || a.content_type || 'application/octet-stream'),
          size: Number(a.size) || 0,
        }))
      : [];
    state.skipGates = true;
    state.sourceEmailId = String(record.id || '').trim() || null;
    resetLiveState();
  }

  async function runLiveTest() {
    const root = deps.getRuleEditor();
    if (!root) return;
    readForm(root);
    if (!hasTestableContent()) {
      resetLiveState();
      applyLiveResult(root);
      return;
    }
    const gen = ++state.liveGen;
    state.liveStatus = 'running';
    applyLiveResult(root);
    const started = Date.now();
    try {
      await deps.flushRuleAutosave?.();
      const from = fromEmailValue() || 'sender@example.com';
      const res = await fetch('/api/email/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: state.from || from,
          to: state.to,
          cc: state.cc,
          subject: state.subject,
          text: state.text,
          html: state.html || undefined,
          attachments: state.attachments,
          ruleOrder: state.ruleOrder,
          skipGates: true,
          rulesOnly: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const wait = LIVE_SPIN_MIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (gen !== state.liveGen) return;
      state.inboundExample = data.inboundAddressExample || state.inboundExample;
      const evals = Array.isArray(data.ruleEvaluations) ? data.ruleEvaluations : [];
      const hit = evals.find((e) => e.outcome === 'matched');
      const hitId = data.matchedRuleId || hit?.rule?.id || null;
      const rules = orderedRules();
      const idx = hitId ? rules.findIndex((r) => String(r.id) === String(hitId)) : -1;
      const rule = idx >= 0 ? rules[idx] : null;
      if (rule) {
        state.liveStatus = 'match';
        state.liveMatchRuleId = String(rule.id);
        state.liveMatchIndex = idx + 1;
        state.liveMatchWhen = formatRuleWhenClause(rule);
        state.liveMatchMeta = formatRuleLabMeta(rule);
        state.liveError = '';
      } else {
        state.liveStatus = 'nomatch';
        state.liveMatchRuleId = null;
        state.liveMatchIndex = 0;
        state.liveMatchWhen = '';
        state.liveMatchMeta = '';
        state.liveError = '';
        if (!state.draftTouched) applyDraftFromEmail(root);
      }
      applyLiveResult(root);
    } catch (e) {
      const wait = LIVE_SPIN_MIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (gen !== state.liveGen) return;
      state.liveStatus = 'error';
      state.liveError = e instanceof Error ? e.message : String(e);
      state.liveMatchRuleId = null;
      applyLiveResult(root);
    }
  }

  async function persistRuleOrder() {
    await deps.flushRuleAutosave?.();
    try {
      const res = await fetch('/api/email/rules/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: state.ruleOrder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      state.dirtyOrder = false;
      await deps.reloadRules();
      syncRuleOrderFromState();
      const root = deps.getRuleEditor();
      if (root) renderLabShell(root, { preserveForm: true });
      scheduleLiveTest();
    } catch (e) {
      await osAlert(`Could not save rule order: ${e.message}`);
    }
  }

  function syncExpandedRule(root = deps.getRuleEditor()) {
    if (!root) return;
    const activeId = deps.getActiveRuleId?.() ?? null;
    root.querySelectorAll('.re-lab-pipe-card--rule').forEach((card) => {
      const open = Boolean(activeId && card.dataset.ruleId === String(activeId));
      card.classList.toggle('re-lab-pipe-card--open', open);
      const toggle = card.querySelector('.re-lab-pipe-card-toggle');
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      const bodyEl = card.querySelector('.re-lab-pipe-card-body');
      if (!bodyEl) return;
      if (open) {
        if (bodyEl.dataset.mounted !== '1') {
          bodyEl.innerHTML = '';
          deps.renderRuleForm(bodyEl);
          bodyEl.dataset.mounted = '1';
        }
        bodyEl.hidden = false;
        requestAnimationFrame(() => {
          card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      } else {
        bodyEl.hidden = true;
        if (bodyEl.dataset.mounted === '1') {
          bodyEl.innerHTML = '';
          delete bodyEl.dataset.mounted;
        }
      }
    });
    applyRulesFilter(root);
  }

  function attachRuleReorder(listEl) {
    let dragEl = null;
    let moved = false;

    listEl.querySelectorAll('.re-lab-grip').forEach((grip) => {
      grip.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (isRulesFilterActive() || grip.disabled) return;
        const row = grip.closest('.re-lab-pipe-card');
        if (!row || row.dataset.locked === '1' || row.hidden) return;
        dragEl = row;
        moved = false;
        row.classList.add('re-lab-dragging');
        grip.setPointerCapture(ev.pointerId);

        const onMove = (moveEv) => {
          if (!dragEl) return;
          moved = true;
          const siblings = [...listEl.querySelectorAll(':scope > .re-lab-pipe-card')].filter(
            (n) => n !== dragEl && n.dataset.kind === 'rule',
          );
          for (const sib of siblings) {
            const rect = sib.getBoundingClientRect();
            if (moveEv.clientY < rect.top + rect.height / 2) {
              listEl.insertBefore(dragEl, sib);
              return;
            }
          }
          const lastRule = [...listEl.querySelectorAll(':scope > .re-lab-pipe-card[data-kind="rule"]')].pop();
          if (lastRule && lastRule !== dragEl) {
            lastRule.after(dragEl);
          }
        };

        const onUp = (upEv) => {
          grip.releasePointerCapture(upEv.pointerId);
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          dragEl?.classList.remove('re-lab-dragging');
          if (dragEl && moved) {
            const ids = [...listEl.querySelectorAll(':scope > .re-lab-pipe-card[data-kind="rule"]')].map(
              (el) => el.dataset.ruleId,
            );
            state.ruleOrder = ids.filter(Boolean);
            state.dirtyOrder = true;
            // Refresh priority numbers
            listEl.querySelectorAll(':scope > .re-lab-pipe-card[data-kind="rule"]').forEach((el, i) => {
              const pri = el.querySelector('.re-lab-pri');
              if (pri) pri.textContent = `#${i + 1}`;
            });
            const saveBtn = deps.getRuleEditor()?.querySelector('[data-lab-save-order]');
            if (saveBtn) {
              saveBtn.disabled = false;
              saveBtn.hidden = false;
            }
            scheduleLiveTest();
          }
          dragEl = null;
          moved = false;
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    });
  }

  function unbindSuggestOutside() {
    if (!state._suggestOutsideBound) return;
    document.removeEventListener('pointerdown', state._suggestOutsideBound, true);
    state._suggestOutsideBound = null;
  }

  function closeContactSuggestions(box) {
    state.suggestGen += 1;
    state.suggestOpen = false;
    if (box) {
      box.hidden = true;
      box.replaceChildren();
    }
    unbindSuggestOutside();
  }

  function bindSuggestOutside(box, wrap) {
    unbindSuggestOutside();
    state._suggestOutsideBound = (ev) => {
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (wrap.contains(t) || box.contains(t)) return;
      closeContactSuggestions(box);
    };
    document.addEventListener('pointerdown', state._suggestOutsideBound, true);
  }

  function renderContactSuggestions(box, input, wrap, gen) {
    if (gen !== state.suggestGen) return;
    const q = (input.value || '').trim().toLowerCase();
    const matches = state.contacts
      .filter(
        (c) =>
          !q ||
          c.email?.toLowerCase().includes(q) ||
          c.name?.toLowerCase().includes(q),
      )
      .slice(0, 8);
    box.replaceChildren();
    if (!matches.length) {
      closeContactSuggestions(box);
      return;
    }
    state.suggestOpen = true;
    box.hidden = false;
    bindSuggestOutside(box, wrap);
    for (const c of matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 're-lab-suggest';
      btn.innerHTML = `<strong>${escHtml(c.name)}</strong><span>${escHtml(c.email)}</span>`;
      // pointerdown + preventDefault: avoid input blur/refocus races; label must
      // not wrap this button or a pick re-focuses From and reopens the list.
      btn.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const nameIn = deps.getRuleEditor()?.querySelector('[data-lab-from-name]');
        const emailIn = deps.getRuleEditor()?.querySelector('[data-lab-from]');
        if (nameIn) nameIn.value = c.name || '';
        if (emailIn) emailIn.value = c.email || '';
        closeContactSuggestions(box);
        emailIn?.blur();
        const labRoot = deps.getRuleEditor();
        if (labRoot) {
          readForm(labRoot);
          applyRulesFilter(labRoot);
        }
        scheduleLiveTest();
      });
      box.appendChild(btn);
    }
  }

  async function openContactSuggestions(box, input, wrap) {
    const gen = ++state.suggestGen;
    await ensureContacts(input.value);
    renderContactSuggestions(box, input, wrap, gen);
  }

  function renderLabShell(root, opts = {}) {
    closeContactSuggestions(root.querySelector('.re-lab-suggest-box'));
    const preserveForm = opts.preserveForm === true;
    let saved = null;
    if (preserveForm) {
      const bodyIn = root.querySelector('[data-lab-body]');
      const bodyVisible = Boolean(bodyIn && bodyIn.offsetParent !== null);
      const bodyVal = bodyVisible ? bodyIn.value || '' : state.text;
      let nextHtml = state.html;
      if (bodyVisible && looksLikeHtml(bodyVal)) nextHtml = bodyVal;
      const modeBtn = root.querySelector('[data-lab-body-mode].is-active');
      const bodyMode =
        modeBtn?.dataset.labBodyMode === 'preview' || modeBtn?.dataset.labBodyMode === 'source'
          ? modeBtn.dataset.labBodyMode
          : state.bodyMode;
      saved = {
        from: root.querySelector('[data-lab-from]')?.value || '',
        fromName: root.querySelector('[data-lab-from-name]')?.value || '',
        to: root.querySelector('[data-lab-to]')?.value || state.to,
        subject: root.querySelector('[data-lab-subject]')?.value || state.subject,
        text: bodyVal,
        html: nextHtml,
        bodyMode,
        skipGates: Boolean(root.querySelector('[data-lab-skip-gates]')?.checked ?? state.skipGates),
      };
      state.html = nextHtml;
      state.bodyMode = bodyMode;
    }

    syncRuleOrderFromState();
    root.innerHTML = '';
    root.classList.add('re-view-lab');
    root.classList.remove('re-view-flow', 're-view-list', 'de-pane-active');

    const shellEl = document.createElement('div');
    shellEl.className = 're-lab-shell';

    const toolbar = document.createElement('div');
    toolbar.className = 're-flow-toolbar';
    const left = document.createElement('div');
    left.className = 're-flow-toolbar-left';
    const hint = document.createElement('p');
    hint.className = 're-flow-hint';
    hint.textContent =
      'Type to filter rules · tap a rule to edit · drag to set priority · first match wins';
    left.appendChild(hint);
    toolbar.appendChild(left);

    const right = document.createElement('div');
    right.className = 're-flow-toolbar-right re-lab-toolbar-actions';
    const newRuleBtn = document.createElement('button');
    newRuleBtn.type = 'button';
    newRuleBtn.className = 'dash-panel-btn';
    newRuleBtn.dataset.labNewRule = '1';
    newRuleBtn.textContent = 'New rule';
    newRuleBtn.addEventListener('click', () => void deps.startNewRule?.());
    const saveOrder = document.createElement('button');
    saveOrder.type = 'button';
    saveOrder.className = 'dash-panel-btn';
    saveOrder.dataset.labSaveOrder = '1';
    saveOrder.textContent = 'Save rule order';
    saveOrder.hidden = !state.dirtyOrder;
    saveOrder.disabled = !state.dirtyOrder;
    saveOrder.addEventListener('click', () => void persistRuleOrder());
    right.append(newRuleBtn, saveOrder);
    toolbar.appendChild(right);
    shellEl.appendChild(toolbar);

    const body = document.createElement('div');
    body.className = 're-lab-body';

    // ── Compose (left column beside the pipeline) ──
    const compose = document.createElement('section');
    compose.className = 're-lab-compose';
    const spin = document.createElement('div');
    spin.className = 're-lab-live-spin';
    spin.dataset.labLiveSpin = '1';
    spin.hidden = state.liveStatus !== 'running';
    spin.innerHTML = '<span class="re-lab-spinner" aria-hidden="true"></span>';
    spin.setAttribute('aria-hidden', state.liveStatus === 'running' ? 'false' : 'true');
    compose.appendChild(spin);
    const composeHead = document.createElement('header');
    composeHead.className = 're-lab-section-head';
    composeHead.innerHTML = `<h2>Rule generator</h2>
      <p>Type into the template — matching rules filter on the right as you type.</p>`;
    compose.appendChild(composeHead);
    const liveBanner = document.createElement('div');
    liveBanner.innerHTML = liveResultHtml();
    compose.appendChild(liveBanner.firstElementChild);

    const form = document.createElement('div');
    form.className = 're-lab-form';

    const fromRow = document.createElement('div');
    fromRow.className = 're-lab-from-row';
    const nameWrap = document.createElement('label');
    nameWrap.className = 'de-label';
    nameWrap.textContent = 'From name';
    const nameIn = document.createElement('input');
    nameIn.className = 'de-input';
    nameIn.dataset.labFromName = '1';
    nameIn.placeholder = 'Optional';
    nameIn.value = saved?.fromName ?? state.fromName;
    nameWrap.appendChild(nameIn);

    const emailWrap = document.createElement('div');
    emailWrap.className = 'de-label re-lab-from-email';
    const emailLabel = document.createElement('span');
    emailLabel.className = 're-lab-field-label';
    emailLabel.textContent = 'From email';
    const emailIn = document.createElement('input');
    emailIn.className = 'de-input';
    emailIn.type = 'email';
    emailIn.dataset.labFrom = '1';
    emailIn.placeholder = 'sender@example.com';
    emailIn.autocomplete = 'off';
    emailIn.value =
      saved?.from ||
      (state.from.match(/<([^>]+)>/)?.[1] || state.from.replace(/^.*\s/, '')) ||
      '';
    const suggest = document.createElement('div');
    suggest.className = 're-lab-suggest-box';
    suggest.hidden = true;
    // Suggest box is a sibling of the input, not inside a <label>, so picking
    // a contact cannot re-focus the field and reopen the menu.
    emailWrap.append(emailLabel, emailIn, suggest);
    emailIn.addEventListener('focus', () => {
      void openContactSuggestions(suggest, emailIn, emailWrap);
    });
    emailIn.addEventListener('input', () => {
      void openContactSuggestions(suggest, emailIn, emailWrap);
    });
    emailIn.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeContactSuggestions(suggest);
      }
    });
    fromRow.append(nameWrap, emailWrap);
    form.appendChild(fromRow);

    const toLb = document.createElement('label');
    toLb.className = 'de-label';
    toLb.textContent = 'To (receiving address)';
    const toIn = document.createElement('input');
    toIn.className = 'de-input';
    toIn.dataset.labTo = '1';
    toIn.placeholder = inboundExample();
    toIn.value = saved?.to || state.to || inboundExample();
    toLb.appendChild(toIn);
    form.appendChild(toLb);

    const subLb = document.createElement('label');
    subLb.className = 'de-label';
    subLb.textContent = 'Subject';
    const subIn = document.createElement('input');
    subIn.className = 'de-input';
    subIn.dataset.labSubject = '1';
    subIn.value = saved?.subject ?? state.subject;
    subLb.appendChild(subIn);
    form.appendChild(subLb);

    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'de-label re-lab-body-field';
    const bodyHead = document.createElement('div');
    bodyHead.className = 're-lab-body-head';
    const bodyTitle = document.createElement('span');
    bodyTitle.className = 're-lab-field-label';
    bodyTitle.textContent = 'Body';
    bodyHead.appendChild(bodyTitle);

    const bodyText = saved?.text ?? state.text;
    const bodyHtml = resolveLabHtml(saved?.html ?? state.html, bodyText);
    state.html = bodyHtml;
    let bodyMode = saved?.bodyMode ?? state.bodyMode;
    if (bodyHtml && bodyMode !== 'source' && bodyMode !== 'preview') bodyMode = 'preview';
    if (!bodyHtml) bodyMode = 'source';
    state.bodyMode = bodyMode;

    const bodyIn = document.createElement('textarea');
    bodyIn.className = 'de-input re-textarea';
    bodyIn.dataset.labBody = '1';
    bodyIn.rows = 8;
    // Always prefer plain text so selections become keyword phrases.
    bodyIn.value = bodyText || (bodyHtml ? htmlToPlainText(bodyHtml) : '');
    bodyIn.placeholder = 'Message body';

    const previewWrap = document.createElement('div');
    previewWrap.className = 're-lab-body-html';
    const frame = document.createElement('iframe');
    frame.className = 're-lab-body-frame';
    frame.title = 'Email body preview';
    frame.sandbox = 'allow-popups allow-popups-to-escape-sandbox';
    previewWrap.appendChild(frame);

    const syncBodyPanes = () => {
      const showPreview = state.bodyMode === 'preview' && Boolean(resolveLabHtml(state.html, bodyIn.value));
      previewWrap.hidden = !showPreview;
      bodyIn.hidden = showPreview;
      bodyHead.querySelectorAll('[data-lab-body-mode]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.labBodyMode === state.bodyMode);
      });
      if (showPreview) {
        frame.srcdoc = resolveLabHtml(state.html, bodyIn.value);
      }
    };

    if (bodyHtml) {
      const modeToggle = document.createElement('div');
      modeToggle.className = 're-lab-body-mode';
      modeToggle.setAttribute('role', 'group');
      modeToggle.setAttribute('aria-label', 'Body view');
      for (const mode of [
        { id: 'preview', label: 'Preview' },
        { id: 'source', label: 'Source' },
      ]) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 're-lab-body-mode-btn';
        btn.dataset.labBodyMode = mode.id;
        btn.textContent = mode.label;
        btn.addEventListener('click', () => {
          if (state.bodyMode === 'source') {
            const val = bodyIn.value || '';
            if (looksLikeHtml(val)) {
              state.html = val;
              // Keep keyword text empty when Source is markup-only.
              if (!state.text || looksLikeHtml(state.text)) state.text = '';
            } else {
              state.text = val;
            }
          }
          state.bodyMode = /** @type {'preview' | 'source'} */ (mode.id);
          if (mode.id === 'source') {
            bodyIn.value = state.text || htmlToPlainText(state.html) || '';
          }
          syncBodyPanes();
        });
        modeToggle.appendChild(btn);
      }
      bodyHead.appendChild(modeToggle);
    }

    bodyIn.addEventListener('input', () => {
      state.text = bodyIn.value || '';
      if (looksLikeHtml(bodyIn.value || '')) {
        state.html = bodyIn.value;
        // Offer preview once the user pastes markup.
        if (!bodyHead.querySelector('.re-lab-body-mode')) {
          state.bodyMode = 'preview';
          renderLabShell(root, { preserveForm: true });
          scheduleLiveTest();
        }
      }
    });

    bodyWrap.append(bodyHead, previewWrap, bodyIn);
    form.appendChild(bodyWrap);
    syncBodyPanes();
    bindLiveTestField(nameIn, root);
    bindLiveTestField(emailIn, root);
    bindLiveTestField(toIn, root);
    bindLiveTestField(subIn, root);
    bindLiveTestField(bodyIn, root);

    const markDraftTouched = () => {
      state.draftTouched = true;
    };

    const ruleDraft = document.createElement('div');
    ruleDraft.className = 're-lab-rule-draft';
    ruleDraft.dataset.labRuleDraft = '1';
    ruleDraft.hidden = state.liveStatus !== 'nomatch';

    const titleLb = document.createElement('label');
    titleLb.className = 'de-label';
    titleLb.textContent = 'Rule title';
    const titleIn = document.createElement('input');
    titleIn.className = 'de-input';
    titleIn.dataset.labRuleTitle = '1';
    titleIn.placeholder = 'From the email';
    titleIn.value = state.ruleTitle;
    titleIn.addEventListener('input', () => {
      markDraftTouched();
      state.ruleTitle = titleIn.value;
    });
    titleLb.appendChild(titleIn);
    ruleDraft.appendChild(titleLb);

    const phrasesLb = document.createElement('label');
    phrasesLb.className = 'de-label';
    phrasesLb.textContent = 'Phrases';
    const phrasesIn = document.createElement('textarea');
    phrasesIn.className = 'de-input re-textarea';
    phrasesIn.dataset.labRulePhrases = '1';
    phrasesIn.rows = 3;
    phrasesIn.placeholder = 'One phrase per line';
    phrasesIn.value = state.rulePhrases;
    phrasesIn.addEventListener('input', () => {
      markDraftTouched();
      state.rulePhrases = phrasesIn.value;
    });
    phrasesLb.appendChild(phrasesIn);
    ruleDraft.appendChild(phrasesLb);

    const fieldsWrap = document.createElement('div');
    fieldsWrap.className = 're-checks';
    const derivedFields = new Set(state.ruleFields);
    for (const [val, lab] of [
      ['from', 'From'],
      ['subject', 'Subject'],
      ['body', 'Body'],
    ]) {
      const lb = document.createElement('label');
      lb.className = 're-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = val;
      cb.dataset.labRuleField = '1';
      cb.checked = derivedFields.has(val);
      cb.addEventListener('change', () => {
        markDraftTouched();
      });
      lb.append(cb, document.createTextNode(` ${lab}`));
      fieldsWrap.appendChild(lb);
    }
    const fieldsLb = document.createElement('div');
    fieldsLb.className = 'de-label';
    fieldsLb.textContent = 'Search in';
    fieldsLb.appendChild(fieldsWrap);
    ruleDraft.appendChild(fieldsLb);

    const matchLb = document.createElement('label');
    matchLb.className = 'de-label';
    matchLb.textContent = 'Match mode';
    const matchSel = document.createElement('select');
    matchSel.className = 'de-input';
    matchSel.dataset.labRuleMatch = '1';
    matchSel.innerHTML =
      '<option value="any">Any phrase matches</option><option value="all">All phrases must match</option>';
    matchSel.value = state.ruleMatchMode === 'all' ? 'all' : 'any';
    matchSel.addEventListener('change', () => {
      markDraftTouched();
      state.ruleMatchMode = matchSel.value === 'all' ? 'all' : 'any';
    });
    matchLb.appendChild(matchSel);
    ruleDraft.appendChild(matchLb);

    const exceptLb = document.createElement('label');
    exceptLb.className = 'de-label';
    exceptLb.textContent = 'Except (NOT)';
    const exceptIn = document.createElement('textarea');
    exceptIn.className = 'de-input re-textarea';
    exceptIn.dataset.labRuleExcept = '1';
    exceptIn.rows = 2;
    exceptIn.placeholder = 'Optional — one phrase per line';
    exceptIn.value = state.ruleExcept;
    exceptIn.addEventListener('input', () => {
      markDraftTouched();
      state.ruleExcept = exceptIn.value;
    });
    exceptLb.appendChild(exceptIn);
    ruleDraft.appendChild(exceptLb);

    const processSel = document.createElement('input');
    processSel.type = 'hidden';
    processSel.dataset.labRuleProcess = '1';
    processSel.value = state.ruleProcess || 'delete';

    const notifyWrap = document.createElement('div');
    notifyWrap.className = 're-checks';
    const pushLb = document.createElement('label');
    pushLb.className = 're-check';
    const pushCb = document.createElement('input');
    pushCb.type = 'checkbox';
    pushCb.dataset.labRulePush = '1';
    pushCb.checked = state.ruleNotifyPush;
    pushCb.addEventListener('change', () => {
      markDraftTouched();
      state.ruleNotifyPush = pushCb.checked;
    });
    pushLb.append(pushCb, document.createTextNode(' Push'));
    const dashLb = document.createElement('label');
    dashLb.className = 're-check';
    const dashCb = document.createElement('input');
    dashCb.type = 'checkbox';
    dashCb.dataset.labRuleDash = '1';
    dashCb.checked = state.ruleNotifyDashboard;
    dashCb.addEventListener('change', () => {
      markDraftTouched();
      state.ruleNotifyDashboard = dashCb.checked;
    });
    dashLb.append(dashCb, document.createTextNode(' Dashboard'));
    notifyWrap.append(pushLb, dashLb);

    const syncSilentNotify = () => {
      const silent = labProcessIsSilent(processSel.value);
      pushCb.disabled = silent;
      dashCb.disabled = silent;
      if (silent) {
        pushCb.checked = false;
        dashCb.checked = false;
        state.ruleNotifyPush = false;
        state.ruleNotifyDashboard = false;
      }
    };

    const processPill = createSlidingPillSelect({
      label: 'Then',
      value: processSel.value,
      options: LAB_PROCESS_OPTIONS,
      ariaLabel: 'Email processing action',
      scrollable: false,
      onChange: (value) => {
        markDraftTouched();
        processSel.value = value;
        state.ruleProcess = value;
        syncSilentNotify();
      },
    });
    const processWrap = document.createElement('div');
    processWrap.className = 're-process-field';
    processWrap.append(processPill.el, processSel);
    ruleDraft.appendChild(processWrap);

    const notifyLb = document.createElement('div');
    notifyLb.className = 'de-label';
    notifyLb.textContent = 'Notify';
    notifyLb.appendChild(notifyWrap);
    ruleDraft.appendChild(notifyLb);
    syncSilentNotify();

    const actions = document.createElement('div');
    actions.className = 're-lab-compose-actions';
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'dash-panel-btn';
    createBtn.dataset.labCreateRule = '1';
    createBtn.textContent = 'Create Rule';
    createBtn.addEventListener('click', () => void createRuleFromCompose());
    actions.append(createBtn);
    ruleDraft.appendChild(actions);
    form.appendChild(ruleDraft);

    compose.appendChild(form);
    body.appendChild(compose);

    // ── Pipeline ──
    const pipe = document.createElement('section');
    pipe.className = 're-lab-pipeline';
    pipe.innerHTML = `<header class="re-lab-section-head">
      <h2>Pipeline</h2>
      <p>Drag to set priority · tap a rule to edit · downstream stays in Agent order.</p>
    </header>`;

    const pipeList = document.createElement('div');
    pipeList.className = 're-lab-pipe-list';

    const trigger = document.createElement('div');
    trigger.className = 're-lab-pipe-card re-lab-pipe-card--trigger';
    trigger.dataset.stage = 'ingest';
    trigger.innerHTML = `
      <span class="re-flow-badge">Trigger</span>
      <span class="re-lab-pipe-title">Inbound email</span>
      <span class="re-lab-pipe-sub">Resend webhook → processInboundEmail</span>`;
    pipeList.appendChild(trigger);

    for (const fn of PIPELINE_FUNCTIONS) {
      if (fn.id === 'agent_else') {
        // Already rendered as the Else card after keyword rules.
        continue;
      }
      if (fn.id === 'rules') {
        const filterBar = document.createElement('div');
        filterBar.className = 're-lab-rules-filter';
        const ruleCount = orderedRules().length;
        const search = listSearchSubheader({
          itemCount: ruleCount,
          search: {
            value: ruleState().search || '',
            placeholder: `Search ${ruleCount} ${ruleCount === 1 ? 'Rule' : 'Rules'}`,
            ariaLabel: 'Filter rules by title, status, or keywords',
            onInput: (value) => {
              ruleState().search = value;
              applyRulesFilter(root);
            },
          },
        });
        if (search?.el) filterBar.appendChild(search.el);
        if (search?.input) bindRulesFilterInput(search.input, root);
        if (!showPersonal() && ruleState().scopeFilter === 'personal') {
          ruleState().scopeFilter = 'all';
        }
        const scopeOptions = [
          { value: 'all', label: 'All' },
          { value: 'universal', label: 'Universal' },
        ];
        if (showPersonal()) scopeOptions.push({ value: 'personal', label: 'Personal' });
        const scopeFilter = createSlidingPillSelect({
          value: ruleState().scopeFilter || 'all',
          ariaLabel: 'Filter by rule scope',
          options: scopeOptions,
          onChange: (value) => {
            ruleState().scopeFilter = value;
            applyRulesFilter(root);
          },
        });
        const scopeBar = document.createElement('div');
        scopeBar.className = 're-scope-filter re-lab-scope-filter';
        scopeBar.appendChild(scopeFilter.el);
        filterBar.appendChild(scopeBar);
        pipeList.appendChild(filterBar);

        const spine = document.createElement('div');
        spine.className = 're-flow-spine';
        spine.textContent = '↓ keyword rules · catalog is fixed from the repo';
        pipeList.appendChild(spine);

        orderedRules().forEach((rule, i) => {
          const card = document.createElement('div');
          card.className = 're-lab-pipe-card re-lab-pipe-card--rule';
          card.dataset.kind = 'rule';
          card.dataset.stage = 'rules';
          card.dataset.ruleId = rule.id;
          const show = ruleMatchesLabFilter(rule);
          card.hidden = !show;
          card.classList.toggle('re-lab-pipe-card--filtered-out', !show);
          if (rule.enabled === false) card.classList.add('re-lab-pipe-card--off');
          if (state.liveMatchRuleId && String(state.liveMatchRuleId) === String(rule.id)) {
            card.classList.add('re-lab-pipe-card--matched', 're-lab-pipe-card--hit');
          }

          const head = document.createElement('div');
          head.className = 're-lab-pipe-card-head';

          const catalog =
            rule.scope === 'universal' && window.__installConfig?.canManageUniversalRules !== true;
          if (catalog) card.dataset.locked = '1';
          const grip = document.createElement('button');
          grip.type = 'button';
          grip.className = 're-lab-grip';
          grip.disabled = catalog;
          grip.setAttribute('aria-label', catalog ? 'Catalog order is fixed' : 'Drag to reorder');
          grip.title = catalog ? 'Catalog rule order comes from the repo' : 'Drag to reorder';
          grip.innerHTML = iosIcon('grip', 16);

          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 're-lab-pipe-card-toggle';
          toggle.setAttribute('aria-expanded', 'false');
          const whenClause = formatRuleWhenClause(rule);
          const labMeta = formatRuleLabMeta(rule);
          toggle.setAttribute('aria-label', `Priority ${i + 1}: ${whenClause}`);
          toggle.innerHTML = `
            <span class="re-lab-pri">#${i + 1}</span>
            <span class="re-lab-pipe-main">
              <span class="re-lab-pipe-title">${escHtml(whenClause)}</span>
              <span class="re-lab-pipe-sub">${escHtml(labMeta)}</span>
            </span>
            <span class="re-lab-pipe-chevron" aria-hidden="true">${iosIcon('chevron-down', 16)}</span>`;
          toggle.addEventListener('click', () => {
            void deps.toggleRuleEditor(rule.id);
          });

          head.append(grip, toggle);

          const accordionBody = document.createElement('div');
          accordionBody.className = 're-lab-pipe-card-body';
          accordionBody.hidden = true;

          card.append(head, accordionBody);
          pipeList.appendChild(card);
        });

        const rulesEmpty = document.createElement('div');
        rulesEmpty.className = 'de-empty';
        rulesEmpty.dataset.labRulesEmpty = '1';
        rulesEmpty.textContent = 'No rules yet.';
        rulesEmpty.hidden = orderedRules().length > 0;
        pipeList.appendChild(rulesEmpty);

        const elseCard = document.createElement('div');
        elseCard.className = 're-lab-pipe-card re-lab-pipe-card--else re-lab-pipe-card--agent';
        elseCard.dataset.stage = 'agent_else';
        elseCard.dataset.kind = 'agent_else';
        elseCard.innerHTML = `
          <span class="re-flow-badge">Else</span>
          <span class="re-lab-pipe-main">
            <span class="re-lab-pipe-title">Agent</span>
            <span class="re-lab-pipe-sub">No match → agent handles this mail</span>
          </span>`;
        pipeList.appendChild(elseCard);

        const spine2 = document.createElement('div');
        spine2.className = 're-flow-spine';
        spine2.textContent = '↓ downstream (fixed Agent order)';
        pipeList.appendChild(spine2);
        continue;
      }

      const card = document.createElement('div');
      card.className = 're-lab-pipe-card';
      card.dataset.kind = 'function';
      card.dataset.stage = fn.id;
      card.dataset.locked = '1';
      card.innerHTML = `
        <span class="re-lab-lock" title="Fixed production order" aria-hidden="true">${iosIcon('settings', 14)}</span>
        <span class="re-lab-pipe-main">
          <span class="re-flow-badge">Then</span>
          <span class="re-lab-pipe-title">${escHtml(fn.label)}</span>
          <span class="re-lab-pipe-sub">${escHtml(fn.sub)}</span>
        </span>`;
      pipeList.appendChild(card);
    }

    pipe.appendChild(pipeList);
    attachRuleReorder(pipeList);
    body.appendChild(pipe);

    shellEl.appendChild(body);
    root.appendChild(shellEl);
    syncExpandedRule(root);
    applyRulesFilter(root);
    applyLiveResult(root);
    void ensureContacts();
    if (opts.runLive) scheduleLiveTest();
  }

  return {
    render(root) {
      renderLabShell(root, { preserveForm: false });
    },
    /** Prefill the rule generator from an inbox record, then live-test. */
    async loadInboxEmail(record, opts = {}) {
      loadFromInboxEmail(record);
      const root = deps.getRuleEditor();
      if (root) renderLabShell(root, { preserveForm: false });
      if (opts.run !== false) await runLiveTest();
    },
    syncExpandedRule,
    destroy() {
      if (state.liveTimer) {
        clearTimeout(state.liveTimer);
        state.liveTimer = null;
      }
      state.liveGen += 1;
      closeContactSuggestions(deps.getRuleEditor()?.querySelector('.re-lab-suggest-box'));
    },
    getState: () => state,
  };
}
