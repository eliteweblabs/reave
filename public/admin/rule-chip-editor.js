/**
 * From / Subject / Body chip composer — same control as the Email Lab tester.
 */
import {
  iosIcon,
  createSlidingPillSelect,
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

function newChipId() {
  return `chip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function chipPlaceholderFor(field) {
  if (field === 'from') return 'company@company.com';
  if (field === 'subject') return 'Subject phrase';
  return 'Term or phrase';
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

function renderChipListItems(listEl, chips, { disabled = false, onRemove } = {}) {
  if (!listEl) return;
  listEl.replaceChildren();
  listEl.hidden = !chips.length;
  for (const chip of chips) {
    const li = document.createElement('li');
    li.className = 're-lab-target-chip';
    li.dataset.chipId = chip.id;
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
    label.textContent = `${chipFieldLabel(chip.field)}: ${chip.text}`;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 're-lab-target-rm';
    rm.innerHTML = iosIcon('x', 14);
    rm.setAttribute('aria-label', `Remove ${chip.text}`);
    rm.disabled = disabled;
    rm.addEventListener('click', () => onRemove?.(chip.id));
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
 * @param {string} [opts.ariaLabel]
 * @param {() => void} [opts.onChange]
 */
export function createChipComposer(opts = {}) {
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
    contacts: /** @type {{ uid: string, name: string, email?: string, iconUrl?: string, logoUrl?: string }[]} */ ([]),
    suggestGen: 0,
    _suggestOutsideBound: null,
  };

  const el = document.createElement('div');
  el.className = 're-rule-chip-editor';

  const probe = document.createElement('input');
  probe.type = 'hidden';
  probe.className = 're-rule-chips-probe';
  probe.setAttribute('aria-hidden', 'true');
  probe.tabIndex = -1;

  const list = document.createElement('ul');
  list.className = 're-lab-target-list';

  const fieldPills = createSlidingPillSelect({
    value: state.field,
    ariaLabel: opts.ariaLabel || 'Filter target field',
    options: CHIP_FIELD_OPTIONS,
    scrollable: true,
    onChange: (value) => {
      if (state.disabled) return;
      state.field = normalizeChipField(value);
      syncDraftInput();
      if (state.field !== 'from') closeContactSuggestions();
      draftIn.focus();
    },
  });
  const fieldBar = document.createElement('div');
  fieldBar.className = 're-lab-field-pills';
  fieldBar.appendChild(fieldPills.el);

  const addRow = document.createElement('div');
  addRow.className = 're-lab-chip-add';
  const draftWrap = document.createElement('div');
  draftWrap.className = 're-lab-chip-draft-wrap';
  const draftIn = document.createElement('input');
  draftIn.className = 'de-input';
  draftIn.autocomplete = 'off';
  draftIn.enterKeyHint = 'done';
  const suggest = document.createElement('div');
  suggest.className = 're-lab-suggest-box';
  suggest.hidden = true;
  draftWrap.append(draftIn, suggest);
  addRow.appendChild(draftWrap);
  el.append(list, fieldBar, addRow, probe);

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

  function refreshList() {
    for (const chip of state.chips) {
      if (chip.field === 'from' && !chip.contact) {
        chip.contact = findContactByEmail(chip.text);
      }
    }
    renderChipListItems(list, state.chips, {
      disabled: state.disabled,
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
    draftIn.value = state.draft;
  }

  function addChip(partial) {
    if (state.disabled) return false;
    const field = normalizeChipField(partial.field || state.field);
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
    state.draft = '';
    draftIn.value = '';
    closeContactSuggestions();
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
        addChip({ field: 'from', text: c.email, contact: c });
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
    fieldPills.el.querySelectorAll('button').forEach((btn) => {
      btn.disabled = state.disabled;
    });
    if (state.disabled) closeContactSuggestions();
    refreshList();
  }

  const commitDraft = () => {
    state.draft = draftIn.value;
    if (addChip({ field: state.field, text: draftIn.value })) {
      draftIn.focus();
    }
  };

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
    probe,
    getChips: () => state.chips.slice(),
    commitDraft,
    focusDraft: () => {
      if (!state.disabled) draftIn.focus();
    },
    setDisabled: (disabled) => {
      state.disabled = disabled === true;
      applyDisabled();
    },
  };
}
