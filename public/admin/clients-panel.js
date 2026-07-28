/**
 * clients panel — extracted from os-map-loader.js
 */
import {
  IOS_ICONS,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  createSlidingPillSelect,
  createPanelBackBtn,
  createPaneSubheader,
  wrapEditableHeaderTitle,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
  matchesListSearch,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  showContextMenu,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  swipeJunkAction,
  swipeReceiptAction,
  swipeClearAction,
  paneDeleteIcon,
  paneShareIcon,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
} from './admin-ui.js?v=20260728i';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText } from './shared.js?v=20260728i';
import { navigateToWork, mountClientWorkSection } from './work-panel.js?v=20260728i';
import { createClientMap } from '/admin/client-map.js';

/** Injected by os-map-loader via initClientsPanel(). */
let shell = {};

export function initClientsPanel(deps) {
  shell = deps;
}

// ---- extracted from os-map-loader.js:13090-14743 ----
// ---- clients tab ----

let clientState = {
  clients: [],
  total: 0,
  search: '',
  contactFilter: 'work',
  activeUid: null,
  detailTab: 'profile',
  dirty: false,
  draft: null,
};
let clientSearchTimer = null;
let clientAutosaveTimer = null;
let clientFieldRegistry = [];
let clientMapController = null;
let clientPendingGeo = null;
let destroyClientAddressAutocomplete = null;

function destroyClientMap() {
  if (clientMapController) {
    clientMapController.destroy();
    clientMapController = null;
  }
}

function clearClientFieldRegistry() {
  clientFieldRegistry = [];
  destroyClientMap();
  if (destroyClientAddressAutocomplete) {
    destroyClientAddressAutocomplete();
    destroyClientAddressAutocomplete = null;
  }
  clientPendingGeo = null;
}

const CLIENT_FIELD_VALID = 'de-field-valid';
const CLIENT_FIELD_INVALID = 'de-field-invalid';

let clientActiveField = null;

function phoneDigits(value) {
  return (value || '').replace(/\D/g, '');
}

/** Display format for tel inputs — US/Canada (+1) by default. */
function formatPhoneInput(value) {
  const digits = phoneDigits(value);
  if (!digits) return '';
  const us = (digits.startsWith('1') ? digits.slice(1) : digits).slice(0, 10);
  if (us.length < 4) return `+1 (${us}`;
  if (us.length < 7) return `+1 (${us.slice(0, 3)}) ${us.slice(3)}`;
  return `+1 (${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
}

/** Store phones as E.164 for SMS/API. */
function phoneToStorage(display) {
  const digits = phoneDigits(display);
  if (!digits) return '';
  const us = (digits.startsWith('1') && digits.length >= 11 ? digits.slice(1) : digits).slice(0, 10);
  if (us.length === 10) return `+1${us}`;
  return `+${digits}`;
}

function isValidClientEmail(value) {
  const v = (value || '').trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidClientPhone(value) {
  const digits = phoneDigits(value);
  if (!digits) return true;
  return digits.length >= 10 && digits.length <= 15;
}

function setClientFieldValidationState(el, show, valid) {
  el.classList.remove(CLIENT_FIELD_VALID, CLIENT_FIELD_INVALID, FORM_FIELD_INVALID, FORM_FIELD_SAVED);
  if (!show) return;
  if (!valid) {
    el.classList.add(CLIENT_FIELD_INVALID, FORM_FIELD_INVALID);
  }
}

function registerClientField(el, validateFn) {
  let touched = false;

  const applyValidation = () => {
    if (!touched) {
      setClientFieldValidationState(el, false, true);
      return;
    }
    const valid = validateFn();
    const focused = document.activeElement === el;
    const show = !focused && !valid;
    setClientFieldValidationState(el, show, valid);
  };

  const ctrl = {
    el,
    touch() {
      touched = true;
      applyValidation();
    },
    refresh: applyValidation,
    reset() {
      touched = false;
      applyValidation();
    },
  };

  el.addEventListener('blur', () => {
    touched = true;
    applyValidation();
  });
  el.addEventListener('input', () => {
    if (document.activeElement !== el) return;
    touched = true;
    applyValidation();
  });
  el.addEventListener('focus', applyValidation);

  clientFieldRegistry.push(ctrl);
  return ctrl;
}

function refreshAllClientFields() {
  for (const f of clientFieldRegistry) f.refresh();
}

function attachPhoneFormatter(input) {
  input.type = 'tel';
  input.autocomplete = 'tel';
  input.placeholder = '+1 (555) 000-0000';
  input.addEventListener('input', () => {
    const formatted = formatPhoneInput(input.value);
    if (formatted !== input.value) {
      input.value = formatted;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

function getClientsEditor() { return document.getElementById('clients-editor'); }

function clientListTitle(c) {
  return (c.company || '').trim() || (c.name || '').trim() || 'Client';
}

function clientListSubline(c) {
  const company = (c.company || '').trim();
  const name = (c.name || '').trim();
  if (company && name && name.toLowerCase() !== company.toLowerCase()) return name;
  return c.email || c.phone || `${c.uid.slice(0, 8)}…`;
}

const CLIENT_LIST_AVATAR_PLACEHOLDER =
  '<span class="cl-list-avatar cl-list-avatar--placeholder" aria-hidden="true">' +
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>' +
  '<circle cx="12" cy="7" r="4"/>' +
  '</svg></span>';

function clientListAvatarHtml(c) {
  const url =
    clientBrandingPreviewUrl(c.iconUrl) || clientBrandingPreviewUrl(c.logoUrl);
  if (url) {
    return (
      `<span class="cl-list-avatar">` +
      `<img class="cl-list-avatar-img" src="${escHtml(url)}" alt="" loading="lazy" decoding="async" />` +
      `</span>`
    );
  }
  return CLIENT_LIST_AVATAR_PLACEHOLDER;
}

function filterClientsForSidebar(clients) {
  const f = clientState.contactFilter;
  if (f === 'personal') return clients.filter((c) => c.personal);
  if (f === 'work') return clients.filter((c) => !c.personal);
  return clients;
}

function clientFilterCounts(clients) {
  const work = clients.filter((c) => !c.personal).length;
  const personal = clients.filter((c) => c.personal).length;
  return { all: clients.length, work, personal };
}

function renderClientFilterTabs(savedScrollLeft = 0) {
  const counts = clientFilterCounts(clientState.clients);
  const nav = document.createElement('div');
  nav.className = 'em-filter-tabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Client list filters');

  const tabs = [
    { id: 'work', label: 'Projects', count: counts.work },
    { id: 'personal', label: 'Personal', count: counts.personal },
    { id: 'all', label: 'All', count: counts.all },
  ];

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = clientState.contactFilter === tab.id;
    btn.className = 'em-filter-tab' + (isActive ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.innerHTML = `${escHtml(tab.label)} <span class="em-filter-count">${tab.count}</span>`;
    btn.addEventListener('click', () => {
      if (clientState.contactFilter === tab.id) return;
      clientState.contactFilter = tab.id;
      const visible = filterClientsForSidebar(clientState.clients);
      if (clientState.activeUid && !visible.some((c) => c.uid === clientState.activeUid)) {
        clientState.activeUid = null;
        clientState.draft = null;
        clientState.autosaveGetPayload = null;
        getClientsEditor()?.classList.remove('de-pane-active');
      }
      renderClientsEditor();
    });
    nav.appendChild(btn);
  }

  shell.mountFilterTabsScroll(nav, savedScrollLeft);
  return nav;
}

async function fetchClientsList() {
  const params = new URLSearchParams();
  if (clientState.search.trim()) params.set('q', clientState.search.trim());
  const qs = params.toString();
  const res = await fetch(`/api/clients${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  clientState.clients = data.clients || [];
  clientState.total = data.total ?? clientState.clients.length;
}

async function loadClientsTab(opts = {}) {
  const root = getClientsEditor();
  if (!root) return;
  root.innerHTML = '<div class="de-loading">Loading clients…</div>';
  try {
    await fetchClientsList();
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }
  const deepUid = opts.clientUid || pendingClientDeepLinkUid || parseClientDeepLinkFromUrl();
  pendingClientDeepLinkUid = null;
  clientState.activeUid = deepUid || null;
  clientState.dirty = false;
  clientState.draft = null;
  shell.clearEditorFooterSave();
  if (!clientState.activeUid) getClientsEditor()?.classList.remove('de-pane-active');
  renderClientsEditor();
  if (deepUid && shell.isMobileTabs()) getClientsEditor()?.classList.add('de-pane-active');
}

function scheduleClientSearch() {
  clearTimeout(clientSearchTimer);
  clientSearchTimer = setTimeout(async () => {
    try {
      await fetchClientsList();
      renderClientsEditor();
    } catch (e) {
      alert(`Search failed: ${e.message}`);
    }
  }, 300);
}

function fillClientsSidebarList(list) {
  const { clients } = clientState;
  const visible = filterClientsForSidebar(clients);
  list.innerHTML = '';
  for (const c of visible) {
    list.appendChild(createClientSwipeRow(c));
  }
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    const filterLabel =
      clientState.contactFilter === 'personal'
        ? 'No personal contacts yet.'
        : clientState.contactFilter === 'work'
          ? 'No clients yet.'
          : clientState.search.trim()
            ? 'No matches.'
            : 'No clients yet.';
    empty.textContent = clientState.search.trim() && clientState.contactFilter === 'all'
      ? 'No matches.'
      : filterLabel;
    list.appendChild(empty);
  }
}

function refreshClientsSidebarList() {
  const root = getClientsEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderClientsEditor();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput) {
    const visible = filterClientsForSidebar(clientState.clients);
    const clientLabel = visible.length === 1 ? 'Client' : 'Clients';
    searchInput.placeholder = `Search ${visible.length} ${clientLabel}`;
  }
  fillClientsSidebarList(list);
}

function startNewClient() {
  armTitleFocus('clients');
  shell.beginCreateDrawer({
    key: 'clients',
    title: 'New Client',
    submitLabel: 'Add',
    onDismiss: () => {
      clientState.activeUid = null;
      clientState.draft = null;
      getClientsEditor()?.classList.remove('de-pane-active');
      renderClientsEditor();
    },
  });
  clientState.activeUid = '__new__';
  clientState.dirty = false;
  clientState.draft = {
    name: '',
    email: '',
    phone: '',
    company: '',
    website: '',
    notes: '',
    personal: false,
  };
  renderClientsEditor();
}

function renderClientsEditor() {
  const root = getClientsEditor();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll(root);
  const savedFilterScroll = shell.captureFilterTabsScroll(root);
  const { clients, activeUid } = clientState;
  const visibleCount = filterClientsForSidebar(clients).length;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const clientLabel = visibleCount === 1 ? 'Client' : 'Clients';
  const subheader = listSearchSubheader({
    itemCount: visibleCount,
    search: {
      value: clientState.search,
      placeholder: `Search ${visibleCount} ${clientLabel}`,
      onInput: (value) => {
        clientState.search = value;
        scheduleClientSearch();
      },
    },
    below: renderClientFilterTabs(savedFilterScroll),
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  fillClientsSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';

  if (activeUid === '__new__') {
    renderNewClientForm(pane);
    shell.mountCreateDrawerChrome(pane);
  } else if (activeUid) {
    renderEditClientForm(pane);
  } else {
    shell.clearEditorFooterSave();
    shell.appendEmptyDetailPane(pane, {
      mapKey: 'clients',
      iconName: 'users',
      bodyHtml: '<p>Select a client to edit, or add a new one.</p>',
      btnLabel: 'Add New',
      onCreate: () => startNewClient(),
    });
  }

  root.appendChild(pane);
  flushTitleFocus('clients');
  shell.finishSidebarListScroll(root, savedSidebarScroll);
}

function syncClTitleInputWidth(input) {
  if (!input) return;
  const text = input.value || input.placeholder || 'M';
  input.style.width = `${Math.max(text.length, 4)}ch`;
}

function splitClientNameParts(contact) {
  const first = (contact.firstName || '').trim();
  const last = (contact.lastName || '').trim();
  if (first || last) return { firstName: first, lastName: last };
  const full = (contact.name || '').trim();
  if (!full) return { firstName: '', lastName: '' };
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function joinClientFullName(firstName, lastName, company = '') {
  const person = [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(' ');
  return person || company.trim();
}

function clientDisplayLabel(draft) {
  return draft?.company?.trim() || joinClientFullName(draft?.firstName, draft?.lastName) || draft?.name || 'Client';
}

function syncClientListAvatar(uid, patch = {}) {
  const c = clientState.clients.find((x) => x.uid === uid);
  if (c) {
    if ('logoUrl' in patch) c.logoUrl = patch.logoUrl || '';
    if ('iconUrl' in patch) c.iconUrl = patch.iconUrl || '';
  }
  const item = getClientsEditor()?.querySelector(`.ch-list-item[data-id="${CSS.escape(uid)}"]`);
  if (!item) return;
  const host = item.querySelector('.cl-list-avatar-wrap');
  if (!host) return;
  host.innerHTML = clientListAvatarHtml(c || { uid, ...patch });
}

function appendClientField(parent, label, input) {
  const wrap = document.createElement('label');
  wrap.className = 'de-label';
  wrap.textContent = label;
  wrap.appendChild(input);
  parent.appendChild(wrap);
}

function mountClientPersonalToggle(parent, initial, onChange) {
  const row = document.createElement('div');
  row.className = 'cl-personal-row';
  const switchLabel = document.createElement('label');
  switchLabel.className = 'nl-switch cl-personal-switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!initial;
  input.setAttribute('aria-label', 'Personal contact');
  const track = document.createElement('span');
  track.className = 'nl-switch-track';
  switchLabel.appendChild(input);
  switchLabel.appendChild(track);
  const text = document.createElement('div');
  text.className = 'cl-personal-text';
  const title = document.createElement('div');
  title.className = 'cl-personal-title';
  title.textContent = 'Personal contact';
  const desc = document.createElement('div');
  desc.className = 'cl-personal-desc';
  desc.textContent = 'Services and people you won\u2019t create projects for.';
  text.appendChild(title);
  text.appendChild(desc);
  row.appendChild(switchLabel);
  row.appendChild(text);
  parent.appendChild(row);
  input.addEventListener('change', () => onChange(input.checked));
  return input;
}

async function geocodeClientAddressPreview(address) {
  const q = (address || '').trim();
  if (!q) return null;
  try {
    const res = await adminFetch(`/api/mapbox/geocode?${new URLSearchParams({ address: q })}`);
    const data = await res.json();
    if (!res.ok || !data.geo) return null;
    return data.geo;
  } catch {
    return null;
  }
}

function mountClientAddressField(parent, value) {
  const input = document.createElement('input');
  input.className = 'de-input cl-address-input';
  input.placeholder = 'Business or street address';
  input.value = value || '';
  input.autocomplete = 'street-address';
  appendClientField(parent, 'Address', input);
  return input;
}

function mountClientMapSection(parent, draft) {
  const section = document.createElement('section');
  section.className = 'cl-map-section';
  const mapHost = document.createElement('div');
  mapHost.className = 'cl-map-host';
  section.appendChild(mapHost);
  parent.appendChild(section);

  const geo = draft?.geo;
  clientMapController = createClientMap(mapHost, {
    token: window.__mapboxAccessToken,
    lat: geo?.lat,
    lng: geo?.lng,
    address: draft?.address || '',
  });
  return section;
}

function normalizeWebsiteUrl(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

function isOpenableWebsiteUrl(raw) {
  try {
    const url = new URL(normalizeWebsiteUrl(raw));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function mountClientWebsiteField(parent, value) {
  const wrap = document.createElement('label');
  wrap.className = 'de-label';
  wrap.textContent = 'Website';

  const field = document.createElement('div');
  field.className = 'control-field cl-website-field';

  const input = document.createElement('input');
  input.className = 'de-input';
  input.type = 'url';
  input.placeholder = 'https://example.com';
  input.value = value || '';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'ios-icon-btn cl-website-open-btn';
  openBtn.setAttribute('aria-label', 'Open website');
  openBtn.title = 'Open website';
  openBtn.innerHTML = navIcon('external-link', 18);
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!isOpenableWebsiteUrl(input.value)) return;
    window.open(normalizeWebsiteUrl(input.value), '_blank', 'noopener,noreferrer');
  });

  function syncOpenBtn() {
    const ok = isOpenableWebsiteUrl(input.value);
    openBtn.disabled = !ok;
    openBtn.hidden = !ok;
    if (ok) {
      const url = normalizeWebsiteUrl(input.value);
      openBtn.title = `Open ${url}`;
      openBtn.setAttribute('aria-label', `Open ${url} in new tab`);
    } else {
      openBtn.title = 'Open website';
      openBtn.setAttribute('aria-label', 'Open website');
    }
  }

  input.addEventListener('input', syncOpenBtn);
  syncOpenBtn();

  field.appendChild(input);
  field.appendChild(openBtn);
  wrap.appendChild(field);
  parent.appendChild(wrap);
  return input;
}

function clientBrandingPreviewUrl(url) {
  const v = (url || '').trim();
  if (!v) return '';
  return v;
}

function mountClientBrandingSection(parent, uid, draft, opts = {}) {
  const disabled = !uid || !!opts.disabled;
  const onUpdate = typeof opts.onUpdate === 'function' ? opts.onUpdate : () => {};
  const getWebsite = typeof opts.getWebsite === 'function' ? opts.getWebsite : () => draft?.website || '';

  const wrap = document.createElement('div');
  wrap.className = 'de-label cl-branding-label';
  const title = document.createElement('span');
  title.textContent = 'Branding';
  wrap.appendChild(title);

  const scrapeBtn = document.createElement('button');
  scrapeBtn.type = 'button';
  scrapeBtn.className = 'de-btn de-btn-secondary cl-branding-scrape-btn';
  scrapeBtn.textContent = 'Fetch from website';
  scrapeBtn.hidden = true;
  wrap.appendChild(scrapeBtn);

  const syncScrapeBtn = () => {
    scrapeBtn.hidden = disabled || !getWebsite().trim();
  };

  const uploads = document.createElement('div');
  uploads.className = 'prof-branding-uploads cl-branding-uploads';

  const logoUrl = clientBrandingPreviewUrl(draft?.logoUrl);
  const iconUrl = clientBrandingPreviewUrl(draft?.iconUrl);
  const hasLogo = !!logoUrl;
  const hasIcon = !!iconUrl;

  uploads.innerHTML =
    `<div class="prof-branding-upload-item">` +
      `<label for="cl-logo-file">Logo</label>` +
      `<div class="prof-logo-upload">` +
        `<div id="cl-logo-preview-wrap" class="prof-logo-preview-wrap"${hasLogo ? '' : ' hidden'}>` +
          `<img id="cl-logo-preview" class="prof-logo-preview" src="${escHtml(logoUrl)}" alt="" />` +
          `<button type="button" id="cl-logo-remove" class="prof-logo-remove" aria-label="Remove logo"${hasLogo ? '' : ' hidden'}>×</button>` +
        `</div>` +
        `<div id="cl-logo-file-wrap" class="prof-logo-file-wrap"${hasLogo && !disabled ? ' hidden' : ''}>` +
          `<input id="cl-logo-file" type="file" accept="image/png,image/jpeg,image/webp"${disabled ? ' disabled' : ''} />` +
        `</div>` +
      `</div>` +
    `</div>` +
    `<div class="prof-branding-upload-item">` +
      `<label for="cl-icon-file">Icon</label>` +
      `<div class="prof-logo-upload">` +
        `<div id="cl-icon-preview-wrap" class="prof-logo-preview-wrap"${hasIcon ? '' : ' hidden'}>` +
          `<img id="cl-icon-preview" class="prof-icon-preview" src="${escHtml(iconUrl)}" alt="" />` +
          `<button type="button" id="cl-icon-remove" class="prof-logo-remove" aria-label="Remove icon"${hasIcon ? '' : ' hidden'}>×</button>` +
        `</div>` +
        `<div id="cl-icon-file-wrap" class="prof-logo-file-wrap"${hasIcon && !disabled ? ' hidden' : ''}>` +
          `<input id="cl-icon-file" type="file" accept="image/png,image/jpeg,image/webp"${disabled ? ' disabled' : ''} />` +
        `</div>` +
      `</div>` +
    `</div>`;

  const hint = document.createElement('span');
  hint.className = 'prof-hint prof-hint--block cl-branding-hint';
  hint.textContent = disabled
    ? 'Save the client first to upload logo and icon.'
    : 'Logo: client portal header. Icon: install icon and favicons. PNG, JPEG, or WebP — max 2 MB each. Website logos are fetched automatically when a site URL is saved, or use Fetch from website.';

  wrap.appendChild(uploads);
  wrap.appendChild(hint);
  parent.appendChild(wrap);
  syncScrapeBtn();

  if (disabled || !uid) return wrap;

  const refreshers = bindClientBrandingUploads(wrap, uid, onUpdate);
  wrap.refreshBranding = (patch = {}) => {
    refreshers.refreshLogo(patch.logoUrl ?? '', patch.logoSource);
    refreshers.refreshIcon(patch.iconUrl ?? '', patch.iconSource);
  };
  bindClientBrandingScrape(scrapeBtn, uid, getWebsite, onUpdate, refreshers);
  wrap.syncScrapeBtn = syncScrapeBtn;
  return wrap;
}

function bindClientBrandingUploads(root, uid, onUpdate) {
  const logoFile = root.querySelector('#cl-logo-file');
  const logoFileWrap = root.querySelector('#cl-logo-file-wrap');
  const logoPreviewWrap = root.querySelector('#cl-logo-preview-wrap');
  const logoPreview = root.querySelector('#cl-logo-preview');
  const logoRemove = root.querySelector('#cl-logo-remove');

  const iconFile = root.querySelector('#cl-icon-file');
  const iconFileWrap = root.querySelector('#cl-icon-file-wrap');
  const iconPreviewWrap = root.querySelector('#cl-icon-preview-wrap');
  const iconPreview = root.querySelector('#cl-icon-preview');
  const iconRemove = root.querySelector('#cl-icon-remove');

  const refreshLogo = (logoUrl, logoSource) => {
    const url = clientBrandingPreviewUrl(logoUrl);
    const has = !!url;
    if (logoPreview instanceof HTMLImageElement) logoPreview.src = url;
    logoPreviewWrap?.toggleAttribute('hidden', !has);
    logoFileWrap?.toggleAttribute('hidden', has);
    logoRemove?.toggleAttribute('hidden', !has);
  };

  const refreshIcon = (iconUrl, iconSource) => {
    const url = clientBrandingPreviewUrl(iconUrl);
    const has = !!url;
    if (iconPreview instanceof HTMLImageElement) iconPreview.src = url;
    iconPreviewWrap?.toggleAttribute('hidden', !has);
    iconFileWrap?.toggleAttribute('hidden', has);
    iconRemove?.toggleAttribute('hidden', !has);
  };

  logoFile?.addEventListener('change', async () => {
    if (!(logoFile instanceof HTMLInputElement) || !logoFile.files?.length) return;
    const fd = new FormData();
    fd.append('logo', logoFile.files[0]);
    logoFile.disabled = true;
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(uid)}/logo`, { method: 'POST', body: fd });
      const json = await res.json();
      if (res.ok && json.logoUrl) {
        refreshLogo(json.logoUrl, 'upload');
        onUpdate({ logoUrl: json.logoUrl, logoSource: 'upload' });
      } else {
        alert(json.error || 'Logo upload failed.');
      }
    } catch {
      alert('Network error — please try again.');
    } finally {
      logoFile.value = '';
      logoFile.disabled = false;
    }
  });

  logoRemove?.addEventListener('click', async () => {
    if (!(logoRemove instanceof HTMLButtonElement)) return;
    logoRemove.disabled = true;
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(uid)}/logo`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok) {
        refreshLogo(json.logoUrl || '', undefined);
        onUpdate({ logoUrl: json.logoUrl || '', logoSource: undefined });
      } else {
        alert(json.error || 'Could not remove logo.');
      }
    } catch {
      alert('Network error — please try again.');
    } finally {
      logoRemove.disabled = false;
    }
  });

  iconFile?.addEventListener('change', async () => {
    if (!(iconFile instanceof HTMLInputElement) || !iconFile.files?.length) return;
    const fd = new FormData();
    fd.append('icon', iconFile.files[0]);
    iconFile.disabled = true;
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(uid)}/icon`, { method: 'POST', body: fd });
      const json = await res.json();
      if (res.ok && json.iconUrl) {
        refreshIcon(json.iconUrl, 'upload');
        onUpdate({ iconUrl: json.iconUrl, iconSource: 'upload' });
      } else {
        alert(json.error || 'Icon upload failed.');
      }
    } catch {
      alert('Network error — please try again.');
    } finally {
      iconFile.value = '';
      iconFile.disabled = false;
    }
  });

  iconRemove?.addEventListener('click', async () => {
    if (!(iconRemove instanceof HTMLButtonElement)) return;
    iconRemove.disabled = true;
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(uid)}/icon`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok) {
        refreshIcon(json.iconUrl || '', undefined);
        onUpdate({ iconUrl: json.iconUrl || '', iconSource: undefined });
      } else {
        alert(json.error || 'Could not remove icon.');
      }
    } catch {
      alert('Network error — please try again.');
    } finally {
      iconRemove.disabled = false;
    }
  });

  return { refreshLogo, refreshIcon };
}

function bindClientBrandingScrape(btn, uid, getWebsite, onUpdate, refreshers) {
  btn.addEventListener('click', async () => {
    const website = getWebsite().trim();
    if (!website) return;

    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = 'Fetching…';
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(uid)}/scrape-branding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert(json.error || 'Could not fetch branding from website.');
        return;
      }

      refreshers.refreshLogo(json.logoUrl || '', json.logoSource);
      refreshers.refreshIcon(json.iconUrl || '', json.iconSource);
      onUpdate({
        logoUrl: json.logoUrl || '',
        iconUrl: json.iconUrl || '',
        logoSource: json.logoSource,
        iconSource: json.iconSource,
        website: json.website || website,
      });
    } catch {
      alert('Network error — please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  });
}

function createClientFormScroll(pane) {
  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll cl-form-scroll';
  pane.appendChild(scroll);
  return scroll;
}

function renderNewClientForm(pane) {
  clearClientFieldRegistry();
  pane.innerHTML = '';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'cl-title-wrap';
  const titleField = document.createElement('div');
  titleField.className = 'cl-title-field';
  const companyInput = document.createElement('input');
  companyInput.className = 'cl-title-input';
  companyInput.placeholder = 'Company name';
  companyInput.value = clientState.draft?.company || '';
  companyInput.setAttribute('aria-label', 'Company name');
  const editHint = document.createElement('span');
  editHint.className = 'cl-title-edit-hint';
  editHint.innerHTML = IOS_ICONS.edit;
  editHint.setAttribute('aria-hidden', 'true');
  titleField.appendChild(companyInput);
  titleField.appendChild(editHint);
  titleWrap.appendChild(titleField);
  syncClTitleInputWidth(companyInput);
  companyInput.addEventListener('input', () => syncClTitleInputWidth(companyInput));

  const inDrawer = shell.isCreateDrawerOpen('clients');
  pane.appendChild(
    createPaneSubheader({
      back: inDrawer
        ? null
        : {
            label: 'Back to clients',
            onClick: () => {
              clientState.activeUid = null;
              clientState.draft = null;
              getClientsEditor()?.classList.remove('de-pane-active');
              renderClientsEditor();
            },
          },
      titleNode: titleWrap,
    }).header,
  );
  requestTitleFocus('clients', companyInput);

  const scroll = createClientFormScroll(pane);
  const fields = document.createElement('div');
  fields.className = 'de-fields';

  const firstNameInput = document.createElement('input');
  firstNameInput.className = 'de-input';
  firstNameInput.placeholder = 'First name';
  firstNameInput.autocomplete = 'given-name';
  firstNameInput.value = clientState.draft?.firstName || '';
  appendClientField(fields, 'First name', firstNameInput);
  registerClientField(firstNameInput, () => true);

  const lastNameInput = document.createElement('input');
  lastNameInput.className = 'de-input';
  lastNameInput.placeholder = 'Last name';
  lastNameInput.autocomplete = 'family-name';
  lastNameInput.value = clientState.draft?.lastName || '';
  appendClientField(fields, 'Last name', lastNameInput);
  registerClientField(lastNameInput, () => true);

  const phoneInput = document.createElement('input');
  phoneInput.className = 'de-input';
  phoneInput.value = formatPhoneInput(clientState.draft?.phone || '');
  appendClientField(fields, 'Phone', phoneInput);
  attachPhoneFormatter(phoneInput);
  registerClientField(phoneInput, () => isValidClientPhone(phoneInput.value));

  const emailInput = document.createElement('input');
  emailInput.className = 'de-input';
  emailInput.type = 'email';
  emailInput.placeholder = 'email@example.com';
  emailInput.value = clientState.draft?.email || '';
  appendClientField(fields, 'Email', emailInput);
  registerClientField(emailInput, () => isValidClientEmail(emailInput.value));

  const websiteInput = mountClientWebsiteField(fields, clientState.draft?.website || '');
  registerClientField(websiteInput, () => true);

  let personalInput = null;
  personalInput = mountClientPersonalToggle(fields, clientState.draft?.personal, () => {});

  mountClientBrandingSection(fields, null, clientState.draft, { disabled: true });

  const notesLabel = document.createElement('label');
  notesLabel.className = 'de-label cl-notes-label';
  notesLabel.textContent = 'Notes (internal)';
  const notesTa = document.createElement('textarea');
  notesTa.className = 'de-textarea cl-notes-textarea';
  notesTa.spellcheck = false;
  notesTa.placeholder = 'Private notes — never shown on client portal';
  notesTa.value = clientState.draft?.notes || '';
  notesLabel.appendChild(notesTa);
  fields.appendChild(notesLabel);

  scroll.appendChild(fields);
  registerClientField(companyInput, () => !!joinClientFullName(firstNameInput.value, lastNameInput.value, companyInput.value));
  registerClientField(notesTa, () => true);

  shell.setEditorFooterSave(() => {
    refreshAllClientFields();
    const name = joinClientFullName(firstNameInput.value, lastNameInput.value, companyInput.value);
    if (!name) return;
    if (!isValidClientEmail(emailInput.value) || !isValidClientPhone(phoneInput.value)) return;
    return createClient({
      name,
      email: emailInput.value.trim(),
      phone: phoneToStorage(phoneInput.value),
      company: companyInput.value.trim(),
      website: websiteInput.value.trim(),
      notes: notesTa.value.trim(),
      personal: personalInput.checked,
    });
  });
  if (!inDrawer) getClientsEditor()?.classList.add('de-pane-active');
}

function renderEditClientForm(pane) {
  clearClientFieldRegistry();
  const uid = clientState.activeUid;
  clientState.vaultGetData = null;
  pane.innerHTML = '<div class="de-loading">Loading…</div>';

  fetch(`/api/clients/${encodeURIComponent(uid)}`, { cache: 'no-store' })
    .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.error || 'Failed to load');
      const contact = data.contact ?? data;
      const { firstName, lastName } = splitClientNameParts(contact);
      clientState.draft = {
        name: contact.name || '',
        firstName,
        lastName,
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        website: data.website || contact.website || '',
        address: data.address || '',
        geo: data.geo || null,
        notes: contact.notes || '',
        personal: !!(data.personal ?? contact.personal),
        logoUrl: data.logoUrl || '',
        iconUrl: data.iconUrl || '',
        logoSource: data.logoSource,
        iconSource: data.iconSource,
        portal_url: contact.portal_url ?? data.portal_url,
        data: data.data || [],
        createdAt: contact.createdAt ?? data.createdAt,
        archived: contact.archived ?? data.archived,
      };
      clientState.dirty = false;
      clientState.autosaveGetPayload = null;
      syncClientListAvatar(uid, {
        logoUrl: clientState.draft.logoUrl,
        iconUrl: clientState.draft.iconUrl,
      });
      pane.innerHTML = '';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'cl-title-wrap';
      const titleField = document.createElement('div');
      titleField.className = 'cl-title-field';
      const companyInput = document.createElement('input');
      companyInput.className = 'cl-title-input';
      companyInput.value = clientState.draft.company || '';
      companyInput.placeholder = 'Company name';
      companyInput.setAttribute('aria-label', 'Company name');
      const editHint = document.createElement('span');
      editHint.className = 'cl-title-edit-hint';
      editHint.innerHTML = IOS_ICONS.edit;
      editHint.setAttribute('aria-hidden', 'true');
      titleField.appendChild(companyInput);
      titleField.appendChild(editHint);
      titleWrap.appendChild(titleField);
      syncClTitleInputWidth(companyInput);
      companyInput.addEventListener('input', () => syncClTitleInputWidth(companyInput));

      const shareBtn = clientState.draft.personal
        ? null
        : createPortalShareBtn(uid, {
        title: `${clientDisplayLabel(clientState.draft)} — portal`,
        recipient: {
          contactUid: uid,
          name: joinClientFullName(firstName, lastName, clientState.draft.company) || 'Client',
          email: clientState.draft.email,
          phone: clientState.draft.phone,
        },
      });

      const { header } = createPaneSubheader({
        back: {
          label: 'Back to clients',
          onClick: async () => {
            await flushClientAutosave();
            if (clientState.dirty && !(await confirmDiscardChanges())) return;
            clientState.activeUid = null;
            clientState.draft = null;
            clientState.autosaveGetPayload = null;
            getClientsEditor()?.classList.remove('de-pane-active');
            renderClientsEditor();
          },
        },
        titleNode: titleWrap,
        icons: [
          shareBtn,
          paneDeleteIcon({
            label: 'Delete client',
            onClick: () => deleteClient(uid),
          }),
        ].filter(Boolean),
      });
      pane.appendChild(header);

      mountClientDetailTabs(pane, clientState.detailTab, (tabId) => {
        clientState.detailTab = tabId;
        showClientDetailPanel(pane, tabId);
      });

      const scroll = createClientFormScroll(pane);
      const activeTab = clientState.detailTab;

      const profilePanel = createClientDetailPanel('profile', activeTab);
      const profileFields = document.createElement('div');
      profileFields.className = 'de-fields';

      const firstNameInput = document.createElement('input');
      firstNameInput.className = 'de-input';
      firstNameInput.placeholder = 'First name';
      firstNameInput.autocomplete = 'given-name';
      firstNameInput.value = clientState.draft.firstName || '';
      appendClientField(profileFields, 'First name', firstNameInput);
      registerClientField(firstNameInput, () => true);

      const lastNameInput = document.createElement('input');
      lastNameInput.className = 'de-input';
      lastNameInput.placeholder = 'Last name';
      lastNameInput.autocomplete = 'family-name';
      lastNameInput.value = clientState.draft.lastName || '';
      appendClientField(profileFields, 'Last name', lastNameInput);
      registerClientField(lastNameInput, () => true);

      const phoneInput = document.createElement('input');
      phoneInput.className = 'de-input';
      phoneInput.value = formatPhoneInput(clientState.draft.phone || '');
      appendClientField(profileFields, 'Phone', phoneInput);
      attachPhoneFormatter(phoneInput);
      registerClientField(phoneInput, () => isValidClientPhone(phoneInput.value));

      const emailInput = document.createElement('input');
      emailInput.className = 'de-input';
      emailInput.type = 'email';
      emailInput.value = clientState.draft.email || '';
      appendClientField(profileFields, 'Email', emailInput);
      registerClientField(emailInput, () => isValidClientEmail(emailInput.value));

      const websiteInput = mountClientWebsiteField(profileFields, clientState.draft.website || '');
      registerClientField(websiteInput, () => true);

      const personalInput = mountClientPersonalToggle(
        profileFields,
        clientState.draft.personal,
        () => {},
      );

      const addressInput = mountClientAddressField(profileFields, clientState.draft.address || '');
      registerClientField(addressInput, () => true);
      destroyClientAddressAutocomplete = mountAddressAutocomplete(
        addressInput,
        getClientsEditor() || document.body,
        async (pickedAddress) => {
          clientPendingGeo = await geocodeClientAddressPreview(pickedAddress);
          if (clientPendingGeo && clientMapController) {
            clientMapController.setLocation(
              clientPendingGeo.lat,
              clientPendingGeo.lng,
              pickedAddress,
            );
          }
        },
      );

      mountClientMapSection(profileFields, clientState.draft);
      profilePanel.appendChild(profileFields);
      scroll.appendChild(profilePanel);

      const brandingPanel = createClientDetailPanel('branding', activeTab);
      const brandingFields = document.createElement('div');
      brandingFields.className = 'de-fields';
      const brandingWrap = mountClientBrandingSection(brandingFields, uid, clientState.draft, {
        getWebsite: () => websiteInput.value,
        onUpdate: (patch) => {
          Object.assign(clientState.draft, patch);
          if (patch.website != null) websiteInput.value = patch.website;
          syncClientListAvatar(uid, {
            logoUrl: clientState.draft.logoUrl,
            iconUrl: clientState.draft.iconUrl,
          });
        },
      });
      clientState.brandingRefresh = (patch) => brandingWrap.refreshBranding?.(patch);
      websiteInput.addEventListener('input', () => brandingWrap.syncScrapeBtn?.());
      brandingPanel.appendChild(brandingFields);
      scroll.appendChild(brandingPanel);

      const notesPanel = createClientDetailPanel('notes', activeTab);
      const notesFields = document.createElement('div');
      notesFields.className = 'de-fields';
      const notesLabel = document.createElement('label');
      notesLabel.className = 'de-label cl-notes-label';
      notesLabel.textContent = 'Notes (internal)';
      const notesTa = document.createElement('textarea');
      notesTa.className = 'de-textarea cl-notes-textarea cl-notes-textarea--tab';
      notesTa.spellcheck = false;
      notesTa.placeholder = 'Private notes — never shown on client portal';
      notesTa.value = clientState.draft.notes || '';
      notesLabel.appendChild(notesTa);
      notesFields.appendChild(notesLabel);
      notesPanel.appendChild(notesFields);
      scroll.appendChild(notesPanel);
      registerClientField(notesTa, () => true);
      registerClientField(companyInput, () =>
        !!joinClientFullName(firstNameInput.value, lastNameInput.value, companyInput.value),
      );

      const projectsPanel = createClientDetailPanel('projects', activeTab);
      mountClientWorkSection(projectsPanel, uid);
      scroll.appendChild(projectsPanel);

      const vaultPanel = createClientDetailPanel('vault', activeTab);
      mountClientVaultSection(vaultPanel, uid, clientState.draft.data || []);
      scroll.appendChild(vaultPanel);

      const getPayload = () => {
        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const company = companyInput.value.trim();
        const payload = {
          name: joinClientFullName(firstName, lastName, company),
          email: emailInput.value.trim(),
          phone: phoneToStorage(phoneInput.value),
          company,
          website: websiteInput.value.trim(),
          address: addressInput.value.trim(),
          notes: notesTa.value.trim(),
          personal: personalInput.checked,
        };
        if (clientPendingGeo) payload.geo = clientPendingGeo;
        return payload;
      };
      clientState.autosaveGetPayload = getPayload;

      const markDirty = () => {
        clientState.dirty =
          firstNameInput.value !== clientState.draft.firstName ||
          lastNameInput.value !== clientState.draft.lastName ||
          companyInput.value !== clientState.draft.company ||
          emailInput.value !== clientState.draft.email ||
          phoneToStorage(phoneInput.value) !== clientState.draft.phone ||
          websiteInput.value !== clientState.draft.website ||
          addressInput.value !== clientState.draft.address ||
          notesTa.value !== clientState.draft.notes ||
          personalInput.checked !== !!clientState.draft.personal;
      };
      const queueAutosave = () => {
        markDirty();
        scheduleClientAutosave(uid, getPayload);
      };
      personalInput.addEventListener('change', queueAutosave);
      const saveNow = async () => {
        markDirty();
        await autosaveClient(uid, getPayload());
      };
      for (const el of [
        companyInput,
        firstNameInput,
        lastNameInput,
        emailInput,
        phoneInput,
        websiteInput,
        addressInput,
        notesTa,
      ]) {
        el.addEventListener('input', () => {
          clientActiveField = el;
          if (el === addressInput) clientPendingGeo = null;
          queueAutosave();
        });
        el.addEventListener('blur', () => {
          clientActiveField = el;
          void (async () => {
            if (el === addressInput && addressInput.value.trim()) {
              const geo = await geocodeClientAddressPreview(addressInput.value);
              if (geo) {
                clientPendingGeo = geo;
                clientMapController?.setLocation(geo.lat, geo.lng, addressInput.value.trim());
              }
            }
            await saveNow();
          })();
        });
      }

      getClientsEditor()?.classList.add('de-pane-active');
    })
    .catch((e) => {
      pane.innerHTML = `<div class="de-loading de-error">${escHtml(e.message)}</div>`;
    });
}

async function openClient(uid) {
  await flushClientAutosave();
  if (clientState.dirty && clientState.activeUid && !(await confirmDiscardChanges())) return;
  clientState.activeUid = uid;
  clientState.detailTab = 'profile';
  clientState.dirty = false;
  clientState.autosaveGetPayload = null;
  renderClientsEditor();
}

async function createClient(payload) {
  if (!payload.name) { alert('Enter a company or contact name.'); return; }
  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const uid = data.uid;
    if (payload.website?.trim() && uid) {
      await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: payload.website.trim() }),
      });
    }
    shell.finishCreateDrawer();
    await loadClientsTab();
    clientState.activeUid = uid;
    getClientsEditor()?.classList.add('de-pane-active');
    renderClientsEditor();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

function syncClientListRow(uid) {
  const c = clientState.clients.find((x) => x.uid === uid);
  if (!c) return;
  const item = getClientsEditor()?.querySelector(`.ch-list-item[data-id="${CSS.escape(uid)}"]`);
  if (!item) return;
  const titleEl = item.querySelector('.ch-item-title');
  const subEl = item.querySelector('.wk-contact');
  const avatarWrap = item.querySelector('.cl-list-avatar-wrap');
  if (titleEl) titleEl.textContent = clientListTitle(c);
  if (subEl) subEl.textContent = clientListSubline(c);
  if (avatarWrap) avatarWrap.innerHTML = clientListAvatarHtml(c);
}

function scheduleClientAutosave(uid, getPayload) {
  clearTimeout(clientAutosaveTimer);
  clientAutosaveTimer = setTimeout(async () => {
    clientAutosaveTimer = null;
    await autosaveClient(uid, getPayload());
  }, 650);
}

async function flushClientAutosave() {
  await flushClientVaultSave();
  if (clientAutosaveTimer) {
    clearTimeout(clientAutosaveTimer);
    clientAutosaveTimer = null;
  }
  const uid = clientState.activeUid;
  if (!uid || uid === '__new__' || !clientState.autosaveGetPayload) return;
  await autosaveClient(uid, clientState.autosaveGetPayload());
}

async function autosaveClient(uid, payload) {
  if (!payload.name) {
    refreshAllClientFields();
    return false;
  }
  const draft = clientState.draft;
  if (!draft) return false;
  const wasPersonal = !!draft.personal;
  const unchanged =
    payload.name === draft.name &&
    payload.email === draft.email &&
    payload.phone === draft.phone &&
    payload.company === draft.company &&
    payload.website === draft.website &&
    payload.address === draft.address &&
    payload.notes === draft.notes &&
    !!payload.personal === !!draft.personal;
  if (unchanged) {
    clientState.dirty = false;
    return true;
  }
  if (!isValidClientEmail(payload.email) || !isValidClientPhone(payload.phone)) {
    refreshAllClientFields();
    return false;
  }
  if (clientActiveField) shell.setFormFieldState(clientActiveField, 'saving');
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const nameParts = splitClientNameParts({
      name: payload.name,
      firstName: data.firstName,
      lastName: data.lastName,
    });
    Object.assign(clientState.draft, {
      name: payload.name,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: payload.email,
      phone: payload.phone,
      company: payload.company,
      website: payload.website,
      address: data.address ?? payload.address,
      geo: data.geo ?? clientPendingGeo ?? clientState.draft.geo,
      notes: payload.notes,
      personal: !!payload.personal,
      logoUrl: data.logoUrl || clientState.draft.logoUrl || '',
      iconUrl: data.iconUrl || clientState.draft.iconUrl || '',
      logoSource: data.logoSource ?? clientState.draft.logoSource,
      iconSource: data.iconSource ?? clientState.draft.iconSource,
    });
    syncClientListAvatar(uid, {
      logoUrl: clientState.draft.logoUrl,
      iconUrl: clientState.draft.iconUrl,
    });
    clientState.brandingRefresh?.({
      logoUrl: clientState.draft.logoUrl,
      iconUrl: clientState.draft.iconUrl,
      logoSource: clientState.draft.logoSource,
      iconSource: clientState.draft.iconSource,
    });
    clientPendingGeo = null;
    if (clientMapController) {
      const geo = clientState.draft.geo;
      if (geo?.lat != null && geo?.lng != null) {
        clientMapController.setLocation(geo.lat, geo.lng, clientState.draft.address || '');
      } else if (!clientState.draft.address) {
        clientMapController.setLocation(null, null, '');
      }
    }
    clientState.dirty = false;
    const c = clientState.clients.find((x) => x.uid === uid);
    if (c) {
      c.name = payload.name;
      c.email = payload.email;
      c.phone = payload.phone;
      c.company = payload.company;
      c.personal = !!payload.personal;
      c.logoUrl = clientState.draft.logoUrl || c.logoUrl || '';
      c.iconUrl = clientState.draft.iconUrl || c.iconUrl || '';
    }
    syncClientListRow(uid);
    if (wasPersonal !== !!payload.personal) {
      refreshClientsSidebarList();
      const root = getClientsEditor();
      const tabs = root?.querySelector('.em-filter-tabs');
      if (tabs) tabs.replaceWith(renderClientFilterTabs(tabs.scrollLeft));
    }
    if (clientActiveField) shell.flashFormFieldSaved(clientActiveField);
    return true;
  } catch (e) {
    console.warn('[clients] autosave failed', e);
    if (clientActiveField) shell.setFormFieldState(clientActiveField, 'invalid');
    refreshAllClientFields();
    return false;
  }
}

async function saveClient(uid, payload) {
  if (!payload.name) { alert('Name is required.'); return; }
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    clientState.dirty = false;
    await loadClientsTab();
    clientState.activeUid = uid;
    renderClientsEditor();
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  }
}

function openOsDialogBackdrop() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  if (!backdrop) return null;
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  backdrop.querySelector('.ios-sheet')?.classList.add('ios-sheet--visible');
  document.documentElement.classList.add('ios-sheet-locked');
  return backdrop;
}

function closeOsDialogBackdrop() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  if (!backdrop) return;
  backdrop.querySelector('.ios-sheet')?.classList.remove('ios-sheet--visible');
  backdrop.classList.remove('open', 'os-dialog-keyboard');
  backdrop.setAttribute('aria-hidden', 'true');
  document.documentElement.style.removeProperty('--os-dialog-keyboard-inset');
  if (!document.querySelector('.ios-sheet-backdrop.open')) {
    document.documentElement.classList.remove('ios-sheet-locked');
  }
}

function bindOsDialogDismiss(backdrop, finish, showCancel) {
  const closeBtn = backdrop.querySelector('[data-os-dialog-close]');
  if (closeBtn) {
    closeBtn.hidden = !showCancel;
    if (showCancel) {
      closeBtn.addEventListener('click', () => finish(false), { once: true });
    }
  }
  if (showCancel) {
    backdrop.addEventListener(
      'click',
      function onBackdropClick(ev) {
        if (ev.target === backdrop) {
          backdrop.removeEventListener('click', onBackdropClick);
          finish(false);
        }
      },
      { once: true },
    );
  }
}

function osDialog(opts) {
  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) {
    return Promise.resolve(opts.showCancel ? false : undefined);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const onKey = (ev) => {
      if (ev.key === 'Escape' && opts.showCancel) finish(false);
    };

    titleEl.textContent = opts.title || '';
    bodyEl.innerHTML = opts.bodyHtml || '';
    actionsEl.innerHTML = '';

    const mkBtn = (label, cls, value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', () => finish(value));
      actionsEl.appendChild(btn);
      return btn;
    };

    if (opts.showCancel) {
      mkBtn(opts.cancelLabel || 'Cancel', 'os-dialog-btn--ghost', false);
    }
    const primary = mkBtn(
      opts.confirmLabel || 'OK',
      opts.danger ? 'os-dialog-btn--danger' : 'os-dialog-btn--primary',
      true,
    );

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, finish, !!opts.showCancel);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    primary.focus();
  });
}

let osDialogKeyboardBound = false;
let osDialogKeyboardSync = null;

function scrollOsDialogFieldIntoView(field) {
  if (!(field instanceof HTMLElement)) return;
  const body = document.getElementById('os-dialog-body');
  if (body?.contains(field)) {
    const bodyRect = body.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    const margin = 16;
    if (fieldRect.bottom > bodyRect.bottom - margin || fieldRect.top < bodyRect.top + margin) {
      body.scrollTop += fieldRect.top - bodyRect.top - margin;
    }
  }
  field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
}

function syncOsDialogKeyboardLayout() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  if (!backdrop?.classList.contains('open')) return;
  const vv = window.visualViewport;
  const active = document.activeElement;
  const inDialog =
    active instanceof HTMLElement &&
    (active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement) &&
    backdrop.contains(active);
  if (!inDialog || !vv) {
    backdrop.classList.remove('os-dialog-keyboard');
    document.documentElement.style.removeProperty('--os-dialog-keyboard-inset');
    return;
  }
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  backdrop.classList.add('os-dialog-keyboard');
  document.documentElement.style.setProperty('--os-dialog-keyboard-inset', `${inset}px`);
  const runScroll = () => {
    scrollOsDialogFieldIntoView(active);
    repositionOpenOsDialogDropdowns();
  };
  requestAnimationFrame(runScroll);
  window.setTimeout(runScroll, 120);
  window.setTimeout(runScroll, 360);
}

function scheduleOsDialogFieldFocus(field) {
  if (!(field instanceof HTMLElement)) return;
  const focus = () => {
    try {
      field.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    syncOsDialogKeyboardLayout();
  };
  requestAnimationFrame(() => requestAnimationFrame(focus));
}

function bindOsDialogKeyboardLayout() {
  if (osDialogKeyboardBound) {
    syncOsDialogKeyboardLayout();
    return;
  }
  osDialogKeyboardBound = true;
  osDialogKeyboardSync = syncOsDialogKeyboardLayout;
  document.addEventListener('focusin', osDialogKeyboardSync, true);
  window.visualViewport?.addEventListener('resize', osDialogKeyboardSync);
  window.visualViewport?.addEventListener('scroll', osDialogKeyboardSync);
}

function releaseOsDialogKeyboardLayout() {
  const backdrop = document.getElementById('os-dialog-backdrop');
  backdrop?.classList.remove('os-dialog-keyboard');
  document.documentElement.style.removeProperty('--os-dialog-keyboard-inset');
  if (!osDialogKeyboardBound || !osDialogKeyboardSync) return;
  document.removeEventListener('focusin', osDialogKeyboardSync, true);
  window.visualViewport?.removeEventListener('resize', osDialogKeyboardSync);
  window.visualViewport?.removeEventListener('scroll', osDialogKeyboardSync);
  osDialogKeyboardBound = false;
  osDialogKeyboardSync = null;
}

function osConfirm(opts) {
  return osDialog({ ...opts, showCancel: true });
}

function osAlert(opts) {
  return osDialog({ ...opts, showCancel: false, confirmLabel: opts.confirmLabel || 'OK' });
}

async function confirmDiscardChanges() {
  return osConfirm({
    title: 'Discard changes?',
    bodyHtml: '<p>Discard unsaved changes?</p>',
    confirmLabel: 'Discard',
    danger: true,
  });
}

async function performClientDelete(uid, force) {
  const qs = force ? '?force=true' : '';
  const res = await fetch(`/api/clients/${encodeURIComponent(uid)}${qs}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  return { res, data };
}

async function deleteClient(uid) {
  closeOpenSwipeRow();
  try {
    const { res, data } = await performClientDelete(uid, true);
    if (!res.ok) throw new Error(data.error || data.warning || `HTTP ${res.status}`);

    clientState.activeUid = null;
    clientState.dirty = false;
    clientState.draft = null;
    await loadClientsTab();
  } catch (e) {
    await shell.osAlert({ title: 'Delete failed', bodyHtml: `<p>${escHtml(e.message)}</p>` });
  }
}

// ---- extracted from os-map-loader.js:17355-17381 ----
function createClientListItem(c) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'ch-list-item' + (c.uid === clientState.activeUid ? ' active' : '');
  item.dataset.id = c.uid;
  item.innerHTML =
    `<span class="ch-list-content ch-list-content--client">` +
    `<span class="ch-item-row ch-item-row--client">` +
    `<span class="cl-list-avatar-wrap">${clientListAvatarHtml(c)}</span>` +
    `<span class="ch-item-copy">` +
    `<span class="ch-item-title">${escHtml(clientListTitle(c))}</span>` +
    `<span class="wk-meta-row">` +
    `<span class="wk-contact">${escHtml(clientListSubline(c))}</span>` +
    (c.personal ? '<span class="cl-personal-tag">Personal</span>' : '') +
    (c.archived ? '<span class="cl-archived">Archived</span>' : '') +
    `</span></span></span></span>`;
  item.addEventListener('click', () => openClient(c.uid));
  return item;
}

function createClientSwipeRow(c) {
  return createSwipeRow(createClientListItem(c), [
    swipeDeleteAction({
      onClick: () => deleteClient(c.uid),
    }),
  ]);
}
let pendingClientDeepLinkUid = null;

function parseClientDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('client')?.trim() || null;
  } catch {
    return null;
  }
}

function navigateToClient(uid) {
  if (!uid) return;
  pendingClientDeepLinkUid = uid;
  shell.setActiveMap('clients', { force: true, clientUid: uid });
}

export {
  clientState,
  loadClientsTab,
  navigateToClient,
  createClientListItem,
  createClientSwipeRow,
  parseClientDeepLinkFromUrl,
};
