/**
 * Email triage Lab — compose a message, drag rule priority, play the same
 * processInboundEmail dry-run the Agent uses (POST /api/email/simulate).
 */
import { iosIcon } from './admin-ui.js?v=20260812b';
import { escHtml } from './shared.js?v=20260810a';
import { osAlert } from './os-dialog.js?v=20260728q';

/** Fixed downstream stages (production order) — not user-reorderable. */
export const PIPELINE_FUNCTIONS = [
  { id: 'normalize', label: 'Normalize message', sub: 'Body · attachments · OTP extract' },
  { id: 'rules', label: 'Keyword rules', sub: 'First match wins · sort order' },
  { id: 'agent_rule', label: 'Agent (else)', sub: 'No match → draft rule form' },
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
 * @param {(view: string) => void} deps.setRulesView
 * @param {() => HTMLElement | null} deps.getRuleEditor
 * @param {() => Promise<void>} deps.reloadRules
 * @param {() => { el: HTMLElement }} deps.createRulesViewPicker
 * @param {(proposed: object) => void | Promise<void>} [deps.openProposedRule]
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
    state.text = root.querySelector('[data-lab-body]')?.value || '';
    state.skipGates = Boolean(root.querySelector('[data-lab-skip-gates]')?.checked);
  }

  async function runSimulation() {
    const root = deps.getRuleEditor();
    if (!root || state.running) return;
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

  function attachRuleReorder(listEl) {
    let dragEl = null;
    let moved = false;

    listEl.querySelectorAll('.re-lab-grip').forEach((grip) => {
      grip.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const row = grip.closest('.re-lab-pipe-card');
        if (!row || row.dataset.locked === '1') return;
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
      saved = {
        from: root.querySelector('[data-lab-from]')?.value || '',
        fromName: root.querySelector('[data-lab-from-name]')?.value || '',
        to: root.querySelector('[data-lab-to]')?.value || state.to,
        cc: root.querySelector('[data-lab-cc]')?.value || state.cc,
        subject: root.querySelector('[data-lab-subject]')?.value || state.subject,
        text: root.querySelector('[data-lab-body]')?.value || state.text,
        skipGates: Boolean(root.querySelector('[data-lab-skip-gates]')?.checked ?? state.skipGates),
      };
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
    left.appendChild(deps.createRulesViewPicker().el);
    const hint = document.createElement('p');
    hint.className = 're-flow-hint';
    hint.textContent = 'Flow = live ladder · try an email · first match wins · Agent drafts a rule when nothing matches';
    left.appendChild(hint);
    toolbar.appendChild(left);

    const right = document.createElement('div');
    right.className = 're-flow-toolbar-right re-lab-toolbar-actions';
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
    right.append(saveOrder, runBtn);
    toolbar.appendChild(right);
    shellEl.appendChild(toolbar);

    const body = document.createElement('div');
    body.className = 're-lab-body';

    // ── Compose ──
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

    const bodyLb = document.createElement('label');
    bodyLb.className = 'de-label';
    bodyLb.textContent = 'Body';
    const bodyIn = document.createElement('textarea');
    bodyIn.className = 'de-input re-textarea';
    bodyIn.dataset.labBody = '1';
    bodyIn.rows = 8;
    bodyIn.value = saved?.text ?? state.text;
    bodyLb.appendChild(bodyIn);
    form.appendChild(bodyLb);

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
      <p>Drag rules to set priority. Downstream functions stay in the Agent’s fixed order.</p>
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
      if (fn.id === 'rules') {
        const spine = document.createElement('div');
        spine.className = 're-flow-spine';
        spine.textContent = '↓ keyword rules (drag to reorder)';
        pipeList.appendChild(spine);

        orderedRules().forEach((rule, i) => {
          const card = document.createElement('div');
          card.className = 're-lab-pipe-card re-lab-pipe-card--rule';
          card.dataset.kind = 'rule';
          card.dataset.stage = 'rules';
          card.dataset.ruleId = rule.id;
          if (rule.enabled === false) card.classList.add('re-lab-pipe-card--off');
          const matched =
            state.sim?.ruleEvaluations?.find(
              (e) => (e.rule?.id || e.ruleId) === rule.id || e.rule?.status === rule.status,
            )?.outcome === 'matched';
          if (matched) card.classList.add('re-lab-pipe-card--matched');
          card.innerHTML = `
            <button type="button" class="re-lab-grip" aria-label="Drag to reorder" title="Drag to reorder">${iosIcon('grip', 16)}</button>
            <span class="re-lab-pri">#${i + 1}</span>
            <span class="re-lab-pipe-main">
              <span class="re-flow-badge">When</span>
              <span class="re-lab-pipe-title">${escHtml(rule.title || rule.status)}</span>
              <span class="re-lab-pipe-sub">${escHtml(rule.status)} · ${rule.notify ? 'Notify' : 'Silent'}${rule.enabled === false ? ' · Off' : ''}</span>
            </span>`;
          pipeList.appendChild(card);
        });

        const elseCard = document.createElement('div');
        elseCard.className = 're-lab-pipe-card re-lab-pipe-card--else re-lab-pipe-card--agent';
        elseCard.dataset.stage = 'agent_rule';
        elseCard.dataset.kind = 'agent_rule';
        const proposed = state.sim?.proposedRule || state.sim?.result?.proposedRule;
        elseCard.innerHTML = `
          <span class="re-flow-badge">Else</span>
          <span class="re-lab-pipe-main">
            <span class="re-lab-pipe-title">Agent</span>
            <span class="re-lab-pipe-sub">${
              proposed
                ? escHtml(`Propose → ${proposed.title || proposed.status}`)
                : 'No match → agent fills a rule form'
            }</span>
          </span>`;
        if (proposed) {
          elseCard.classList.add('re-lab-pipe-card--matched');
          elseCard.style.cursor = 'pointer';
          elseCard.title = 'Open agent-proposed rule';
          elseCard.addEventListener('click', () => {
            void deps.openProposedRule?.(proposed);
          });
        }
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
    void ensureContacts();
  }

  return {
    render(root) {
      renderLabShell(root, { preserveForm: false });
    },
    destroy() {
      stopPlayback();
      closeContactSuggestions(deps.getRuleEditor()?.querySelector('.re-lab-suggest-box'));
    },
    getState: () => state,
  };
}
