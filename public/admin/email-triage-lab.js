/**
 * Email triage Lab — live rule tester / complex filter.
 * Type field:phrase terms (Enter pins another field). Matching rules update
 * on the right; simulate (POST /api/email/simulate rulesOnly) highlights the first hit.
 */
import {
  iosIcon,
  createSlidingPillSelect,
  contactAvatarHtml,
  mountContactAvatars,
} from './admin-ui.js?v=20260815e';
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

const CHIP_FIELD_OPTIONS = [
  { value: 'from', label: 'From' },
  { value: 'subject', label: 'Subject' },
  { value: 'body', label: 'Body' },
];

function chipFieldLabel(field) {
  if (field === 'from') return 'email';
  return String(field || 'body').trim() || 'body';
}

function newChipId() {
  return `chip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
  if (rule?.forwardTo) {
    bits.push(`→ ${rule.forwardTo}`);
    if (rule.createProject) bits.push('create project');
  }
  return bits.join(' · ');
}

/** Fixed downstream stages (production order) — not user-reorderable. */
export const PIPELINE_FUNCTIONS = [
  { id: 'normalize', label: 'Normalize message', sub: 'Body · attachments · OTP extract' },
  { id: 'rules', label: 'Keyword rules', sub: 'First match wins · sort order' },
  { id: 'agent_else', label: 'Inbox (else)', sub: 'No match → stay in inbox' },
  { id: 'contact', label: 'Resolve sender', sub: 'Contacts · client kind · open jobs' },
  { id: 'ai', label: 'AI classify / triage', sub: 'Agent-first or rules-first' },
  { id: 'override', label: 'Receipt / OTP overrides', sub: 'Money heuristics · auth links' },
  { id: 'project_reply', label: 'Project reply detect', sub: 'Thread / subject match' },
  { id: 'meeting', label: 'Meeting automation', sub: 'Follow-up · auto-book · conflict' },
  { id: 'project', label: 'Project automation', sub: 'Match · skip if forwarded' },
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
    html: '',
    attachments: /** @type {{ id: string, filename: string, contentType: string, size: number }[]} */ ([]),
    skipGates: true,
    /** @type {{ id: string, field: 'from' | 'subject' | 'body', text: string, contact?: object | null }[]} */
    chips: [],
    /** @type {'from' | 'subject' | 'body'} */
    chipField: 'body',
    chipDraft: '',
    ruleOrder: /** @type {string[]} */ ([]),
    contacts: /** @type {{ uid: string, name: string, email?: string, iconUrl?: string, logoUrl?: string }[]} */ ([]),
    dirtyOrder: false,
    inboundExample: '',
    suggestGen: 0,
    suggestOpen: false,
    _suggestOutsideBound: null,
    sourceEmailId: null,
    liveTimer: null,
    liveGen: 0,
    liveStatus: /** @type {'idle' | 'running' | 'match' | 'nomatch' | 'error'} */ ('idle'),
    liveError: '',
    liveMatchRuleId: /** @type {string | null} */ (null),
    liveMatchIndex: 0,
    liveMatchWhen: '',
    liveMatchMeta: '',
  };

  const LIVE_DEBOUNCE_MS = 500;

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

  function fromEmailValue() {
    return state.from.match(/<([^>]+)>/)?.[1]?.trim() || state.from.trim();
  }

  function findContactByEmail(email) {
    const needle = String(email || '').trim().toLowerCase();
    if (!needle) return null;
    return state.contacts.find((c) => String(c.email || '').toLowerCase() === needle) || null;
  }

  function draftTerm() {
    const text = normalizeTargetPhrase(state.chipDraft);
    if (text.length < 2) return null;
    return { field: state.chipField, text };
  }

  function filterTerms() {
    const draft = draftTerm();
    return draft ? [...state.chips, draft] : state.chips.slice();
  }

  function syncComposeFromChips() {
    const terms = filterTerms();
    const fromChips = terms.filter((c) => c.field === 'from');
    const subChips = terms.filter((c) => c.field === 'subject');
    const bodyChips = terms.filter((c) => c.field === 'body');
    const from = fromChips[0];
    state.fromName = from?.contact?.name || '';
    state.from = from?.text || '';
    if (from?.contact?.name && from.text) {
      state.from = `${from.contact.name} <${from.text}>`;
    }
    state.subject = subChips.map((c) => c.text).join(' ');
    state.text = bodyChips.map((c) => c.text).join('\n');
    state.html = '';
    if (!state.to) state.to = inboundExample();
  }

  function attachContactsToChips() {
    for (const chip of state.chips) {
      if (chip.field === 'from' && !chip.contact) {
        chip.contact = findContactByEmail(chip.text);
      }
    }
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
      rule.createProject ? 'create project' : '',
      ...(rule.phrases || []),
      ...(rule.exceptPhrases || []),
    ];
  }

  function ruleMatchesComposeFilter(rule) {
    const terms = filterTerms();
    if (!terms.length) return true;
    const chipHay = terms.map((c) => c.text).join(' ').toLowerCase();
    const phrases = (rule.phrases || [])
      .map((p) => String(p || '').trim().toLowerCase())
      .filter((p) => p.length >= 2);
    if (phrases.some((p) => chipHay.includes(p))) return true;
    const ruleHay = ruleSearchHaystack(rule).filter(Boolean).join(' ').toLowerCase();
    return terms.some((c) => {
      const t = String(c.text || '').trim().toLowerCase();
      return t.length >= 2 && ruleHay.includes(t);
    });
  }

  function isRulesFilterActive() {
    const rs = ruleState();
    return (rs.scopeFilter && rs.scopeFilter !== 'all') || filterTerms().length > 0;
  }

  function ruleMatchesLabFilter(rule) {
    if (!rule) return false;
    const rs = ruleState();
    if (rs.activeId != null && String(rule.id) === String(rs.activeId)) return true;
    if (rs.scopeFilter === 'universal' && rule.scope !== 'universal') return false;
    if (rs.scopeFilter === 'personal' && rule.scope === 'universal') return false;
    return ruleMatchesComposeFilter(rule);
  }

  function applyRulesFilter(root = deps.getRuleEditor()) {
    if (!root) return;
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
      empty.textContent = filterTerms().length
        ? 'No matching rules.'
        : 'No rules yet.';
    }
    const filterActive = isRulesFilterActive();
    root.querySelectorAll('.re-lab-pipe-card--rule .re-lab-grip').forEach((grip) => {
      const locked = grip.closest('.re-lab-pipe-card')?.dataset.locked === '1';
      grip.disabled = filterActive || locked;
      grip.title = locked
        ? 'Catalog rule order comes from the repo'
        : filterActive
          ? 'Clear the filter to reorder'
          : 'Drag to reorder';
    });
    const headSub = root.querySelector('[data-lab-rules-sub]');
    if (headSub) {
      headSub.textContent = filterTerms().length
        ? 'Rules that match this filter · first hit highlighted'
        : 'Tap a rule to edit · drag to set priority';
    }
  }

  function chipPlaceholder() {
    if (state.chipField === 'from') return 'company@company.com';
    if (state.chipField === 'subject') return 'Subject phrase';
    return 'Term or phrase';
  }

  function addChip(partial) {
    const field = partial.field || state.chipField || 'body';
    const text = normalizeTargetPhrase(partial.text);
    if (text.length < 2) return false;
    const dup = state.chips.some(
      (c) => c.field === field && c.text.toLowerCase() === text.toLowerCase(),
    );
    if (dup) return false;
    state.chips.push({
      id: newChipId(),
      field,
      text,
      contact: partial.contact || (field === 'from' ? findContactByEmail(text) : null),
    });
    state.chipDraft = '';
    syncComposeFromChips();
    const root = deps.getRuleEditor();
    const draftIn = root?.querySelector('[data-lab-chip-draft]');
    if (draftIn instanceof HTMLInputElement) draftIn.value = '';
    refreshChipList(root);
    applyRulesFilter(root);
    scheduleLiveTest();
    return true;
  }

  function removeChip(id) {
    state.chips = state.chips.filter((c) => c.id !== id);
    syncComposeFromChips();
    const root = deps.getRuleEditor();
    refreshChipList(root);
    applyRulesFilter(root);
    if (!state.chips.length) {
      resetLiveState();
      applyLiveResult(root);
    } else {
      scheduleLiveTest();
    }
  }

  function refreshChipList(root = deps.getRuleEditor()) {
    const list = root?.querySelector('[data-lab-chips]');
    if (!list) return;
    list.replaceChildren();
    list.hidden = state.chips.length === 0;
    for (const chip of state.chips) {
      const li = document.createElement('li');
      li.className = 're-lab-target-chip';
      li.dataset.chipId = chip.id;
      const contact = chip.contact || (chip.field === 'from' ? findContactByEmail(chip.text) : null);
      if (chip.field === 'from') {
        const face = document.createElement('span');
        face.className = 're-lab-chip-face';
        face.innerHTML = contactAvatarHtml({
          iconUrl: contact?.iconUrl,
          logoUrl: contact?.logoUrl,
          iconSize: 14,
        });
        li.appendChild(face);
      }
      const label = document.createElement('span');
      label.textContent = `${chipFieldLabel(chip.field)}: ${chip.text}`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 're-lab-target-rm';
      rm.innerHTML = iosIcon('x', 14);
      rm.setAttribute('aria-label', `Remove ${chip.text}`);
      rm.addEventListener('click', () => removeChip(chip.id));
      li.append(label, rm);
      list.appendChild(li);
    }
    mountContactAvatars(list);
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
          iconUrl: c.iconUrl || '',
          logoUrl: c.logoUrl || '',
        }));
      attachContactsToChips();
    } catch {
      state.contacts = [];
    }
  }

  function hasTestableContent() {
    return filterTerms().length > 0;
  }

  function liveResultHtml() {
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
    const matchedId = state.liveMatchRuleId;
    root.querySelectorAll('.re-lab-pipe-card--rule').forEach((card) => {
      const hit = Boolean(matchedId && card.dataset.ruleId === String(matchedId));
      card.classList.toggle('re-lab-pipe-card--matched', hit);
      card.classList.toggle('re-lab-pipe-card--hit', hit);
    });
    if (state.liveStatus === 'match' && matchedId) {
      const hit = root.querySelector(
        `.re-lab-pipe-card--rule[data-rule-id="${CSS.escape(String(matchedId))}"]`,
      );
      hit?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    applyRulesFilter(root);
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

  function resetLiveState() {
    state.liveStatus = 'idle';
    state.liveError = '';
    state.liveMatchRuleId = null;
    state.liveMatchIndex = 0;
    state.liveMatchWhen = '';
    state.liveMatchMeta = '';
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
    const toRaw = record.to;
    state.to = Array.isArray(toRaw)
      ? toRaw.map(String).filter(Boolean).join(', ')
      : String(toRaw || state.to || inboundExample()).trim();
    const subject = String(record.subject || '').trim();
    const text = String(
      record.bodyText || record.text || record.bodySnippet || record.summary || '',
    );
    const html = resolveLabHtml(record.bodyHtml || record.html || '', text);
    const plain = plainTextForLab(text, html);
    const snippet = plain
      .split('\n')
      .map((s) => s.trim())
      .find((s) => s.length >= 2 && s.length <= 80);

    state.chips = [];
    if (fromEmail) {
      state.chips.push({
        id: newChipId(),
        field: 'from',
        text: fromEmail,
        contact: fromName ? { name: fromName, email: fromEmail } : findContactByEmail(fromEmail),
      });
    }
    if (subject) {
      state.chips.push({ id: newChipId(), field: 'subject', text: subject, contact: null });
    }
    if (snippet && snippet.toLowerCase() !== subject.toLowerCase()) {
      state.chips.push({ id: newChipId(), field: 'body', text: snippet, contact: null });
    }
    state.chipDraft = '';
    state.attachments = [];
    state.skipGates = true;
    state.sourceEmailId = String(record.id || '').trim() || null;
    syncComposeFromChips();
    resetLiveState();
  }

  async function runLiveTest() {
    const root = deps.getRuleEditor();
    if (!root) return;
    syncComposeFromChips();
    if (!hasTestableContent()) {
      resetLiveState();
      applyLiveResult(root);
      return;
    }
    const gen = ++state.liveGen;
    state.liveStatus = 'running';
    try {
      await deps.flushRuleAutosave?.();
      const from = fromEmailValue() || 'sender@example.com';
      const res = await fetch('/api/email/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: state.from || from,
          to: state.to || inboundExample(),
          cc: '',
          subject: state.subject,
          text: state.text,
          skipGates: true,
          rulesOnly: true,
          ruleOrder: state.ruleOrder,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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
      }
      applyLiveResult(root);
    } catch (e) {
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
      if (root) renderLabShell(root);
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
    if (state.chipField !== 'from') {
      closeContactSuggestions(box);
      return;
    }
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
      btn.innerHTML =
        contactAvatarHtml({ iconUrl: c.iconUrl, logoUrl: c.logoUrl, iconSize: 16 }) +
        `<span class="re-lab-suggest-copy"><strong>${escHtml(c.name)}</strong><span>${escHtml(c.email)}</span></span>`;
      btn.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        addChip({ field: 'from', text: c.email, contact: c });
        closeContactSuggestions(box);
        input.blur();
      });
      box.appendChild(btn);
    }
    mountContactAvatars(box);
  }

  async function openContactSuggestions(box, input, wrap) {
    if (state.chipField !== 'from') {
      closeContactSuggestions(box);
      return;
    }
    const gen = ++state.suggestGen;
    await ensureContacts(input.value);
    renderContactSuggestions(box, input, wrap, gen);
    refreshChipList(deps.getRuleEditor());
  }

  function renderLabShell(root) {
    closeContactSuggestions(root.querySelector('.re-lab-suggest-box'));
    syncRuleOrderFromState();
    syncComposeFromChips();
    root.innerHTML = '';
    root.classList.add('re-view-lab');
    root.classList.remove('re-view-flow', 're-view-list', 'de-pane-active');

    const sidebar = document.createElement('aside');
    sidebar.className = 'ch-sidebar';

    const compose = document.createElement('section');
    compose.className = 're-lab-compose';

    const composeHead = document.createElement('header');
    composeHead.className = 're-lab-section-head';
    composeHead.innerHTML = `<h2>Rule tester</h2>
      <p>Live filter — type a term, pick From / Subject / Body. Enter pins another field.</p>`;
    compose.appendChild(composeHead);

    const liveBanner = document.createElement('div');
    liveBanner.innerHTML = liveResultHtml();
    compose.appendChild(liveBanner.firstElementChild);

    const chips = document.createElement('ul');
    chips.className = 're-lab-target-list';
    chips.dataset.labChips = '1';
    compose.appendChild(chips);

    const fieldPills = createSlidingPillSelect({
      value: state.chipField,
      ariaLabel: 'Filter target field',
      options: CHIP_FIELD_OPTIONS,
      scrollable: true,
      onChange: (value) => {
        if (value === 'from' || value === 'subject' || value === 'body') {
          state.chipField = value;
        }
        const draftIn = root.querySelector('[data-lab-chip-draft]');
        if (draftIn instanceof HTMLInputElement) {
          draftIn.placeholder = chipPlaceholder();
          draftIn.type = state.chipField === 'from' ? 'email' : 'text';
          draftIn.focus();
        }
        if (state.chipField !== 'from') {
          closeContactSuggestions(root.querySelector('.re-lab-suggest-box'));
        }
        syncComposeFromChips();
        applyRulesFilter(root);
        scheduleLiveTest();
      },
    });
    const fieldBar = document.createElement('div');
    fieldBar.className = 're-lab-field-pills';
    fieldBar.appendChild(fieldPills.el);
    compose.appendChild(fieldBar);

    const addRow = document.createElement('div');
    addRow.className = 're-lab-chip-add';
    const draftWrap = document.createElement('div');
    draftWrap.className = 're-lab-chip-draft-wrap';
    const draftIn = document.createElement('input');
    draftIn.className = 'de-input';
    draftIn.dataset.labChipDraft = '1';
    draftIn.autocomplete = 'off';
    draftIn.enterKeyHint = 'done';
    draftIn.type = state.chipField === 'from' ? 'email' : 'text';
    draftIn.placeholder = chipPlaceholder();
    draftIn.value = state.chipDraft;
    const suggest = document.createElement('div');
    suggest.className = 're-lab-suggest-box';
    suggest.hidden = true;
    draftWrap.append(draftIn, suggest);

    const commitDraft = () => {
      state.chipDraft = draftIn.value;
      if (addChip({ field: state.chipField, text: draftIn.value })) {
        closeContactSuggestions(suggest);
        draftIn.focus();
      }
    };
    draftIn.addEventListener('input', () => {
      state.chipDraft = draftIn.value;
      syncComposeFromChips();
      applyRulesFilter(root);
      scheduleLiveTest();
      if (state.chipField === 'from') {
        void openContactSuggestions(suggest, draftIn, draftWrap);
      }
    });
    draftIn.addEventListener('focus', () => {
      if (state.chipField === 'from') {
        void openContactSuggestions(suggest, draftIn, draftWrap);
      }
    });
    draftIn.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commitDraft();
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeContactSuggestions(suggest);
      }
    });
    addRow.appendChild(draftWrap);
    compose.appendChild(addRow);
    sidebar.appendChild(compose);

    const pane = document.createElement('div');
    pane.className = 'de-pane';

    const pipe = document.createElement('section');
    pipe.className = 're-lab-pipeline';

    const pipeHead = document.createElement('header');
    pipeHead.className = 're-lab-section-head re-lab-rules-head';
    const pipeCopy = document.createElement('div');
    pipeCopy.innerHTML = `<h2>Rules</h2>
      <p data-lab-rules-sub>Tap a rule to edit · drag to set priority</p>`;
    const saveOrder = document.createElement('button');
    saveOrder.type = 'button';
    saveOrder.className = 'dash-panel-btn';
    saveOrder.dataset.labSaveOrder = '1';
    saveOrder.textContent = 'Save order';
    saveOrder.hidden = !state.dirtyOrder;
    saveOrder.disabled = !state.dirtyOrder;
    saveOrder.addEventListener('click', () => void persistRuleOrder());
    pipeHead.append(pipeCopy, saveOrder);
    pipe.appendChild(pipeHead);

    const pipeList = document.createElement('div');
    pipeList.className = 're-lab-pipe-list';

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
    pipeList.appendChild(scopeBar);

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

    pipe.appendChild(pipeList);
    attachRuleReorder(pipeList);
    pane.appendChild(pipe);
    root.append(sidebar, pane);
    refreshChipList(root);
    syncExpandedRule(root);
    applyRulesFilter(root);
    applyLiveResult(root);
    void ensureContacts().then(() => refreshChipList(deps.getRuleEditor()));
  }

  return {
    render(root) {
      renderLabShell(root);
    },
    /** Prefill chips from an inbox record, then live-test. */
    async loadInboxEmail(record, opts = {}) {
      loadFromInboxEmail(record);
      const root = deps.getRuleEditor();
      if (root) renderLabShell(root);
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
