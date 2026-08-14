/**
 * Email triage Lab — compose a message, drag rule priority, play the same
 * processInboundEmail dry-run the Agent uses (POST /api/email/simulate).
 */
import {
  iosIcon,
  listSearchSubheader,
  createSlidingPillSelect,
  matchesListSearch,
} from './admin-ui.js?v=20260812f';
import { escHtml } from './shared.js?v=20260810a';
import { osAlert } from './os-dialog.js?v=20260728q';

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
  const bits = [scope];
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
    /** Local rule id order for dry-run (may differ from saved until Save order). */
    ruleOrder: /** @type {string[]} */ ([]),
    contacts: /** @type {{ uid: string, name: string, email?: string }[]} */ ([]),
    contactQuery: '',
    sim: null,
    playIndex: -1,
    playing: false,
    playTimer: null,
    stepMs: 900,
    dirtyOrder: false,
    inboundExample: '',
    running: false,
    /** Bumps to ignore stale contact-fetch opens after dismiss/select. */
    suggestGen: 0,
    suggestOpen: false,
    _suggestOutsideBound: null,
    /** Inbox email id when compose was loaded from a notification / deep link. */
    sourceEmailId: null,
  };

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

  function isRulesFilterActive() {
    const rs = ruleState();
    return Boolean(String(rs.search || '').trim()) || (rs.scopeFilter && rs.scopeFilter !== 'all');
  }

  function ruleMatchesLabFilter(rule) {
    if (!rule) return false;
    const rs = ruleState();
    // Keep the open accordion visible while filtering.
    if (rs.activeId != null && String(rule.id) === String(rs.activeId)) return true;
    if (rs.scopeFilter === 'universal' && rule.scope !== 'universal') return false;
    if (rs.scopeFilter === 'personal' && rule.scope === 'universal') return false;
    return matchesListSearch(
      rs.search,
      rule.title,
      rule.status,
      rule.description,
      formatRuleWhenClause(rule),
      formatRuleLabMeta(rule),
      rule.scope === 'universal' ? 'Universal' : 'Personal',
      rule.forwardTo,
      rule.notify ? 'Notify' : 'Silent',
      ...(rule.phrases || []),
      ...(rule.exceptPhrases || []),
    );
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

  function stopPlayback() {
    state.playing = false;
    if (state.playTimer) {
      clearTimeout(state.playTimer);
      state.playTimer = null;
    }
    syncPlayButtons();
  }

  function syncPlayButtons() {
    const root = deps.getRuleEditor();
    if (!root) return;
    const playBtn = root.querySelector('[data-lab-play]');
    const pauseBtn = root.querySelector('[data-lab-pause]');
    const stopBtn = root.querySelector('[data-lab-stop]');
    if (playBtn) playBtn.disabled = !state.sim?.steps?.length || state.playing;
    if (pauseBtn) pauseBtn.disabled = !state.playing;
    if (stopBtn) stopBtn.disabled = state.playIndex < 0 && !state.playing;
  }

  function highlightStep(index) {
    state.playIndex = index;
    const root = deps.getRuleEditor();
    if (!root) return;
    const steps = state.sim?.steps || [];
    root.querySelectorAll('.re-lab-step').forEach((el) => {
      const i = Number(el.dataset.stepIndex);
      el.classList.toggle('re-lab-step--active', i === index);
      el.classList.toggle('re-lab-step--done', i >= 0 && i < index);
      el.classList.toggle('re-lab-step--pending', i > index);
    });
    root.querySelectorAll('.re-lab-pipe-card').forEach((el) => {
      const stage = el.dataset.stage;
      const step = steps[index];
      const active = step && (step.stage === stage || (stage === 'rules' && step.kind === 'rule'));
      el.classList.toggle('re-lab-pipe-card--active', Boolean(active));
      if (stage === 'rules' && step?.ruleId) {
        el.classList.toggle('re-lab-pipe-card--hit', el.dataset.ruleId === step.ruleId);
      }
    });
    const explain = root.querySelector('.re-lab-explain');
    if (explain) {
      const step = steps[index];
      if (!step) {
        explain.innerHTML =
          '<p class="re-lab-explain-empty">Press Play to walk the same pipeline the Agent uses.</p>';
      } else {
        explain.innerHTML = `
          <div class="re-lab-explain-kicker">${escHtml(step.kind)} · ${escHtml(step.status)}</div>
          <h3 class="re-lab-explain-title">${escHtml(step.label)}</h3>
          <p class="re-lab-explain-decision">${escHtml(step.decision)}</p>
          ${step.detail ? `<p class="re-lab-explain-detail">${escHtml(step.detail)}</p>` : ''}`;
        explain.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    const counter = root.querySelector('[data-lab-step-count]');
    if (counter) {
      counter.textContent = steps.length
        ? `${Math.max(0, index + 1)} / ${steps.length}`
        : '—';
    }
    syncPlayButtons();
  }

  function playNext() {
    const steps = state.sim?.steps || [];
    if (!steps.length) {
      stopPlayback();
      return;
    }
    const next = state.playIndex + 1;
    if (next >= steps.length) {
      highlightStep(steps.length - 1);
      stopPlayback();
      return;
    }
    highlightStep(next);
    if (state.playing) {
      state.playTimer = setTimeout(playNext, state.stepMs);
    }
  }

  function startPlayback() {
    const steps = state.sim?.steps || [];
    if (!steps.length) return;
    stopPlayback();
    state.playing = true;
    if (state.playIndex >= steps.length - 1) state.playIndex = -1;
    syncPlayButtons();
    playNext();
  }

  function pausePlayback() {
    state.playing = false;
    if (state.playTimer) {
      clearTimeout(state.playTimer);
      state.playTimer = null;
    }
    syncPlayButtons();
  }

  function resetPlayback() {
    stopPlayback();
    highlightStep(-1);
  }

  function readForm(root) {
    const from = root.querySelector('[data-lab-from]')?.value?.trim() || '';
    const fromName = root.querySelector('[data-lab-from-name]')?.value?.trim() || '';
    state.from = fromName && from ? `${fromName} <${from}>` : from;
    state.fromName = fromName;
    state.to = root.querySelector('[data-lab-to]')?.value?.trim() || '';
    state.cc = root.querySelector('[data-lab-cc]')?.value?.trim() || '';
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
    // Keep readable plain text for keywords; drop CSS/HTML blobs when we have HTML.
    state.text = html && looksLikeMarkupBlob(text) ? '' : text;
    if (!state.text && !html) state.text = text;
    state.bodyMode = html ? 'preview' : 'source';
    state.attachments = Array.isArray(record.attachments)
      ? record.attachments.map((a, i) => ({
          id: String(a.id || `att-${i}`),
          filename: String(a.filename || a.name || `file-${i + 1}`),
          contentType: String(a.contentType || a.content_type || 'application/octet-stream'),
          size: Number(a.size) || 0,
        }))
      : [];
    state.skipGates = true;
    state.sim = null;
    state.playIndex = -1;
    state.sourceEmailId = String(record.id || '').trim() || null;
    stopPlayback();
  }

  async function runSimulation() {
    const root = deps.getRuleEditor();
    if (!root || state.running) return;
    await deps.flushRuleAutosave?.();
    readForm(root);
    const fromEmail =
      state.from.match(/<([^>]+)>/)?.[1]?.trim() ||
      state.from.trim();
    if (!fromEmail || !fromEmail.includes('@')) {
      await osAlert('Enter a From email address (or pick a Contact).');
      return;
    }
    state.running = true;
    stopPlayback();
    const runBtn = root.querySelector('[data-lab-run]');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = 'Running…';
    }
    try {
      const res = await fetch('/api/email/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: state.from,
          to: state.to,
          cc: state.cc,
          subject: state.subject,
          text: state.text,
          html: state.html || undefined,
          attachments: state.attachments,
          ruleOrder: state.ruleOrder,
          skipGates: state.skipGates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      state.sim = data;
      state.inboundExample = data.inboundAddressExample || state.inboundExample;
      state.playIndex = -1;
      renderLabShell(root, { preserveForm: true });
      highlightStep(-1);
    } catch (e) {
      await osAlert(`Simulate failed: ${e.message}`);
    } finally {
      state.running = false;
      const btn = deps.getRuleEditor()?.querySelector('[data-lab-run]');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Run triage';
      }
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
          }
          dragEl = null;
          moved = false;
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    });
  }

  function addAttachment(file) {
    const id = `lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    state.attachments.push({
      id,
      filename: file.name || 'attachment',
      contentType: file.type || 'application/octet-stream',
      size: Number(file.size) || 0,
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
      });
      box.appendChild(btn);
    }
  }

  async function openContactSuggestions(box, input, wrap) {
    const gen = ++state.suggestGen;
    await ensureContacts(input.value);
    renderContactSuggestions(box, input, wrap, gen);
  }

  function outcomeBannerHtml() {
    const r = state.sim?.result;
    if (!state.sim) {
      return `<div class="re-lab-outcome re-lab-outcome--idle">Compose a message and run triage — dry-run only, nothing is filed.</div>`;
    }
    if (!r) {
      const g = state.sim.gates || {};
      const why = g.sleepMode
        ? 'Blocked by sleep mode'
        : g.beforeCutoff
          ? 'Blocked by inbound cutoff'
          : !g.allowlisted
            ? 'Blocked by sender allowlist'
            : 'Blocked by gate';
      return `<div class="re-lab-outcome re-lab-outcome--blocked"><strong>${escHtml(why)}</strong><span>Toggle “Skip inbound gates” to test the classify path anyway.</span></div>`;
    }
    const bits = [
      r.status,
      r.category,
      r.action,
      r.wouldNotify ? 'would notify' : 'silent',
      r.wouldAgentAlert ? 'agent alert' : null,
    ].filter(Boolean);
    return `<div class="re-lab-outcome re-lab-outcome--ok">
      <strong>${escHtml(bits.join(' · '))}</strong>
      <span>${escHtml(r.summary || r.routeNote || '')}</span>
    </div>`;
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
        cc: root.querySelector('[data-lab-cc]')?.value || state.cc,
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
      'Try an email · tap a rule to edit · drag to set priority · first match wins';
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
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'dash-panel-btn';
    runBtn.dataset.labRun = '1';
    runBtn.textContent = 'Run triage';
    runBtn.addEventListener('click', () => void runSimulation());
    right.append(newRuleBtn, saveOrder, runBtn);
    toolbar.appendChild(right);
    shellEl.appendChild(toolbar);

    const body = document.createElement('div');
    body.className = 're-lab-body';

    // ── Compose (left column beside the pipeline) ──
    const compose = document.createElement('section');
    compose.className = 're-lab-compose';
    compose.innerHTML = `<header class="re-lab-section-head">
      <h2>Try an email</h2>
      <p>Uses live Contacts + the Agent’s triage code. Nothing is written to the inbox.</p>
    </header>`;

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

    const ccLb = document.createElement('label');
    ccLb.className = 'de-label';
    ccLb.textContent = 'Cc';
    const ccIn = document.createElement('input');
    ccIn.className = 'de-input';
    ccIn.dataset.labCc = '1';
    ccIn.placeholder = 'optional';
    ccIn.value = saved?.cc ?? state.cc;
    ccLb.appendChild(ccIn);
    form.appendChild(ccLb);

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
    // Prefer plain text in Source; fall back to HTML so the pane isn't blank.
    bodyIn.value = bodyText || bodyHtml;
    bodyIn.placeholder = bodyHtml
      ? 'Edit HTML or plain text used for this dry-run'
      : 'Message body';

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
            bodyIn.value = state.text || state.html || '';
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
        }
      }
    });

    bodyWrap.append(bodyHead, previewWrap, bodyIn);
    form.appendChild(bodyWrap);
    syncBodyPanes();

    const attBlock = document.createElement('div');
    attBlock.className = 're-lab-attachments';
    const attHead = document.createElement('div');
    attHead.className = 're-lab-att-head';
    attHead.innerHTML = `${iosIcon('paperclip', 16)}<span>Attachments</span>`;
    const attList = document.createElement('ul');
    attList.className = 're-lab-att-list';
    for (const a of state.attachments) {
      const li = document.createElement('li');
      li.textContent = `${a.filename} (${a.contentType || 'file'}${a.size ? `, ${a.size} B` : ''})`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 're-lab-att-rm';
      rm.innerHTML = iosIcon('x', 14);
      rm.addEventListener('click', () => {
        state.attachments = state.attachments.filter((x) => x.id !== a.id);
        renderLabShell(root, { preserveForm: true });
      });
      li.appendChild(rm);
      attList.appendChild(li);
    }
    const fileIn = document.createElement('input');
    fileIn.type = 'file';
    fileIn.multiple = true;
    fileIn.hidden = true;
    const addAtt = document.createElement('button');
    addAtt.type = 'button';
    addAtt.className = 'dash-panel-btn';
    addAtt.textContent = 'Add files';
    addAtt.addEventListener('click', () => fileIn.click());
    fileIn.addEventListener('change', () => {
      for (const f of fileIn.files || []) addAttachment(f);
      fileIn.value = '';
      renderLabShell(root, { preserveForm: true });
    });
    attBlock.append(attHead, attList, addAtt, fileIn);
    form.appendChild(attBlock);

    const gatesLb = document.createElement('label');
    gatesLb.className = 're-check';
    const gatesCb = document.createElement('input');
    gatesCb.type = 'checkbox';
    gatesCb.dataset.labSkipGates = '1';
    gatesCb.checked = saved?.skipGates ?? state.skipGates;
    gatesLb.append(gatesCb, document.createTextNode(' Skip inbound gates (sleep / cutoff / allowlist)'));
    form.appendChild(gatesLb);

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
        const scopeFilter = createSlidingPillSelect({
          value: ruleState().scopeFilter || 'all',
          ariaLabel: 'Filter by rule scope',
          options: [
            { value: 'all', label: 'All' },
            { value: 'universal', label: 'Universal' },
            { value: 'personal', label: 'Personal' },
          ],
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
          const matched =
            state.sim?.ruleEvaluations?.find(
              (e) => (e.rule?.id || e.ruleId) === rule.id || e.rule?.status === rule.status,
            )?.outcome === 'matched';
          if (matched) card.classList.add('re-lab-pipe-card--matched');

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
        const noRuleMatch = !(state.sim?.ruleEvaluations || []).some((e) => e.outcome === 'matched');
        const agentHandled = noRuleMatch && state.sim?.result;
        if (agentHandled) elseCard.classList.add('re-lab-pipe-card--matched');
        elseCard.innerHTML = `
          <span class="re-flow-badge">Else</span>
          <span class="re-lab-pipe-main">
            <span class="re-lab-pipe-title">Agent</span>
            <span class="re-lab-pipe-sub">${
              agentHandled
                ? escHtml(
                    state.sim.result.needsExplain
                      ? 'Agent uncertain → Explain'
                      : `Agent handled → ${state.sim.result.status || 'triage'}`,
                  )
                : 'No match → agent handles this mail'
            }</span>
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

    // ── Playback ──
    const play = document.createElement('section');
    play.className = 're-lab-play';
    play.innerHTML = `<header class="re-lab-section-head">
      <h2>Playback</h2>
      <p>Step through the dry-run decisions.</p>
    </header>`;

    const outcome = document.createElement('div');
    outcome.innerHTML = outcomeBannerHtml();
    play.appendChild(outcome.firstElementChild);

    const controls = document.createElement('div');
    controls.className = 're-lab-controls';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'ios-icon-btn';
    playBtn.dataset.labPlay = '1';
    playBtn.setAttribute('aria-label', 'Play');
    playBtn.innerHTML = iosIcon('play', 18);
    playBtn.addEventListener('click', () => startPlayback());

    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'ios-icon-btn';
    pauseBtn.dataset.labPause = '1';
    pauseBtn.setAttribute('aria-label', 'Pause');
    pauseBtn.innerHTML = iosIcon('pause', 18);
    pauseBtn.addEventListener('click', () => pausePlayback());

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'ios-icon-btn';
    stopBtn.dataset.labStop = '1';
    stopBtn.setAttribute('aria-label', 'Stop');
    stopBtn.innerHTML = iosIcon('square', 16);
    stopBtn.addEventListener('click', () => resetPlayback());

    const stepBtn = document.createElement('button');
    stepBtn.type = 'button';
    stepBtn.className = 'ios-icon-btn';
    stepBtn.setAttribute('aria-label', 'Step forward');
    stepBtn.innerHTML = iosIcon('skip-forward', 18);
    stepBtn.addEventListener('click', () => {
      pausePlayback();
      playNext();
    });

    const counter = document.createElement('span');
    counter.className = 're-lab-step-count';
    counter.dataset.labStepCount = '1';
    counter.textContent = '—';

    controls.append(playBtn, pauseBtn, stopBtn, stepBtn, counter);
    play.appendChild(controls);

    const explain = document.createElement('div');
    explain.className = 're-lab-explain';
    explain.innerHTML =
      '<p class="re-lab-explain-empty">Press Play to walk the same pipeline the Agent uses.</p>';
    play.appendChild(explain);

    const stepList = document.createElement('div');
    stepList.className = 're-lab-steps';
    const steps = state.sim?.steps || [];
    if (!steps.length) {
      const empty = document.createElement('div');
      empty.className = 'de-empty';
      empty.textContent = 'Run triage to see steps.';
      stepList.appendChild(empty);
    } else {
      steps.forEach((step, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `re-lab-step re-lab-step--${step.status}`;
        row.dataset.stepIndex = String(i);
        row.innerHTML = `
          <span class="re-lab-step-idx">${i + 1}</span>
          <span class="re-lab-step-body">
            <span class="re-lab-step-label">${escHtml(step.label)}</span>
            <span class="re-lab-step-decision">${escHtml(step.decision)}</span>
          </span>
          <span class="re-lab-step-kind">${escHtml(step.kind)}</span>`;
        row.addEventListener('click', () => {
          pausePlayback();
          highlightStep(i);
        });
        stepList.appendChild(row);
      });
    }
    play.appendChild(stepList);
    body.appendChild(play);

    shellEl.appendChild(body);
    root.appendChild(shellEl);
    syncPlayButtons();
    syncExpandedRule(root);
    applyRulesFilter(root);
    void ensureContacts();
  }

  return {
    render(root) {
      renderLabShell(root, { preserveForm: false });
    },
    /** Prefill Try-an-email from an inbox record, then re-render (and optionally run). */
    async loadInboxEmail(record, opts = {}) {
      loadFromInboxEmail(record);
      const root = deps.getRuleEditor();
      if (root) renderLabShell(root, { preserveForm: false });
      if (opts.run !== false) await runSimulation();
    },
    syncExpandedRule,
    destroy() {
      stopPlayback();
      closeContactSuggestions(deps.getRuleEditor()?.querySelector('.re-lab-suggest-box'));
    },
    getState: () => state,
  };
}
