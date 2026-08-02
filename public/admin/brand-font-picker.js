/**
 * Searchable Google Fonts picker for admin Company typography fields.
 * Keeps the native <select> in sync for autosave; renders a filterable dropdown.
 */

const MAX_VISIBLE = 60;

function normalizeQuery(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function fontEntryForRole(catalog, role, id) {
  return (catalog || []).find((entry) => entry.id === id);
}

function fontsForRole(catalog, role) {
  return (catalog || []).filter(
    (entry) => entry.id.startsWith('google:') || (Array.isArray(entry.roles) && entry.roles.includes(role)),
  );
}

function filterFonts(catalog, role, query) {
  const pool = fontsForRole(catalog, role);
  const q = normalizeQuery(query);
  if (!q) return pool.slice(0, MAX_VISIBLE);
  const matches = pool.filter((entry) => entry.label.toLowerCase().includes(q));
  return matches.slice(0, MAX_VISIBLE);
}

function syncNativeSelect(select, entry) {
  if (!(select instanceof HTMLSelectElement)) return;
  if (!entry) {
    select.innerHTML = '';
    return;
  }
  select.innerHTML = `<option value="${escapeAttr(entry.id)}" selected>${escapeHtml(entry.label)}</option>`;
  select.value = entry.id;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

/**
 * @param {HTMLSelectElement} selectEl
 * @param {Array<{ id: string, label: string, roles?: string[], family?: string }>} catalog
 * @param {'primary' | 'secondary' | 'content'} role
 */
export function mountBrandFontPicker(selectEl, catalog, role) {
  if (!(selectEl instanceof HTMLSelectElement) || selectEl.dataset.fontPickerMounted === '1') {
    return () => {};
  }
  selectEl.dataset.fontPickerMounted = '1';

  const wrap = document.createElement('div');
  wrap.className = 'prof-font-picker';
  selectEl.parentNode?.insertBefore(wrap, selectEl);
  wrap.appendChild(selectEl);
  selectEl.classList.add('prof-font-picker-native');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'prof-font-picker-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  wrap.insertBefore(trigger, selectEl);

  const panel = document.createElement('div');
  panel.className = 'prof-font-picker-panel';
  panel.hidden = true;

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'prof-font-picker-search';
  search.placeholder = 'Search Google Fonts…';
  search.autocomplete = 'off';
  search.setAttribute('aria-label', 'Search fonts');

  const meta = document.createElement('div');
  meta.className = 'prof-font-picker-meta';

  const list = document.createElement('div');
  list.className = 'prof-font-picker-list';
  list.setAttribute('role', 'listbox');

  panel.appendChild(search);
  panel.appendChild(meta);
  panel.appendChild(list);
  wrap.appendChild(panel);

  let open = false;
  let catalogRef = catalog || [];

  function currentEntry() {
    return fontEntryForRole(catalogRef, role, selectEl.value);
  }

  function syncTrigger() {
    const entry = currentEntry();
    trigger.textContent = entry?.label || 'Choose a font…';
    syncNativeSelect(selectEl, entry);
  }

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      search.value = '';
      renderList('');
      window.requestAnimationFrame(() => search.focus());
    }
  }

  function pick(entry) {
    if (!entry) return;
    syncNativeSelect(selectEl, entry);
    syncTrigger();
    setOpen(false);
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function renderList(query) {
    const results = filterFonts(catalogRef, role, query);
    list.innerHTML = '';
    const q = normalizeQuery(query);
    const total = fontsForRole(catalogRef, role).length;

    if (!results.length) {
      meta.textContent = q ? 'No matching fonts.' : 'No fonts available.';
      return;
    }

    meta.textContent = q
      ? `${results.length} shown · ${total} Google Fonts`
      : `${results.length} popular fonts · ${total} total — type to search`;

    for (const entry of results) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'prof-font-picker-option';
      btn.setAttribute('role', 'option');
      btn.dataset.fontId = entry.id;
      btn.textContent = entry.label;
      if (entry.family) btn.style.fontFamily = `"${entry.family}", sans-serif`;
      if (entry.id === selectEl.value) btn.setAttribute('aria-selected', 'true');
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', () => pick(entry));
      list.appendChild(btn);
    }
  }

  trigger.addEventListener('click', () => setOpen(!open));

  search.addEventListener('input', () => {
    renderList(search.value);
  });

  search.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      setOpen(false);
      trigger.focus();
    }
  });

  document.addEventListener('click', (ev) => {
    if (!open) return;
    if (wrap.contains(ev.target)) return;
    setOpen(false);
  });

  syncTrigger();

  return {
    updateCatalog(nextCatalog) {
      catalogRef = nextCatalog || [];
      syncTrigger();
      if (open) renderList(search.value);
    },
    destroy() {
      setOpen(false);
      wrap.parentNode?.insertBefore(selectEl, wrap);
      wrap.remove();
      selectEl.classList.remove('prof-font-picker-native');
      delete selectEl.dataset.fontPickerMounted;
    },
  };
}

/**
 * @param {ParentNode} root
 * @param {unknown[]} catalog
 */
export function mountCompanyBrandFontPickers(root, catalog) {
  const roles = [
    ['#company-fontPrimary', 'primary'],
    ['#company-fontSecondary', 'secondary'],
    ['#company-fontContent', 'content'],
  ];
  const controllers = [];
  for (const [selector, role] of roles) {
    const select = root.querySelector(selector);
    if (select instanceof HTMLSelectElement) {
      controllers.push(mountBrandFontPicker(select, catalog, role));
    }
  }
  return {
    updateCatalog(nextCatalog) {
      for (const controller of controllers) controller.updateCatalog(nextCatalog);
    },
    destroy() {
      for (const controller of controllers) controller.destroy();
    },
  };
}
