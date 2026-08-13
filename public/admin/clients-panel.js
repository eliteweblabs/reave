/**
 * clients panel — extracted from os-map-loader.js
 */
import {
  iosIcon,
  createCenteredListEmpty,
  listSearchSubheader,
  listSearchAddNew,
  createSlidingPillSelect,
  createPanelBackBtn,
  createPaneSubheader,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  cancelTitleFocus,
  matchesListSearch,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  bindListMultiSelect,
  exitListMultiSelect,
  showContextMenu,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  swipeJunkAction,
  swipeReceiptAction,
  swipeClearAction,
  paneDeleteIcon,
  paneShareIcon,
  createAgentBtn,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  deBtnIconSvg,
  downloadBrandingImage,
  attachIosPullToRefresh,
  pullRefreshContentRoot,
  createInputClearAdornment,
  syncInputClearAdornment,
  contactAvatarHtml,
  mountContactAvatars,
} from './admin-ui.js?v=20260811d';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, registerContactAuthorIcons, mountPanelSkeleton, skeletonHtml } from './shared.js?v=20260811d';
import { osConfirm } from './os-dialog.js?v=20260728j';
import {
  openMediaPicker,
  brandingMediaFilter,
  applyMediaToTarget,
} from './media-picker.js?v=20260811a';
import {
  navigateToWork,
  mountClientWorkSection,
  mountClientDetailTabs,
  contactShowsClientBusinessTabs,
  showClientDetailPanel,
  createClientDetailPanel,
  mountClientVaultSection,
  mountClientAnalyticsSection,
  flushClientVaultSave,
} from './work-panel.js?v=20260810c';
import { createDetailChrome, createDetailFormScroll, createDetailPanelBody } from './detail-tabs.js?v=20260807b';
import { mountListFilterTabs } from './filter-tabs.js?v=20260811a';
import { mountAddressAutocomplete } from './schedule-panel.js?v=20260812b';
import { createPortalShareBtn } from './chat-panel.js?v=20260810a';
import { createClientMap } from '/admin/client-map.js?v=20260804b';

/** Injected by os-map-loader via initClientsPanel(). */
let shell = {};

export function initClientsPanel(deps) {
  shell = deps;
}

// ---- extracted from os-map-loader.js:13090-14743 ----
// ---- clients tab ----

const CLIENT_DETAIL_TAB_IDS = new Set([
  'profile',
  'branding',
  'notes',
  'projects',
  'vault',
  'analytics',
]);

function parseClientDetailTabFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get('view')?.trim().toLowerCase();
    if (raw && CLIENT_DETAIL_TAB_IDS.has(raw)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

function normalizeClientDetailTab(raw) {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return CLIENT_DETAIL_TAB_IDS.has(v) ? v : null;
}

let clientState = {
  clients: [],
  total: 0,
  search: '',
  contactFilter: 'all',
  activeUid: null,
  detailTab: parseClientDetailTabFromUrl() || 'profile',
  dirty: false,
  draft: null,
  returnToWorkSlug: null,
  returnToScheduleUid: null,
};
const CLIENT_LAST_ACTIVE_KEY = 'clients:lastActiveUid-v1';

const CLIENT_KINDS = ['professional', 'service', 'personal', 'proposed'];
const CLIENT_KIND_LABELS = {
  professional: 'Client',
  service: 'Service',
  personal: 'Personal',
  proposed: 'Proposed',
};

function normalizeClientKind(raw) {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (CLIENT_KINDS.includes(v)) return v;
  return 'professional';
}

function clientKindFromRecord(c) {
  if (c?.kind) return normalizeClientKind(c.kind);
  if (c?.personal) return 'personal';
  return 'professional';
}

function clientKindTagHtml(c) {
  const kind = clientKindFromRecord(c);
  if (kind === 'personal') return '<span class="cl-kind-tag cl-kind-tag--personal">Personal</span>';
  if (kind === 'proposed') return '<span class="cl-kind-tag cl-kind-tag--proposed">Proposed</span>';
  if (kind === 'service') return '<span class="cl-kind-tag cl-kind-tag--service">Service</span>';
  return '';
}

let clientSearchTimer = null;
let clientAutosaveTimer = null;
let clientAutosaveSeq = 0;
let clientAutosaveAbort = null;
let clientFieldRegistry = [];
let clientMapController = null;
let clientPendingGeo = null;
let destroyClientAddressAutocomplete = null;
/** Bumped on autocomplete pick so an in-flight blur save cannot overwrite it. */
let clientAddressCommitGen = 0;
/** Monotonic token sent with address PATCHes; server rejects older tokens. */
let clientAddressWriteToken = 0;
/** Pending deferred address-blur save (iOS fires blur before option click). */
let clientAddressBlurTimer = null;

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
  if (clientAddressBlurTimer) {
    clearTimeout(clientAddressBlurTimer);
    clientAddressBlurTimer = null;
  }
  clientPendingGeo = null;
}

function nextClientAddressWriteToken() {
  clientAddressWriteToken += 1;
  return clientAddressWriteToken;
}

function cancelClientAddressBlurSave() {
  if (clientAddressBlurTimer) {
    clearTimeout(clientAddressBlurTimer);
    clientAddressBlurTimer = null;
  }
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
  el.classList.remove(CLIENT_FIELD_VALID, CLIENT_FIELD_INVALID, shell.FORM_FIELD_INVALID, shell.FORM_FIELD_SAVED);
  if (!show) return;
  if (!valid) {
    el.classList.add(CLIENT_FIELD_INVALID, shell.FORM_FIELD_INVALID);
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

function cancelClientAutosaveTimer() {
  if (clientAutosaveTimer) {
    clearTimeout(clientAutosaveTimer);
    clientAutosaveTimer = null;
  }
}

function clientGeoMatches(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.lat === b.lat && a.lng === b.lng;
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
  return (c.company || '').trim() || (c.name || '').trim() || 'Contact';
}

function clientListSubline(c) {
  const company = (c.company || '').trim();
  const name = (c.name || '').trim();
  // Only show name as a person subline when it is distinct from the business title
  // (not a variant like "Pink Elephant LLC" under "Pink Elephant Painting").
  if (
    company &&
    name &&
    name.toLowerCase() !== company.toLowerCase() &&
    !namesReferToSameBusiness(name, company)
  ) {
    return name;
  }
  return c.email || c.phone || `${c.uid.slice(0, 8)}…`;
}

function clientListAvatarHtml(c) {
  const url =
    clientBrandingPreviewUrl(c.iconUrl) || clientBrandingPreviewUrl(c.logoUrl);
  return contactAvatarHtml({ iconUrl: url, iconSize: 18 });
}

function mountClientListAvatar(root) {
  mountContactAvatars(root);
}

function filterClientsForSidebar(clients) {
  const f = clientState.contactFilter;
  if (f === 'all') return clients;
  return clients.filter((c) => clientKindFromRecord(c) === f);
}

function clientFilterCounts(clients) {
  let professional = 0;
  let service = 0;
  let personal = 0;
  let proposed = 0;
  for (const c of clients) {
    const kind = clientKindFromRecord(c);
    if (kind === 'personal') personal++;
    else if (kind === 'proposed') proposed++;
    else if (kind === 'service') service++;
    else professional++;
  }
  return { all: clients.length, professional, service, proposed, personal };
}

function renderClientFilterTabs(savedScrollLeft = 0) {
  const counts = clientFilterCounts(clientState.clients);
  return mountListFilterTabs({
    tabs: [
      { id: 'all', label: 'All', count: counts.all },
      { id: 'professional', label: 'Client', count: counts.professional },
      { id: 'service', label: 'Service', count: counts.service },
      { id: 'proposed', label: 'Proposed', count: counts.proposed },
      { id: 'personal', label: 'Personal', count: counts.personal },
    ],
    activeId: clientState.contactFilter,
    ariaLabel: 'Contact list filters',
    savedScrollLeft,
    onSelect(tabId) {
      clientState.contactFilter = tabId;
      const visible = filterClientsForSidebar(clientState.clients);
      let cleared = false;
      if (clientState.activeUid && !visible.some((c) => c.uid === clientState.activeUid)) {
        clientState.activeUid = null;
        clientState.draft = null;
        clientState.autosaveGetPayload = null;
        clientState.returnToWorkSlug = null;
        clientState.returnToScheduleUid = null;
        clearClientLastActiveUid();
        syncClientDeepLinkUrl(null);
        getClientsEditor()?.classList.remove('de-pane-active');
        cleared = true;
      }
      refreshClientsSidebarList();
      syncClientsListActiveState();
      if (cleared) renderClientsPane();
    },
  });
}

async function fetchClientsList() {
  const params = new URLSearchParams();
  if (clientState.search.trim()) params.set('q', clientState.search.trim());
  const qs = params.toString();
  const res = await fetch(`/api/clients${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  clientState.clients = data.clients || [];
  registerContactAuthorIcons(clientState.clients);
  clientState.total = data.total ?? clientState.clients.length;
}

function readClientLastActiveUid() {
  try {
    return localStorage.getItem(CLIENT_LAST_ACTIVE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function rememberClientActiveUid(uid) {
  if (!uid || uid === '__new__') return;
  try {
    localStorage.setItem(CLIENT_LAST_ACTIVE_KEY, uid);
  } catch {
    /* ignore quota / private mode */
  }
}

function clearClientLastActiveUid() {
  try {
    localStorage.removeItem(CLIENT_LAST_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

function syncClientDeepLinkUrl(uid) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'clients');
    if (uid && uid !== '__new__') {
      url.searchParams.set('client', uid);
      const view = clientState.detailTab;
      if (view && view !== 'profile') url.searchParams.set('view', view);
      else url.searchParams.delete('view');
    } else {
      url.searchParams.delete('client');
      url.searchParams.delete('view');
    }
    history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

function setClientDetailTab(tabId) {
  clientState.detailTab = normalizeClientDetailTab(tabId) || 'profile';
  syncClientDeepLinkUrl(clientState.activeUid);
}

function ensureClientMobilePaneOpen() {
  if (!shell.isAdminPaneMobile?.() || !clientState.activeUid) return;
  getClientsEditor()?.classList.add('de-pane-active');
}

function syncClientsListActiveState(opts = {}) {
  const { scroll = false } = opts;
  const root = getClientsEditor();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .ch-list-item[data-id]').forEach((item) => {
    const isActive = item.dataset.id === clientState.activeUid;
    item.classList.toggle('active', isActive);
    if (isActive) {
      item.setAttribute('aria-current', 'page');
      activeEl = item;
    } else {
      item.removeAttribute('aria-current');
    }
  });
  if (scroll && activeEl) {
    const list = root.querySelector('.ch-sidebar .ch-list');
    if (list) {
      requestAnimationFrame(() => shell.scrollSidebarListItemIntoView(list, activeEl));
    }
  }
}

/** Prefill for new-contact form when opened from email / other panels. */
let pendingNewClientPrefill = null;

async function loadClientsTab(opts = {}) {
  const root = getClientsEditor();
  if (!root) return;

  const openNewClient = Boolean(opts.newClient || pendingNewClientPrefill);
  const pendingDeepLink = openNewClient
    ? null
    : opts.clientUid || pendingClientDeepLinkUid || parseClientDeepLinkFromUrl();
  const canPreserveMounted =
    !openNewClient &&
    root.querySelector('.de-pane') &&
    clientState.activeUid &&
    clientState.activeUid !== '__new__' &&
    !clientState.dirty &&
    !pendingDeepLink;

  if (canPreserveMounted) {
    pendingClientDeepLinkUid = null;
    try {
      await fetchClientsList();
    } catch {
      /* keep current detail view if list refresh fails */
    }
    refreshClientsSidebarList();
    syncClientsListActiveState();
    ensureClientMobilePaneOpen();
    return;
  }

  mountPanelSkeleton(root, 'list', 'Loading contacts…', { contentSelector: '.ch-sidebar' });
  try {
    await fetchClientsList();
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
    return;
  }

  if (openNewClient) {
    pendingClientDeepLinkUid = null;
    startNewClient(pendingNewClientPrefill || {});
    return;
  }

  pendingClientDeepLinkUid = null;
  let restoreUid = pendingDeepLink || null;
  if (!restoreUid && clientState.activeUid && clientState.activeUid !== '__new__') {
    restoreUid = clientState.activeUid;
  }
  if (!restoreUid) restoreUid = readClientLastActiveUid();

  if (restoreUid && !clientState.clients.some((c) => c.uid === restoreUid)) {
    restoreUid = null;
    clearClientLastActiveUid();
  }

  if (!restoreUid) {
    clientState.returnToWorkSlug = null;
    clientState.returnToScheduleUid = null;
  }
  clientState.activeUid = restoreUid || null;
  clientState.dirty = false;
  clientState.draft = null;
  if (restoreUid) {
    const urlUid = parseClientDeepLinkFromUrl();
    const urlTab = parseClientDetailTabFromUrl();
    if (urlUid === restoreUid && urlTab) clientState.detailTab = urlTab;
  }
  shell.clearEditorFooterSave();

  if (clientState.activeUid) {
    rememberClientActiveUid(clientState.activeUid);
    syncClientDeepLinkUrl(clientState.activeUid);
  } else {
    clearClientLastActiveUid();
    syncClientDeepLinkUrl(null);
    getClientsEditor()?.classList.remove('de-pane-active');
  }

  renderClientsEditor();
  if (clientState.activeUid && shell.isAdminPaneMobile?.()) getClientsEditor()?.classList.add('de-pane-active');
}

function scheduleClientSearch() {
  clearTimeout(clientSearchTimer);
  clientSearchTimer = setTimeout(async () => {
    try {
      await fetchClientsList();
      refreshClientsSidebarList();
    } catch (e) {
      alert(`Search failed: ${e.message}`);
    }
  }, 300);
}

function fillClientsSidebarList(list) {
  exitListMultiSelect(list);
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
        : clientState.contactFilter === 'professional'
          ? 'No clients yet.'
          : clientState.contactFilter === 'service'
            ? 'No service contacts yet.'
          : clientState.contactFilter === 'proposed'
            ? 'No proposed contacts yet.'
            : clientState.search.trim()
              ? 'No matches.'
              : 'No contacts yet.';
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
    const contactLabel = visible.length === 1 ? 'Contact' : 'Contacts';
    searchInput.placeholder = `Search ${visible.length} ${contactLabel}`;
  }
  fillClientsSidebarList(list);
}

let newClientFormGetPayload = null;

function startNewClient(opts = {}) {
  const prefill = {
    name: String(opts.name ?? pendingNewClientPrefill?.name ?? '').trim(),
    email: String(opts.email ?? pendingNewClientPrefill?.email ?? '').trim(),
  };
  pendingNewClientPrefill = null;
  armTitleFocus('clients');
  shell.beginCreateDrawer({
    key: 'clients',
    title: 'New Contact',
    submitLabel: 'Add',
    onSubmit: async () => {
      const payload = newClientFormGetPayload?.();
      if (!payload) {
        const companyInput = shell.getCreateDrawerPane()?.querySelector('.cl-company-input');
        if (companyInput) {
          shell.setFormFieldState(companyInput, 'invalid');
          companyInput.focus({ preventScroll: true });
        }
        return;
      }
      await createClient(payload);
    },
    onDismiss: () => {
      newClientFormGetPayload = null;
      void closeClientEditor(false);
    },
  });
  clientState.activeUid = '__new__';
  clientState.detailTab = 'profile';
  clientState.dirty = false;
  clientState.draft = {
    name: prefill.name,
    email: prefill.email,
    phone: '',
    company: '',
    website: '',
    notes: '',
    personal: false,
    kind: 'professional',
  };
  syncClientsListActiveState();
  renderClientsPane();
}

/** Switch to Contacts and open the new-contact form (optional email/name prefill). */
function navigateToNewClient(opts = {}) {
  pendingNewClientPrefill = {
    name: String(opts.name || '').trim(),
    email: String(opts.email || '').trim(),
  };
  pendingClientDeepLinkUid = null;
  shell.setActiveMap('clients', { force: true, newClient: true });
}

function renderClientsPane() {
  const root = getClientsEditor();
  if (!root) return;
  let pane = root.querySelector('.de-pane');
  if (!pane) {
    renderClientsEditor();
    return;
  }
  const { activeUid } = clientState;

  if (activeUid === '__new__') {
    renderNewClientForm(pane);
    shell.mountCreateDrawerChrome(pane);
  } else if (activeUid) {
    renderEditClientForm(pane);
  } else {
    shell.clearEditorFooterSave();
    pane.innerHTML = '';
    shell.appendEmptyDetailPane(pane, {
      mapKey: 'clients',
      iconName: 'users',
      bodyHtml: '<p>Select a contact to edit, or add a new one.</p>',
      btnLabel: 'Add New',
      onCreate: () => startNewClient(),
    });
  }
  flushTitleFocus('clients');
}

function renderClientsEditor() {
  const root = getClientsEditor();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll(root);
  const savedFilterScroll = shell.captureFilterTabsScroll(root);
  const { clients } = clientState;
  const visibleCount = filterClientsForSidebar(clients).length;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const contactLabel = visibleCount === 1 ? 'Contact' : 'Contacts';
  const subheader = listSearchSubheader({
    itemCount: visibleCount,
    search: {
      value: clientState.search,
      placeholder: `Search ${visibleCount} ${contactLabel}`,
      onInput: (value) => {
        clientState.search = value;
        scheduleClientSearch();
      },
    },
    below: renderClientFilterTabs(savedFilterScroll),
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const mapLink = document.createElement('a');
  mapLink.href = '/admin/client-map';
  mapLink.className = 'cl-client-map-link';
  mapLink.textContent = 'Open contact map';
  sidebar.appendChild(mapLink);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  bindListMultiSelect(list, { onBulkDelete: bulkDeleteClients });
  fillClientsSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  root.appendChild(pane);
  renderClientsPane();
  shell.finishSidebarListScroll(root, savedSidebarScroll);
  shell.scanPanelSidebars?.();
}

/**
 * Legal / trade tokens that mark a string as a business title, not a person.
 * Used so contact-api's naive name split ("Pink" / "Elephant LLC") never lands
 * in the First/Last profile fields.
 */
// Keep in sync with src/lib/contactPersonName.ts
const BUSINESS_NAME_TOKEN_RE =
  /\b(?:llc|l\.?l\.?c\.?|inc\.?|incorporated|ltd\.?|limited|corp\.?|corporation|co\.?|company|llp|pllc|p\.?c\.?|plc|gmbh|group|holdings|partners|associates|enterprises|industries|services|solutions|studio|studios|agency|consulting|construction|contracting|painting|painters|plumbing|electric(?:al)?|roofing|landscaping|cleaning|properties|realty|restaurant|cafe|clinic|media|productions?|daycare|day\s*care|grooming|groomers?|kennels?|veterinary|veterinarian|salon|spa|boutique)\b/i;

function naiveSplitPersonName(full) {
  const parts = String(full || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Strip legal/trade suffixes and punctuation for fuzzy business-title compare. */
function normalizeBusinessNameCore(value) {
  return String(value || '')
    .toLowerCase()
    .replace(BUSINESS_NAME_TOKEN_RE, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBusinessTitle(value) {
  const s = String(value || '').trim();
  return !!s && BUSINESS_NAME_TOKEN_RE.test(s);
}

/** True when two labels refer to the same business (incl. LLC vs trade-name variants). */
function namesReferToSameBusiness(a, b) {
  if (!a || !b) return false;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const ca = normalizeBusinessNameCore(a);
  const cb = normalizeBusinessNameCore(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const ta = ca.split(' ');
  const tb = cb.split(' ');
  // Require multi-word cores so a lone "Pink" never matches "Pink Elephant".
  if (ta.length < 2 || tb.length < 2) return false;
  // Word-boundary prefix only — "john s" must not match "john smith".
  return ca.startsWith(`${cb} `) || cb.startsWith(`${ca} `);
}

/** True when first/last are just the company title chopped on the first space. */
function isSplitOfCompany(first, last, company) {
  if (!first || !company) return false;
  const naive = naiveSplitPersonName(company);
  if (first.toLowerCase() !== naive.firstName.toLowerCase()) return false;
  return !last || last.toLowerCase() === naive.lastName.toLowerCase();
}

function splitClientNameParts(contact) {
  const full = (contact.name || '').trim();
  const company = (contact.company || '').trim();
  const first = (contact.firstName || '').trim();
  const last = (contact.lastName || '').trim();

  if (company) {
    if (isSplitOfCompany(first, last, company)) return { firstName: '', lastName: '' };
    return { firstName: first, lastName: last };
  }

  // Only a name — this is the one case we split into First / Last.
  if (first || last) return { firstName: first, lastName: last };
  if (full) return naiveSplitPersonName(full);
  return { firstName: '', lastName: '' };
}

/** Company title for the profile header. Never invent one by splitting a name. */
function resolveClientCompany(contact) {
  return (contact.company || '').trim();
}

function joinClientFullName(firstName, lastName, company = '') {
  const person = [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(' ');
  return person || company.trim();
}

function clientDisplayLabel(draft) {
  return draft?.company?.trim() || joinClientFullName(draft?.firstName, draft?.lastName) || draft?.name || 'Contact';
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
  mountClientListAvatar(host);
}

function appendClientField(parent, label, input) {
  const wrap = document.createElement('label');
  wrap.className = 'de-label';
  wrap.textContent = label;
  wrap.appendChild(input);
  parent.appendChild(wrap);
}

function mountClientKindPill(parent, initialKind, onChange) {
  const pill = createSlidingPillSelect({
    label: 'Type',
    value: normalizeClientKind(initialKind),
    options: CLIENT_KINDS.map((value) => ({ value, label: CLIENT_KIND_LABELS[value] })),
    ariaLabel: 'Contact type',
    onChange,
  });
  parent.appendChild(pill.el);
  return pill;
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

function mountClientAddressField(parent, value, clearActions = null) {
  const wrap = document.createElement('label');
  wrap.className = 'de-label';
  wrap.textContent = 'Address';

  const field = document.createElement('div');
  field.className = 'control-field cl-address-field';

  const input = document.createElement('input');
  input.className = 'de-input cl-address-input';
  input.placeholder = 'Business or street address';
  input.value = value || '';
  input.autocomplete = 'street-address';

  const clearBtn = createInputClearAdornment(
    input,
    () => clearActions?.fn?.(),
    'Clear address',
  );
  input.addEventListener('input', () => {
    syncInputClearAdornment(input, clearBtn, 'Clear address');
  });

  field.appendChild(input);
  field.appendChild(clearBtn);
  wrap.appendChild(field);
  parent.appendChild(wrap);
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
  openBtn.innerHTML = shell.navIcon('external-link', 18);
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
        `<button type="button" id="cl-logo-download" class="de-btn de-btn-secondary de-btn-with-icon prof-branding-download"${hasLogo ? '' : ' hidden'}></button>` +
        `<div id="cl-logo-file-wrap" class="prof-logo-file-wrap"${hasLogo && !disabled ? ' hidden' : ''}>` +
          `<input id="cl-logo-file" type="file" accept="image/png,image/jpeg,image/webp"${disabled ? ' disabled' : ''} />` +
        `</div>` +
        `<button type="button" id="cl-logo-library" class="de-btn de-btn-secondary prof-branding-library-btn"${disabled ? ' hidden' : ''}>Library</button>` +
      `</div>` +
    `</div>` +
    `<div class="prof-branding-upload-item">` +
      `<label for="cl-icon-file">Icon</label>` +
      `<div class="prof-logo-upload">` +
        `<div id="cl-icon-preview-wrap" class="prof-logo-preview-wrap"${hasIcon ? '' : ' hidden'}>` +
          `<img id="cl-icon-preview" class="prof-icon-preview" src="${escHtml(iconUrl)}" alt="" />` +
          `<button type="button" id="cl-icon-remove" class="prof-logo-remove" aria-label="Remove icon"${hasIcon ? '' : ' hidden'}>×</button>` +
        `</div>` +
        `<button type="button" id="cl-icon-download" class="de-btn de-btn-secondary de-btn-with-icon prof-branding-download"${hasIcon ? '' : ' hidden'}></button>` +
        `<div id="cl-icon-file-wrap" class="prof-logo-file-wrap"${hasIcon && !disabled ? ' hidden' : ''}>` +
          `<input id="cl-icon-file" type="file" accept="image/png,image/jpeg,image/webp"${disabled ? ' disabled' : ''} />` +
        `</div>` +
        `<button type="button" id="cl-icon-library" class="de-btn de-btn-secondary prof-branding-library-btn"${disabled ? ' hidden' : ''}>Library</button>` +
      `</div>` +
    `</div>`;

  const hint = document.createElement('span');
  hint.className = 'prof-hint prof-hint--block cl-branding-hint';
  hint.textContent = disabled
    ? 'Save the contact first to upload logo and icon.'
    : 'Logo: client portal header. Icon: install icon and favicons. PNG, JPEG, or WebP — max 2 MB each. Upload a file, pick from the Media library, or fetch logos from the website URL.';

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
  const logoDownload = root.querySelector('#cl-logo-download');

  const iconFile = root.querySelector('#cl-icon-file');
  const iconFileWrap = root.querySelector('#cl-icon-file-wrap');
  const iconPreviewWrap = root.querySelector('#cl-icon-preview-wrap');
  const iconPreview = root.querySelector('#cl-icon-preview');
  const iconRemove = root.querySelector('#cl-icon-remove');
  const iconDownload = root.querySelector('#cl-icon-download');

  if (logoDownload instanceof HTMLButtonElement) setDeBtnLabel(logoDownload, 'Download', 'download');
  if (iconDownload instanceof HTMLButtonElement) setDeBtnLabel(iconDownload, 'Download', 'download');

  const fileBase = String(uid || 'client').trim() || 'client';

  const refreshLogo = (logoUrl, logoSource) => {
    const url = clientBrandingPreviewUrl(logoUrl);
    const has = !!url;
    if (logoPreview instanceof HTMLImageElement) logoPreview.src = url;
    logoPreviewWrap?.toggleAttribute('hidden', !has);
    logoFileWrap?.toggleAttribute('hidden', has);
    logoRemove?.toggleAttribute('hidden', !has);
    logoDownload?.toggleAttribute('hidden', !has);
  };

  const refreshIcon = (iconUrl, iconSource) => {
    const url = clientBrandingPreviewUrl(iconUrl);
    const has = !!url;
    if (iconPreview instanceof HTMLImageElement) iconPreview.src = url;
    iconPreviewWrap?.toggleAttribute('hidden', !has);
    iconFileWrap?.toggleAttribute('hidden', has);
    iconRemove?.toggleAttribute('hidden', !has);
    iconDownload?.toggleAttribute('hidden', !has);
  };

  logoDownload?.addEventListener('click', async () => {
    const url = logoPreview instanceof HTMLImageElement ? logoPreview.src : '';
    if (!url || !(logoDownload instanceof HTMLButtonElement)) return;
    logoDownload.disabled = true;
    try {
      await downloadBrandingImage(url, `${fileBase}-logo`);
    } catch {
      alert('Download failed — please try again.');
    } finally {
      logoDownload.disabled = false;
    }
  });

  iconDownload?.addEventListener('click', async () => {
    const url = iconPreview instanceof HTMLImageElement ? iconPreview.src : '';
    if (!url || !(iconDownload instanceof HTMLButtonElement)) return;
    iconDownload.disabled = true;
    try {
      await downloadBrandingImage(url, `${fileBase}-icon`);
    } catch {
      alert('Download failed — please try again.');
    } finally {
      iconDownload.disabled = false;
    }
  });

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

  root.querySelector('#cl-logo-library')?.addEventListener('click', () => {
    void openMediaPicker({
      title: 'Choose contact logo',
      hint: 'Choose a PNG, JPEG, or WebP under 2 MB.',
      emptyHint:
        'No logos in the library yet. Close and upload a file here, or add one from the Media tab.',
      emptyFilteredHint:
        'Library files are present, but none are PNG, JPEG, or WebP under 2 MB.',
      filter: brandingMediaFilter,
      onPick: async (item) => {
        const json = await applyMediaToTarget(item.id, 'client-logo', uid);
        refreshLogo(json.logoUrl || '', 'upload');
        onUpdate({ logoUrl: json.logoUrl || '', logoSource: 'upload' });
      },
    });
  });

  root.querySelector('#cl-icon-library')?.addEventListener('click', () => {
    void openMediaPicker({
      title: 'Choose contact icon',
      hint: 'Choose a PNG, JPEG, or WebP under 2 MB.',
      emptyHint:
        'No icons in the library yet. Close and upload a file here, or add one from the Media tab.',
      emptyFilteredHint:
        'Library files are present, but none are PNG, JPEG, or WebP under 2 MB.',
      filter: brandingMediaFilter,
      onPick: async (item) => {
        const json = await applyMediaToTarget(item.id, 'client-icon', uid);
        refreshIcon(json.iconUrl || '', 'upload');
        onUpdate({ iconUrl: json.iconUrl || '', iconSource: 'upload' });
      },
    });
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
  return createDetailFormScroll(pane, 'cl-form-scroll');
}

function openCardDavImportFromNewClient() {
  // Full navigation leaves the create drawer; import-contacts is a separate page.
  window.location.assign('/admin/import-contacts');
}

function renderNewClientForm(pane) {
  clearClientFieldRegistry();
  pane.innerHTML = '';

  const inDrawer = shell.isCreateDrawerOpen('clients');
  if (!inDrawer) {
    const chrome = createDetailChrome(pane, 'cl-detail-chrome');
    chrome.appendChild(
      createPaneSubheader({
        back: {
          label: clientBackLabel(),
          onClick: () => closeClientEditor(false),
        },
        title: 'New Contact',
      }).header,
    );
  }

  const scroll = createClientFormScroll(pane);
  const body = createDetailPanelBody();
  const fields = document.createElement('div');
  fields.className = 'de-fields';

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'cl-import-carddav-btn';
  importBtn.innerHTML =
    `${iosIcon('upload', 16)}<span>Import from CardDAV</span>${iosIcon('chevron-right', 16)}`;
  importBtn.addEventListener('click', openCardDavImportFromNewClient);
  fields.appendChild(importBtn);

  const companyInput = document.createElement('input');
  companyInput.className = 'de-input cl-company-input';
  companyInput.placeholder = 'Company name';
  companyInput.autocomplete = 'organization';
  companyInput.value = clientState.draft?.company || '';
  appendClientField(fields, 'Company name', companyInput);
  requestTitleFocus('clients', companyInput);

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

  let kindPill = null;
  const brandingHost = document.createElement('div');
  brandingHost.className = 'cl-new-branding-host';
  function syncNewClientBrandingVisibility() {
    const show = contactShowsClientBusinessTabs(
      kindPill?.getValue?.() ?? clientState.draft?.kind,
    );
    brandingHost.hidden = !show;
    if (show && !brandingHost.dataset.mounted) {
      brandingHost.dataset.mounted = '1';
      mountClientBrandingSection(brandingHost, null, clientState.draft, { disabled: true });
    }
  }
  kindPill = mountClientKindPill(fields, clientState.draft?.kind, () => {
    syncNewClientBrandingVisibility();
  });
  fields.appendChild(brandingHost);
  syncNewClientBrandingVisibility();

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

  body.appendChild(fields);
  scroll.appendChild(body);
  registerClientField(companyInput, () => !!joinClientFullName(firstNameInput.value, lastNameInput.value, companyInput.value));
  registerClientField(notesTa, () => true);

  newClientFormGetPayload = () => {
    refreshAllClientFields();
    const name = joinClientFullName(firstNameInput.value, lastNameInput.value, companyInput.value);
    if (!name) return null;
    if (!isValidClientEmail(emailInput.value) || !isValidClientPhone(phoneInput.value)) return null;
    return {
      name,
      email: emailInput.value.trim(),
      phone: phoneToStorage(phoneInput.value),
      company: companyInput.value.trim(),
      website: websiteInput.value.trim(),
      notes: notesTa.value.trim(),
      kind: kindPill.getValue(),
    };
  };

  shell.clearEditorFooterSave();
  if (!inDrawer) {
    shell.setEditorFooterSave(async () => {
      const payload = newClientFormGetPayload?.();
      if (!payload) return;
      return createClient(payload);
    });
    getClientsEditor()?.classList.add('de-pane-active');
  }
}

function renderEditClientForm(pane) {
  clearClientFieldRegistry();
  const uid = clientState.activeUid;
  clientState.vaultGetData = null;
  pane.innerHTML = skeletonHtml('list', 'Loading…');

  fetch(`/api/clients/${encodeURIComponent(uid)}`, { cache: 'no-store' })
    .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.error || 'Failed to load');
      const contact = data.contact ?? data;
      const { firstName, lastName } = splitClientNameParts(contact);
      const company = resolveClientCompany(contact, firstName, lastName);
      clientState.draft = {
        name: contact.name || '',
        firstName,
        lastName,
        email: contact.email || '',
        phone: contact.phone || '',
        company,
        website: data.website || contact.website || '',
        address: data.address || '',
        addressWriteToken:
          typeof data.addressWriteToken === 'number' && Number.isFinite(data.addressWriteToken)
            ? data.addressWriteToken
            : 0,
        geo: data.geo || null,
        notes: contact.notes || '',
        kind: clientKindFromRecord({ kind: data.kind, personal: data.personal ?? contact.personal }),
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
      clientAddressWriteToken = Math.max(
        clientAddressWriteToken,
        Number(clientState.draft.addressWriteToken) || 0,
      );
      cancelClientAddressBlurSave();
      syncClientListAvatar(uid, {
        logoUrl: clientState.draft.logoUrl,
        iconUrl: clientState.draft.iconUrl,
      });
      pane.innerHTML = '';

      const agentBtn = createAgentBtn({
        label: 'Agent',
        title: 'Send to Agent',
        onClick: () => askAgentAboutClient(uid),
      });

      const shareBtn = clientKindFromRecord(clientState.draft) === 'personal'
        ? null
        : createPortalShareBtn(uid, {
        title: `${clientDisplayLabel(clientState.draft)} — portal`,
        recipient: {
          contactUid: uid,
          name: joinClientFullName(firstName, lastName, clientState.draft.company) || 'Contact',
          email: clientState.draft.email,
          phone: clientState.draft.phone,
        },
      });

      const { header, titleInput: companyInput } = createPaneSubheader({
        back: {
          label: clientBackLabel(),
          onClick: () => closeClientEditor(),
        },
        editableTitle: {
          value: clientState.draft.company || '',
          placeholder: 'Company name',
          ariaLabel: 'Company name',
        },
        icons: [
          agentBtn,
          shareBtn,
          paneDeleteIcon({
            label: 'Delete contact',
            onClick: () => deleteClient(uid),
          }),
        ].filter(Boolean),
      });
      header.classList.add('pane-header');
      const chrome = createDetailChrome(pane, 'cl-detail-chrome');
      chrome.appendChild(header);

      const showBusinessTabs = contactShowsClientBusinessTabs(clientState.draft);
      if (
        !showBusinessTabs &&
        (clientState.detailTab === 'branding' || clientState.detailTab === 'analytics')
      ) {
        setClientDetailTab('profile');
      }

      mountClientDetailTabs(
        chrome,
        clientState.detailTab,
        (tabId) => {
          setClientDetailTab(tabId);
          showClientDetailPanel(pane, tabId);
        },
        { showBusinessTabs },
      );

      const scroll = createClientFormScroll(pane);
      const activeTab = clientState.detailTab;

      const profilePanel = createClientDetailPanel('profile', activeTab);
      const profileBody = createDetailPanelBody();
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

      const kindPill = mountClientKindPill(profileFields, clientState.draft.kind, () => {
        queueAutosaveRef();
      });
      let queueAutosaveRef = () => {};
      let saveNowRef = async () => {};
      const addressClearActions = { fn: null };

      const addressInput = mountClientAddressField(
        profileFields,
        clientState.draft.address || '',
        addressClearActions,
      );
      registerClientField(addressInput, () => true);
      destroyClientAddressAutocomplete = mountAddressAutocomplete(
        addressInput,
        getClientsEditor() || document.body,
        async (pickedAddress) => {
          cancelClientAutosaveTimer();
          cancelClientAddressBlurSave();
          clientActiveField = addressInput;
          const commitGen = ++clientAddressCommitGen;
          const writeToken = nextClientAddressWriteToken();
          // Persist the selected dropdown label immediately — never the typed
          // query. Waiting on geocode let blur races PATCH typed text and win.
          await saveNowRef({
            commitAddress: true,
            address: pickedAddress,
            addressWriteToken: writeToken,
          });
          if (commitGen !== clientAddressCommitGen) return;
          clientPendingGeo = await geocodeClientAddressPreview(pickedAddress);
          if (commitGen !== clientAddressCommitGen) return;
          if (clientPendingGeo && clientMapController) {
            clientMapController.setLocation(
              clientPendingGeo.lat,
              clientPendingGeo.lng,
              pickedAddress,
            );
          }
          if (clientPendingGeo) {
            await saveNowRef({
              commitAddress: true,
              address: pickedAddress,
              geo: clientPendingGeo,
              addressWriteToken: writeToken,
            });
          }
        },
      );

      mountClientMapSection(profileFields, clientState.draft);
      profileBody.appendChild(profileFields);
      profilePanel.appendChild(profileBody);
      scroll.appendChild(profilePanel);

      if (showBusinessTabs) {
        const brandingPanel = createClientDetailPanel('branding', activeTab);
        const brandingBody = createDetailPanelBody();
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
        brandingBody.appendChild(brandingFields);
        brandingPanel.appendChild(brandingBody);
        scroll.appendChild(brandingPanel);
      } else {
        clientState.brandingRefresh = null;
      }

      const notesPanel = createClientDetailPanel('notes', activeTab);
      const notesBody = createDetailPanelBody();
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
      notesBody.appendChild(notesFields);
      notesPanel.appendChild(notesBody);
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

      if (showBusinessTabs) {
        const analyticsPanel = createClientDetailPanel('analytics', activeTab);
        void mountClientAnalyticsSection(analyticsPanel, uid);
        scroll.appendChild(analyticsPanel);
      }

      // Address is committed only on autocomplete pick, blur, clear, or flush.
      // Keystroke debounce must not PATCH partial typed text — that races the
      // select save and leaves the typed query after refresh.
      const getPayload = ({ commitAddress = false, address, geo, addressWriteToken } = {}) => {
        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const company = companyInput.value.trim();
        const website = websiteInput.value.trim();
        const payload = {
          name: joinClientFullName(firstName, lastName, company),
          email: emailInput.value.trim(),
          phone: phoneToStorage(phoneInput.value),
          company,
          notes: notesTa.value.trim(),
          kind: kindPill.getValue(),
        };
        // Only PATCH website when it changed — unchanged website used to force
        // brand/portal enrich on every autosave, which rewrote stale portal
        // metadata and wiped the autocomplete-selected address.
        if (website !== (clientState.draft.website || '')) {
          payload.website = website;
        }
        if (commitAddress) {
          payload.address =
            address != null ? String(address).trim() : addressInput.value.trim();
          payload.addressWriteToken =
            addressWriteToken != null ? addressWriteToken : nextClientAddressWriteToken();
          if (geo !== undefined) {
            if (geo) payload.geo = geo;
            else if (!payload.address) payload.geo = null;
          } else if (clientPendingGeo) {
            payload.geo = clientPendingGeo;
          } else if (!payload.address) {
            payload.geo = null;
          }
        }
        return payload;
      };
      clientState.autosaveGetPayload = () => getPayload({ commitAddress: true });

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
          kindPill.getValue() !== normalizeClientKind(clientState.draft.kind);
      };
      const queueAutosave = () => {
        markDirty();
        scheduleClientAutosave(uid, () => getPayload({ commitAddress: false }));
      };
      queueAutosaveRef = queueAutosave;
      const saveNow = async ({ commitAddress = false, address, geo, addressWriteToken } = {}) => {
        cancelClientAutosaveTimer();
        markDirty();
        await autosaveClient(
          uid,
          getPayload({ commitAddress, address, geo, addressWriteToken }),
        );
      };
      saveNowRef = saveNow;
      addressClearActions.fn = () => {
        cancelClientAutosaveTimer();
        cancelClientAddressBlurSave();
        clientAddressCommitGen += 1;
        clientPendingGeo = null;
        clientMapController?.setLocation(null, null, '');
        void saveNowRef({
          commitAddress: true,
          address: '',
          geo: null,
          addressWriteToken: nextClientAddressWriteToken(),
        });
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
          if (el === addressInput) {
            if (!addressInput.dataset.autocompletePick) {
              clientPendingGeo = null;
              if (!addressInput.value.trim()) {
                clientMapController?.setLocation(null, null, '');
              }
            }
            // Typing / post-pick synthetic input: do not debounce-save address.
            // Persist on autocomplete pick, blur, clear button, or editor flush.
            markDirty();
            return;
          }
          queueAutosave();
        });
        el.addEventListener('blur', () => {
          clientActiveField = el;
          void (async () => {
            if (el === addressInput) {
              // iOS (and some desktop cases) fire blur *before* the dropdown
              // option's pointerdown/click. Defer so pick can claim commitGen
              // and write the selected label instead of the typed query.
              cancelClientAddressBlurSave();
              const blurGen = clientAddressCommitGen;
              const typedSnapshot = addressInput.value.trim();
              clientAddressBlurTimer = setTimeout(() => {
                clientAddressBlurTimer = null;
                void (async () => {
                  if (blurGen !== clientAddressCommitGen) return;
                  if (addressInput.dataset.autocompletePick) return;
                  // Prefer the live field value (pick may have replaced typed text
                  // even if commitGen wasn't bumped yet in an older path).
                  const value = addressInput.value.trim() || typedSnapshot;
                  if (value) {
                    const geo = await geocodeClientAddressPreview(value);
                    if (blurGen !== clientAddressCommitGen) return;
                    if (geo) {
                      clientPendingGeo = geo;
                      clientMapController?.setLocation(geo.lat, geo.lng, value);
                    }
                  }
                  if (blurGen !== clientAddressCommitGen) return;
                  if (addressInput.dataset.autocompletePick) return;
                  await saveNow({
                    commitAddress: true,
                    address: addressInput.value.trim() || typedSnapshot,
                    addressWriteToken: nextClientAddressWriteToken(),
                  });
                })();
              }, 350);
              return;
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

function clientBackLabel() {
  if (clientState.returnToWorkSlug) return 'Back to project';
  if (clientState.returnToScheduleUid) return 'Back to schedule';
  return 'Back to contacts';
}

async function closeClientEditor(checkDirty = true) {
  await flushClientAutosave();
  if (checkDirty && clientState.dirty && !(await confirmDiscardChanges())) return;
  const returnWorkSlug = clientState.returnToWorkSlug;
  const returnScheduleUid = clientState.returnToScheduleUid;
  clientState.activeUid = null;
  clientState.detailTab = 'profile';
  clientState.draft = null;
  clientState.autosaveGetPayload = null;
  clientState.returnToWorkSlug = null;
  clientState.returnToScheduleUid = null;
  clearClientLastActiveUid();
  syncClientDeepLinkUrl(null);
  // Navigate to the referrer first so a failed hop cannot leave mobile on the
  // list view after de-pane-active was already cleared.
  if (returnWorkSlug) {
    navigateToWork(returnWorkSlug);
    return;
  }
  if (returnScheduleUid) {
    shell.setActiveMap('schedule', { force: true, scheduleUid: returnScheduleUid });
    return;
  }
  getClientsEditor()?.classList.remove('de-pane-active');
  syncClientsListActiveState();
  renderClientsPane();
}

async function openClient(uid, opts = {}) {
  if (uid === clientState.activeUid) {
    let returnChanged = false;
    if (opts.fromWorkSlug) {
      clientState.returnToWorkSlug = opts.fromWorkSlug;
      clientState.returnToScheduleUid = null;
      returnChanged = true;
    } else if (opts.fromScheduleUid) {
      clientState.returnToScheduleUid = opts.fromScheduleUid;
      clientState.returnToWorkSlug = null;
      returnChanged = true;
    }
    syncClientsListActiveState({ scroll: true });
    ensureClientMobilePaneOpen();
    if (returnChanged) renderClientsPane();
    return;
  }
  await flushClientAutosave();
  if (clientState.dirty && clientState.activeUid && !(await confirmDiscardChanges())) return;
  if (opts.fromWorkSlug) {
    clientState.returnToWorkSlug = opts.fromWorkSlug;
    clientState.returnToScheduleUid = null;
  } else if (opts.fromScheduleUid) {
    clientState.returnToScheduleUid = opts.fromScheduleUid;
    clientState.returnToWorkSlug = null;
  } else if (!opts.keepReturnSlug) {
    clientState.returnToWorkSlug = null;
    clientState.returnToScheduleUid = null;
  }
  clientState.activeUid = uid;
  if (opts.detailTab) {
    clientState.detailTab = normalizeClientDetailTab(opts.detailTab) || 'profile';
  } else if (!opts.keepDetailTab) {
    const urlUid = parseClientDeepLinkFromUrl();
    const urlTab = parseClientDetailTabFromUrl();
    clientState.detailTab = urlUid === uid && urlTab ? urlTab : 'profile';
  }
  clientState.dirty = false;
  clientState.autosaveGetPayload = null;
  rememberClientActiveUid(uid);
  syncClientDeepLinkUrl(uid);
  syncClientsListActiveState({ scroll: true });
  renderClientsPane();
  ensureClientMobilePaneOpen();
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
    await loadClientsTab({ clientUid: uid });
    getClientsEditor()?.classList.add('de-pane-active');
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
  if (avatarWrap) {
    avatarWrap.innerHTML = clientListAvatarHtml(c);
    mountClientListAvatar(avatarWrap);
  }
}

function scheduleClientAutosave(uid, getPayload) {
  cancelClientAutosaveTimer();
  clientAutosaveTimer = setTimeout(async () => {
    clientAutosaveTimer = null;
    await autosaveClient(uid, getPayload());
  }, 650);
}

async function flushClientAutosave() {
  await flushClientVaultSave();
  cancelClientAutosaveTimer();
  cancelClientAddressBlurSave();
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
  const wasKind = normalizeClientKind(draft.kind);
  const addressInPayload = Object.prototype.hasOwnProperty.call(payload, 'address');
  const websiteInPayload = Object.prototype.hasOwnProperty.call(payload, 'website');
  const geoUnchanged = !addressInPayload
    ? true
    : payload.geo === null
      ? !draft.geo
      : payload.geo == null || clientGeoMatches(payload.geo, draft.geo ?? null);
  const unchanged =
    payload.name === draft.name &&
    payload.email === draft.email &&
    payload.phone === draft.phone &&
    payload.company === draft.company &&
    (!websiteInPayload || payload.website === draft.website) &&
    (!addressInPayload || payload.address === draft.address) &&
    payload.notes === draft.notes &&
    normalizeClientKind(payload.kind) === wasKind &&
    geoUnchanged;
  if (unchanged) {
    clientState.dirty = false;
    return true;
  }
  if (!isValidClientEmail(payload.email) || !isValidClientPhone(payload.phone)) {
    refreshAllClientFields();
    return false;
  }
  const seq = ++clientAutosaveSeq;
  if (clientAutosaveAbort) clientAutosaveAbort.abort();
  clientAutosaveAbort = new AbortController();
  const { signal } = clientAutosaveAbort;
  if (clientActiveField) shell.setFormFieldState(clientActiveField, 'saving');
  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    const data = await res.json();
    if (seq !== clientAutosaveSeq) return false;
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const nameParts = splitClientNameParts({
      name: payload.name,
      company: payload.company,
      firstName: data.firstName,
      lastName: data.lastName,
    });
    const nextAddress = addressInPayload
      ? (data.address ?? payload.address)
      : draft.address;
    const nextGeo = !addressInPayload
      ? draft.geo
      : payload.address
        ? (data.geo ?? clientPendingGeo ?? clientState.draft.geo)
        : (data.geo ?? null);
    if (addressInPayload) {
      const returnedToken = Number(data.addressWriteToken);
      if (Number.isFinite(returnedToken)) {
        clientAddressWriteToken = Math.max(clientAddressWriteToken, returnedToken);
      } else if (typeof payload.addressWriteToken === 'number') {
        clientAddressWriteToken = Math.max(clientAddressWriteToken, payload.addressWriteToken);
      }
    }
    Object.assign(clientState.draft, {
      name: payload.name,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: payload.email,
      phone: payload.phone,
      company: payload.company,
      website: websiteInPayload ? payload.website : draft.website,
      address: nextAddress,
      addressWriteToken: clientAddressWriteToken,
      geo: nextGeo,
      notes: payload.notes,
      kind: normalizeClientKind(payload.kind),
      personal: normalizeClientKind(payload.kind) === 'personal',
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
    if (addressInPayload) clientPendingGeo = null;
    if (clientMapController && addressInPayload) {
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
      c.kind = normalizeClientKind(payload.kind);
      c.personal = c.kind === 'personal';
      c.logoUrl = clientState.draft.logoUrl || c.logoUrl || '';
      c.iconUrl = clientState.draft.iconUrl || c.iconUrl || '';
    }
    syncClientListRow(uid);
    if (wasKind !== normalizeClientKind(payload.kind)) {
      refreshClientsSidebarList();
      const root = getClientsEditor();
      const tabs = root?.querySelector('.em-filter-tabs');
      if (tabs) tabs.replaceWith(renderClientFilterTabs(tabs.scrollLeft));
      const nextKind = normalizeClientKind(payload.kind);
      if (contactShowsClientBusinessTabs(wasKind) !== contactShowsClientBusinessTabs(nextKind)) {
        if (
          !contactShowsClientBusinessTabs(nextKind) &&
          (clientState.detailTab === 'branding' || clientState.detailTab === 'analytics')
        ) {
          setClientDetailTab('profile');
        }
        const pane = root?.querySelector('.de-pane');
        if (pane && clientState.activeUid === uid) renderEditClientForm(pane);
      }
    }
    if (clientActiveField) shell.flashFormFieldSaved(clientActiveField);
    return true;
  } catch (e) {
    if (e?.name === 'AbortError') return false;
    if (seq !== clientAutosaveSeq) return false;
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
    await loadClientsTab({ clientUid: uid });
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  }
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

async function bulkDeleteClients(uids) {
  if (!uids.length) return;
  closeOpenSwipeRow();
  const uidSet = new Set(uids);
  for (const uid of uids) {
    try {
      const { res } = await performClientDelete(uid, true);
      if (!res.ok) continue;
    } catch {
      /* continue */
    }
  }
  if (clientState.activeUid && uidSet.has(clientState.activeUid)) {
    clearClientLastActiveUid();
    syncClientDeepLinkUrl(null);
    clientState.activeUid = null;
    clientState.dirty = false;
    clientState.draft = null;
  }
  await loadClientsTab();
}

async function deleteClient(uid) {
  closeOpenSwipeRow();
  try {
    const { res, data } = await performClientDelete(uid, true);
    if (!res.ok) throw new Error(data.error || data.warning || `HTTP ${res.status}`);

    clearClientLastActiveUid();
    syncClientDeepLinkUrl(null);
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
  const isActive = c.uid === clientState.activeUid;
  item.className = 'ch-list-item' + (isActive ? ' active' : '');
  item.dataset.id = c.uid;
  if (isActive) item.setAttribute('aria-current', 'page');
  item.innerHTML =
    `<span class="ch-list-content ch-list-content--client">` +
    `<span class="ch-item-row ch-item-row--client">` +
    `<span class="cl-list-avatar-wrap">${clientListAvatarHtml(c)}</span>` +
    `<span class="ch-item-copy">` +
    `<span class="ch-item-title">${escHtml(clientListTitle(c))}</span>` +
    `<span class="wk-meta-row">` +
    `<span class="wk-contact">${escHtml(clientListSubline(c))}</span>` +
    (clientKindTagHtml(c) || '') +
    (c.archived ? '<span class="cl-archived">Archived</span>' : '') +
    `</span></span></span></span>`;
  item.addEventListener('click', () => openClient(c.uid));
  mountClientListAvatar(item);
  return item;
}

function buildClientAgentPrompt(client, uid) {
  const label = clientDisplayLabel(client);
  const lines = [`Contact: ${label}`, `UID: ${uid}`];
  const person = joinClientFullName(client.firstName, client.lastName, '');
  if (person && person !== label) lines.push(`Name: ${person}`);
  if (client.company?.trim()) lines.push(`Company: ${client.company.trim()}`);
  if (client.email?.trim()) lines.push(`Email: ${client.email.trim()}`);
  if (client.phone?.trim()) lines.push(`Phone: ${client.phone.trim()}`);
  if (client.website?.trim()) lines.push(`Website: ${client.website.trim()}`);
  if (client.address?.trim()) lines.push(`Address: ${client.address.trim()}`);
  const kind = clientKindFromRecord(client);
  lines.push(`Type: ${CLIENT_KIND_LABELS[kind] || kind}`);
  const portal = client.portal_url?.trim();
  if (portal) lines.push(`Portal: ${portal}`);
  const notes = String(client.notes || '').trim();
  if (notes) {
    const excerpt = notes.length > 500 ? `${notes.slice(0, 500)}…` : notes;
    lines.push('', excerpt);
  }
  lines.push('', 'Please wait for instructions on how to deal with this client.');
  return lines.join('\n');
}

async function fetchClientRecordForAgent(uid) {
  const res = await adminFetch(`/api/clients/${encodeURIComponent(uid)}`, { cache: 'no-store' });
  const data = await readApiJson(res);
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  const contact = data.contact || {};
  const body = data.data || data;
  const { firstName, lastName } = splitClientNameParts(contact);
  return {
    name: contact.name || '',
    firstName,
    lastName,
    email: contact.email || '',
    phone: contact.phone || '',
    company: resolveClientCompany(contact, firstName, lastName),
    website: body.website || contact.website || '',
    address: body.address || '',
    notes: contact.notes || '',
    kind: clientKindFromRecord({ kind: body.kind, personal: body.personal ?? contact.personal }),
    portal_url: contact.portal_url ?? body.portal_url,
  };
}

async function askAgentAboutClient(uid) {
  try {
    const client =
      uid === clientState.activeUid && clientState.draft
        ? clientState.draft
        : await fetchClientRecordForAgent(uid);
    await shell.askAgentWithPrompt(buildClientAgentPrompt(client, uid));
  } catch (e) {
    shell.osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

function createClientSwipeRow(c) {
  return createSwipeRow(createClientListItem(c), [
    swipeAgentAction(() => askAgentAboutClient(c.uid)),
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

function navigateToClient(uid, opts = {}) {
  if (!uid) return;
  if (opts.fromWorkSlug) {
    clientState.returnToWorkSlug = opts.fromWorkSlug;
    clientState.returnToScheduleUid = null;
  } else if (opts.fromScheduleUid) {
    clientState.returnToScheduleUid = opts.fromScheduleUid;
    clientState.returnToWorkSlug = null;
  } else {
    clientState.returnToWorkSlug = null;
    clientState.returnToScheduleUid = null;
  }
  if (opts.detailTab) {
    clientState.detailTab = normalizeClientDetailTab(opts.detailTab) || 'profile';
  } else if (uid !== clientState.activeUid) {
    clientState.detailTab = 'profile';
  }
  pendingClientDeepLinkUid = uid;
  shell.setActiveMap('clients', { force: true, clientUid: uid });
}

async function resumeClientDetailFromUrl() {
  const clientUid = parseClientDeepLinkFromUrl();
  if (!clientUid) return;
  if (clientState.activeUid === clientUid) {
    ensureClientMobilePaneOpen();
    return;
  }
  if (clientState.clients.some((c) => c.uid === clientUid)) {
    await openClient(clientUid, { keepReturnSlug: true, keepDetailTab: true });
    return;
  }
  pendingClientDeepLinkUid = clientUid;
}

export {
  clientState,
  loadClientsTab,
  navigateToClient,
  navigateToNewClient,
  resumeClientDetailFromUrl,
  createClientListItem,
  createClientSwipeRow,
  askAgentAboutClient,
  parseClientDeepLinkFromUrl,
  formatPhoneInput,
  geocodeClientAddressPreview,
  startNewClient,
  confirmDiscardChanges,
  clientMapController,
};
