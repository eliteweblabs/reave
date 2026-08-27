/**
 * From / Subject / Body chip composer — Targets + Exemptions pair for the rule editor.
 */
import {
  iosIcon,
  contactAvatarHtml,
  mountContactAvatars,
} from './admin-ui.js?v=20260825h';
import { escHtml } from './shared.js?v=20260810a';

const CHIP_FIELD_OPTIONS = [
  { value: 'from', label: 'From' },
  { value: 'subject', label: 'Subject' },
  { value: 'body', label: 'Body' },
];

export function normalizeTargetPhrase(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

export function normalizeChipField(raw) {
  const v = String(raw || '').trim();
  if (v === 'from' || v === 'subject' || v === 'body') return v;
  return 'body';
}

export function chipFieldLabel(field) {
  if (field === 'from') return 'email';
  return String(field || 'body').trim() || 'body';
}

export function chipPhraseKey(text) {
  return normalizeTargetPhrase(text).toLowerCase();
}

function newChipId() {
  return `chip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function chipPlaceholderFor(field) {
  if (field === 'from') return 'company@company.com';
  if (field === 'subject') return 'Subject phrase';
  return 'Term or phrase';
}

function sameChip(a, b) {
  return a.field === b.field && chipPhraseKey(a.text) === chipPhraseKey(b.text);
}

/** Unique chip texts in first-seen order. */
export function phrasesFromChips(chips) {
  const out = [];
  const seen = new Set();
  for (const chip of Array.isArray(chips) ? chips : []) {
    const text = normalizeTargetPhrase(chip?.text);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** Unique chip fields in first-seen order. */
export function fieldsFromChips(chips, fallback = ['subject', 'body']) {
  const out = [];
  const seen = new Set();
  for (const chip of Array.isArray(chips) ? chips : []) {
    const field = normalizeChipField(chip?.field);
    if (seen.has(field)) continue;
    seen.add(field);
    out.push(field);
  }
  if (out.length) return out;
  const fb = (Array.isArray(fallback) ? fallback : [])
    .map(normalizeChipField)
    .filter((f, i, a) => a.indexOf(f) === i);
  return fb.length ? fb : ['subject', 'body'];
}

/** Stored title is the first unique chip/phrase value. */
export function titleFromRulePhrases(phrases, fallback = 'New rule') {
  const first = (Array.isArray(phrases) ? phrases : [])
    .map((p) => normalizeTargetPhrase(p))
    .find(Boolean);
  if (!first) return fallback;
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}

/**
 * Expand a stored rule into field-tagged chips.
 * One field → one chip per phrase. Several fields → phrase × field so a
 * save round-trips without dropping a Search-in target.
 */
export function chipsFromRulePhrases(phrases, fields) {
  const list = (Array.isArray(phrases) ? phrases : [])
    .map((p) => normalizeTargetPhrase(p))
    .filter(Boolean);
  const flds = (Array.isArray(fields) && fields.length ? fields : ['subject'])
    .map(normalizeChipField)
    .filter((f, i, a) => a.indexOf(f) === i);
  const use = flds.length ? flds : ['subject'];
  if (use.length === 1) {
    return list.map((text) => ({ id: newChipId(), field: use[0], text }));
  }
  return list.flatMap((text) => use.map((field) => ({ id: newChipId(), field, text })));
}

function renderChipListItems(listEl, chips, { disabled = false, tone = 'target', onRemove } = {}) {
  if (!listEl) return;
  listEl.replaceChildren();
  listEl.hidden = !chips.length;
  for (const chip of chips) {
    const li = document.createElement('li');
    li.className = `re-lab-target-chip re-lab-target-chip--${tone}`;
    li.dataset.chipId = chip.id;
    li.dataset.chipField = chip.field;
    li.dataset.chipText = chip.text;
    if (!disabled) {
      li.tabIndex = 0;
      li.setAttribute('aria-grabbed', 'false');
    }
    const contact = chip.contact || null;
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
    label.className = 're-lab-chip-copy';
    const prefix = document.createElement('strong');
    prefix.className = 're-lab-chip-field';
    prefix.textContent = `${chipFieldLabel(chip.field)}:`;
    const value = document.createElement('span');
    value.className = 're-lab-chip-value';
    value.textContent = ` ${chip.text}`;
    label.append(prefix, value);
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 're-lab-target-rm';
    rm.innerHTML = iosIcon('x', 14);
    rm.setAttribute('aria-label', `Remove ${chip.text}`);
    rm.disabled = disabled;
    rm.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onRemove?.(chip.id);
    });
    li.append(label, rm);
    listEl.appendChild(li);
  }
  mountContactAvatars(listEl);
}

/**
 * @param {object} [opts]
 * @param {{ id?: string, field?: string, text?: string, contact?: object|null }[]} [opts.chips]
 * @param {'from'|'subject'|'body'} [opts.field]
 * @param {boolean} [opts.disabled]
 * @param {'target'|'exempt'} [opts.tone]
 * @param {string} [opts.title]
 * @param {string} [opts.ariaLabel]
 * @param {(chip: { field: string, text: string, id?: string }) => boolean} [opts.isTaken]
 * @param {() => void} [opts.onChange]
 */
export function createChipComposer(opts = {}) {
  const tone = opts.tone === 'exempt' ? 'exempt' : 'target';
  const title = String(opts.title || (tone === 'exempt' ? 'Exemptions' : 'Targets')).trim();
  const state = {
    chips: (Array.isArray(opts.chips) ? opts.chips : [])
      .map((c) => ({
        id: c.id || newChipId(),
        field: normalizeChipField(c.field),
        text: normalizeTargetPhrase(c.text),
        contact: c.contact || null,
      }))
      .filter((c) => c.text.length >= 2),
    field: normalizeChipField(opts.field || 'subject'),
    draft: '',
    disabled: opts.disabled === true,
    isTaken: typeof opts.isTaken === 'function' ? opts.isTaken : null,
    contacts: /** @type {{ uid: string, name: string, email?: string, iconUrl?: string, logoUrl?: string }[]} */ ([]),
    suggestGen: 0,
    _suggestOutsideBound: null,
  };

  const el = document.createElement('div');
  el.className = `re-rule-chip-editor re-rule-chip-editor--${tone}`;
  el.dataset.chipTone = tone;

  const heading = document.createElement('div');
  heading.className = 're-chip-col-title';
  heading.textContent = title;

  const probe = document.createElement('input');
  probe.type = 'hidden';
  probe.className = 're-rule-chips-probe';
  probe.setAttribute('aria-hidden', 'true');
  probe.tabIndex = -1;

  const list = document.createElement('ul');
  list.className = 're-lab-target-list';

  const addChip = document.createElement('div');
  addChip.className = `re-lab-target-chip re-lab-target-chip--add re-lab-target-chip--${tone}`;

  const plus = document.createElement('span');
  plus.className = 're-chip-add-plus';
  plus.setAttribute('aria-hidden', 'true');
  plus.innerHTML = iosIcon('plus', 12);

  const typeSel = document.createElement('select');
  typeSel.className = 're-chip-add-type';
  typeSel.setAttribute('aria-label', `${title} field`);
  for (const opt of CHIP_FIELD_OPTIONS) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    typeSel.appendChild(option);
  }
  typeSel.value = state.field;

  const draftWrap = document.createElement('div');
  draftWrap.className = 're-lab-chip-draft-wrap';
  const draftIn = document.createElement('input');
  draftIn.className = 're-chip-add-input';
  draftIn.autocomplete = 'off';
  draftIn.enterKeyHint = 'done';
  draftIn.setAttribute('aria-label', `Add ${title.toLowerCase()}`);
  const suggest = document.createElement('div');
  suggest.className = 're-lab-suggest-box';
  suggest.hidden = true;
  draftWrap.append(draftIn, suggest);

  addChip.append(plus, typeSel, draftWrap);

  el.append(heading, list, addChip, probe);

  function syncProbe() {
    probe.value = JSON.stringify(state.chips.map((c) => ({ field: c.field, text: c.text })));
  }

  function emitChange() {
    syncProbe();
    refreshList();
    opts.onChange?.();
    probe.dispatchEvent(new Event('input', { bubbles: true }));
    probe.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findContactByEmail(email) {
    const needle = String(email || '').trim().toLowerCase();
    if (!needle) return null;
    return state.contacts.find((c) => String(c.email || '').toLowerCase() === needle) || null;
  }

  function flashDup() {
    addChip.classList.remove('is-dup');
    void addChip.offsetWidth;
    addChip.classList.add('is-dup');
    window.setTimeout(() => addChip.classList.remove('is-dup'), 420);
  }

  function chipTaken(partial, exceptId = '') {
    const field = normalizeChipField(partial.field || state.field);
    const text = normalizeTargetPhrase(partial.text);
    if (!text) return false;
    const own = state.chips.some(
      (c) => c.id !== exceptId && (sameChip(c, { field, text }) || chipPhraseKey(c.text) === chipPhraseKey(text)),
    );
    if (own) return true;
    return state.isTaken?.({ field, text, id: exceptId }) === true;
  }

  function refreshList() {
    for (const chip of state.chips) {
      if (chip.field === 'from' && !chip.contact) {
        chip.contact = findContactByEmail(chip.text);
      }
    }
    renderChipListItems(list, state.chips, {
      disabled: state.disabled,
      tone,
      onRemove: (id) => {
        if (state.disabled) return;
        state.chips = state.chips.filter((c) => c.id !== id);
        emitChange();
      },
    });
  }

  function syncDraftInput() {
    draftIn.placeholder = chipPlaceholderFor(state.field);
    draftIn.type = state.field === 'from' ? 'email' : 'text';
    draftIn.disabled = state.disabled;
    typeSel.disabled = state.disabled;
    draftIn.value = state.draft;
    addChip.hidden = state.disabled;
  }

  function addChipRecord(partial) {
    if (state.disabled) return false;
    const field = normalizeChipField(partial.field || state.field);
    const text = normalizeTargetPhrase(partial.text);
    if (text.length < 2) return false;
    if (chipTaken({ field, text }, partial.id || '')) {
      flashDup();
      return false;
    }
    const id = partial.id || newChipId();
    state.chips.push({
      id,
      field,
      text,
      contact: partial.contact || (field === 'from' ? findContactByEmail(text) : null),
    });
    state.draft = '';
    draftIn.value = '';
    closeContactSuggestions();
    emitChange();
    return true;
  }

  function removeChip(id) {
    const next = state.chips.filter((c) => c.id !== id);
    if (next.length === state.chips.length) return false;
    state.chips = next;
    emitChange();
    return true;
  }

  function closeContactSuggestions() {
    suggest.hidden = true;
    suggest.replaceChildren();
    if (state._suggestOutsideBound) {
      document.removeEventListener('pointerdown', state._suggestOutsideBound, true);
      state._suggestOutsideBound = null;
    }
  }

  function bindSuggestOutside() {
    if (state._suggestOutsideBound) return;
    state._suggestOutsideBound = (ev) => {
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (draftWrap.contains(t) || suggest.contains(t)) return;
      closeContactSuggestions();
    };
    document.addEventListener('pointerdown', state._suggestOutsideBound, true);
  }

  function renderContactSuggestions() {
    if (state.field !== 'from' || state.disabled) {
      closeContactSuggestions();
      return;
    }
    const q = (draftIn.value || '').trim().toLowerCase();
    const matches = state.contacts
      .filter(
        (c) =>
          !q ||
          c.email?.toLowerCase().includes(q) ||
          c.name?.toLowerCase().includes(q),
      )
      .slice(0, 8);
    suggest.replaceChildren();
    if (!matches.length) {
      closeContactSuggestions();
      return;
    }
    suggest.hidden = false;
    bindSuggestOutside();
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
        addChipRecord({ field: 'from', text: c.email, contact: c });
        draftIn.blur();
      });
      suggest.appendChild(btn);
    }
    mountContactAvatars(suggest);
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
    } catch {
      state.contacts = [];
    }
  }

  async function openContactSuggestions() {
    if (state.field !== 'from' || state.disabled) {
      closeContactSuggestions();
      return;
    }
    const gen = ++state.suggestGen;
    await ensureContacts(draftIn.value);
    if (gen !== state.suggestGen) return;
    renderContactSuggestions();
    refreshList();
  }

  function applyDisabled() {
    draftIn.disabled = state.disabled;
    typeSel.disabled = state.disabled;
    addChip.hidden = state.disabled;
    if (state.disabled) closeContactSuggestions();
    syncDraftInput();
    refreshList();
  }

  const commitDraft = () => {
    state.draft = draftIn.value;
    if (addChipRecord({ field: state.field, text: draftIn.value })) {
      draftIn.focus();
    }
  };

  typeSel.addEventListener('change', () => {
    if (state.disabled) return;
    state.field = normalizeChipField(typeSel.value);
    syncDraftInput();
    if (state.field !== 'from') closeContactSuggestions();
    else void openContactSuggestions();
    draftIn.focus();
  });

  draftIn.addEventListener('input', () => {
    state.draft = draftIn.value;
    if (state.field === 'from') void openContactSuggestions();
  });
  draftIn.addEventListener('focus', () => {
    if (state.field === 'from') void openContactSuggestions();
  });
  draftIn.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commitDraft();
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeContactSuggestions();
    }
  });

  syncDraftInput();
  syncProbe();
  applyDisabled();
  void ensureContacts().then(() => refreshList());

  return {
    el,
    listEl: list,
    probe,
    tone,
    getChips: () => state.chips.slice(),
    hasPhrase: (text) => {
      const key = chipPhraseKey(text);
      return Boolean(key) && state.chips.some((c) => chipPhraseKey(c.text) === key);
    },
    addChip: addChipRecord,
    removeChip,
    takeChip: (id) => {
      const chip = state.chips.find((c) => c.id === id);
      if (!chip) return null;
      state.chips = state.chips.filter((c) => c.id !== id);
      emitChange();
      return chip;
    },
    takePhrase: (text) => {
      const key = chipPhraseKey(text);
      if (!key) return [];
      const moved = state.chips.filter((c) => chipPhraseKey(c.text) === key);
      if (!moved.length) return [];
      state.chips = state.chips.filter((c) => chipPhraseKey(c.text) !== key);
      emitChange();
      return moved;
    },
    commitDraft,
    focusDraft: () => {
      if (!state.disabled) draftIn.focus();
    },
    setDisabled: (disabled) => {
      state.disabled = disabled === true;
      applyDisabled();
    },
    setIsTaken: (fn) => {
      state.isTaken = typeof fn === 'function' ? fn : null;
    },
  };
}

/**
 * Two-column Targets / Exemptions editor. Same phrase cannot live in both
 * columns or be created twice.
 */
export function createChipPair(opts = {}) {
  const disabled = opts.disabled === true;
  const pair = document.createElement('div');
  pair.className = 're-chip-pair';
  const targetKeys = new Set(
    (Array.isArray(opts.targets) ? opts.targets : [])
      .map((c) => chipPhraseKey(c?.text))
      .filter(Boolean),
  );
  const exemptionChips = (Array.isArray(opts.exemptions) ? opts.exemptions : []).filter(
    (c) => !targetKeys.has(chipPhraseKey(c?.text)),
  );

  const targets = createChipComposer({
    chips: opts.targets,
    field: opts.targetField || 'subject',
    disabled,
    tone: 'target',
    title: 'Targets',
    ariaLabel: 'Target field',
    onChange: opts.onChange,
  });
  const exemptions = createChipComposer({
    chips: exemptionChips,
    field: opts.exemptField || 'subject',
    disabled,
    tone: 'exempt',
    title: 'Exemptions',
    ariaLabel: 'Exemption field',
    onChange: opts.onChange,
  });

  targets.setIsTaken((chip) => exemptions.hasPhrase(chip.text));
  exemptions.setIsTaken((chip) => targets.hasPhrase(chip.text));

  const targetCol = document.createElement('div');
  targetCol.className = 're-chip-col re-chip-col--target';
  targetCol.dataset.chipCol = 'target';
  targetCol.appendChild(targets.el);

  const exemptCol = document.createElement('div');
  exemptCol.className = 're-chip-col re-chip-col--exempt';
  exemptCol.dataset.chipCol = 'exempt';
  exemptCol.appendChild(exemptions.el);

  pair.append(targetCol, exemptCol);

  function composerFor(tone) {
    return tone === 'exempt' ? exemptions : targets;
  }

  function columnFromPoint(x, y) {
    const node = document.elementFromPoint(x, y);
    const col = node?.closest?.('[data-chip-col]');
    const tone = col?.dataset?.chipCol;
    return tone === 'exempt' || tone === 'target' ? tone : null;
  }

  if (!disabled) {
    let drag = null;

    const endDrag = (ev, commit) => {
      if (!drag) return;
      if (ev && drag.pointerId != null && ev.pointerId !== drag.pointerId) return;
      const { chip, from, ghost, sourceEl } = drag;
      const x = ev?.clientX ?? drag.x;
      const y = ev?.clientY ?? drag.y;
      const dest = commit ? columnFromPoint(x, y) : null;
      ghost?.remove();
      sourceEl?.classList.remove('re-lab-target-chip--dragging');
      sourceEl?.removeAttribute('aria-grabbed');
      pair.classList.remove('re-chip-pair--dragging');
      targetCol.classList.remove('is-drop');
      exemptCol.classList.remove('is-drop');
      drag = null;
      if (!dest || dest === from) return;
      const destComposer = composerFor(dest);
      if (destComposer.hasPhrase(chip.text)) return;
      const source = composerFor(from);
      const moved = source.takePhrase(chip.text);
      if (!moved.length) return;
      const keep = moved[0];
      if (!destComposer.addChip(keep)) {
        moved.forEach((c) => source.addChip(c));
      }
    };

    const onMove = (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      if (!drag.active && (dx * dx + dy * dy) < 36) return;
      if (!drag.active) {
        drag.active = true;
        pair.classList.add('re-chip-pair--dragging');
        drag.sourceEl.classList.add('re-lab-target-chip--dragging');
        drag.sourceEl.setAttribute('aria-grabbed', 'true');
        const ghost = drag.sourceEl.cloneNode(true);
        ghost.classList.add('re-lab-target-chip--ghost');
        ghost.querySelector('.re-lab-target-rm')?.remove();
        document.body.appendChild(ghost);
        drag.ghost = ghost;
        try {
          drag.sourceEl.setPointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
      }
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      if (drag.ghost) {
        drag.ghost.style.transform = `translate(${ev.clientX - drag.offsetX}px, ${ev.clientY - drag.offsetY}px)`;
      }
      const dest = columnFromPoint(ev.clientX, ev.clientY);
      targetCol.classList.toggle('is-drop', dest === 'target');
      exemptCol.classList.toggle('is-drop', dest === 'exempt');
      ev.preventDefault();
    };

    pair.addEventListener('pointerdown', (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (t.closest('.re-lab-target-rm, .re-lab-target-chip--add, select, input, textarea, button')) return;
      const chipEl = t.closest('.re-lab-target-chip[data-chip-id]');
      const col = chipEl?.closest('[data-chip-col]');
      const from = col?.dataset?.chipCol;
      if (!chipEl || (from !== 'target' && from !== 'exempt')) return;
      const source = composerFor(from);
      const chip = source.getChips().find((c) => c.id === chipEl.dataset.chipId);
      if (!chip) return;
      const rect = chipEl.getBoundingClientRect();
      drag = {
        chip,
        from,
        sourceEl: chipEl,
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        x: ev.clientX,
        y: ev.clientY,
        offsetX: ev.clientX - rect.left,
        offsetY: ev.clientY - rect.top,
        active: false,
        ghost: null,
      };
    });
    pair.addEventListener('pointermove', onMove);
    pair.addEventListener('pointerup', (ev) => endDrag(ev, true));
    pair.addEventListener('pointercancel', (ev) => endDrag(ev, false));
  }

  return {
    el: pair,
    targets,
    exemptions,
    matchChips: targets,
    exceptChips: exemptions,
  };
}
