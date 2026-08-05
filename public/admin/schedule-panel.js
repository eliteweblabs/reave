/**
 * schedule panel — extracted from os-map-loader.js
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
} from './admin-ui.js?v=20260805a';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText } from './shared.js?v=20260728m';
import {
  registerOsDialogDropdownRepositioner,
  scheduleOsDialogFieldFocus,
  openOsDialogBackdrop,
  closeOsDialogBackdrop,
  bindOsDialogDismiss,
  bindOsDialogKeyboardLayout,
  releaseOsDialogKeyboardLayout,
} from './os-dialog.js?v=20260728j';
import { navigateToWork, workClientSubline } from './work-panel.js?v=20260805h';
import { navigateToClient } from './clients-panel.js?v=20260728p';
import { openReaveShareSheet } from './chat-panel.js?v=20260730c';

/** Injected by os-map-loader via initSchedulePanel(). */
let shell = {};

export function initSchedulePanel(deps) {
  shell = deps;
}

// ---- extracted from os-map-loader.js:11070-13088 ----
// ---- schedule tab ----

let scheduleState = {
  bookings: [],
  view: 'month',
  focusDate: null,
  selectedDate: null,
  selectedSlot: null,
  activeUid: null,
  meta: {
    bookingFormUrl: '/form/schedule',
    publicBookingUrl: null,
    calcomAdminUrl: null,
  },
  loading: false,
  error: '',
};

const SCHEDULE_VIEWS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

const CAL_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CAL_HOUR_PX = 72;
const CAL_HOURS = 24;

function getSchedulePanel() { return document.getElementById('schedule-panel'); }

function scheduleDateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function scheduleTodayKey() {
  return scheduleDateKey(new Date());
}

function scheduleParseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function scheduleAddDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function scheduleStartOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function scheduleBookingDateKey(iso) {
  if (!iso) return '';
  return scheduleDateKey(new Date(iso));
}

function scheduleBookingsForDay(key) {
  return scheduleState.bookings
    .filter((b) => scheduleBookingDateKey(b.startTime) === key)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function scheduleVisibleRange(view, focusKey) {
  const focus = scheduleParseDateKey(focusKey);
  if (view === 'month') {
    const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
    const gridStart = scheduleStartOfWeek(first);
    const gridEnd = scheduleAddDays(gridStart, 41);
    return { from: scheduleDateKey(gridStart), to: scheduleDateKey(gridEnd) };
  }
  if (view === 'week') {
    const ws = scheduleStartOfWeek(focus);
    const we = scheduleAddDays(ws, 6);
    return { from: scheduleDateKey(ws), to: scheduleDateKey(we) };
  }
  return { from: focusKey, to: focusKey };
}

function scheduleEnsureFocusDate() {
  if (!scheduleState.focusDate) scheduleState.focusDate = scheduleTodayKey();
  if (!scheduleState.selectedDate) scheduleState.selectedDate = scheduleState.focusDate;
}

function scheduleToolbarTitle(view, focusKey) {
  const d = scheduleParseDateKey(focusKey);
  if (view === 'month') {
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (view === 'week') {
    const start = scheduleStartOfWeek(d);
    const end = scheduleAddDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    const startFmt = start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    const endFmt = end.toLocaleDateString(undefined, {
      month: sameMonth ? undefined : 'short',
      day: 'numeric',
      year: start.getFullYear() === end.getFullYear() ? undefined : 'numeric',
    });
    return `${startFmt} – ${endFmt}`;
  }
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function scheduleDateInSameMonth(dateKey, focusKey) {
  const d = scheduleParseDateKey(dateKey);
  const f = scheduleParseDateKey(focusKey);
  return d.getFullYear() === f.getFullYear() && d.getMonth() === f.getMonth();
}

/** Day to show in month-view agenda: explicit selection in this month, else today if visible. */
function scheduleMonthDisplayDate(focusKey) {
  if (
    scheduleState.selectedDate &&
    scheduleDateInSameMonth(scheduleState.selectedDate, focusKey)
  ) {
    return scheduleState.selectedDate;
  }
  const today = scheduleTodayKey();
  if (scheduleDateInSameMonth(today, focusKey)) return today;
  return null;
}

function scheduleShiftFocus(delta) {
  scheduleEnsureFocusDate();
  const d = scheduleParseDateKey(scheduleState.focusDate);
  if (scheduleState.view === 'month') {
    d.setMonth(d.getMonth() + delta);
  } else if (scheduleState.view === 'week') {
    d.setDate(d.getDate() + delta * 7);
  } else {
    d.setDate(d.getDate() + delta);
  }
  scheduleState.focusDate = scheduleDateKey(d);
  if (scheduleState.view !== 'month') {
    scheduleState.selectedDate = scheduleState.focusDate;
  }
  loadScheduleTab();
}

function openScheduleTab(opts = {}) {
  if (opts.uid) scheduleState.activeUid = opts.uid;
  if (opts.view) scheduleState.view = opts.view;
  if (opts.date) {
    scheduleState.focusDate = opts.date;
    scheduleState.selectedDate = opts.date;
  }
  shell.setActiveMap('schedule', { force: true, scheduleUid: opts.uid || null });
}

function formatScheduleWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function formatScheduleListWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function formatScheduleRange(startIso, endIso, opts) {
  if (!startIso) return '';
  const compact = !!(opts && opts.compact);
  try {
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : null;
    const datePart = start.toLocaleString(
      undefined,
      compact
        ? { weekday: 'short', month: 'short', day: 'numeric' }
        : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
    );
    const timeFmt = { hour: 'numeric', minute: '2-digit' };
    const startTime = start.toLocaleTimeString(undefined, timeFmt);
    const endTime = end ? end.toLocaleTimeString(undefined, timeFmt) : '';
    return endTime ? `${datePart} · ${startTime} – ${endTime}` : `${datePart} · ${startTime}`;
  } catch {
    return formatScheduleWhen(startIso);
  }
}

function scheduleStatusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'accepted') return 'sched-status-accepted';
  if (s === 'cancelled' || s === 'rejected') return 'sched-status-cancelled';
  if (s === 'pending') return 'sched-status-pending';
  return '';
}

function scheduleBookingWho(b) {
  return b.attendee && b.attendee !== 'Unknown' ? b.attendee : b.email || 'Guest';
}

/**
 * Bookings only carry a single Cal.com attendee (name/email). Additional
 * guests are cosmetic-only: we stash them as a hidden JSON marker at the end
 * of the booking's notes/description so they survive a reload, without
 * actually inviting them via Cal.com. Never render the raw marker to users —
 * always go through scheduleParseExtraGuests() to get the clean notes text.
 */
const SCHED_EXTRA_GUESTS_RE = /\n*<!--extra-guests:(.*?)-->\s*$/s;

function scheduleParseExtraGuests(description) {
  const raw = String(description || '');
  const m = raw.match(SCHED_EXTRA_GUESTS_RE);
  if (!m) return { cleanNotes: raw.trim(), extraGuests: [] };
  let extraGuests = [];
  try {
    const parsed = JSON.parse(m[1]);
    if (Array.isArray(parsed)) extraGuests = parsed.filter((g) => g && (g.name || g.email));
  } catch {
    extraGuests = [];
  }
  return { cleanNotes: raw.slice(0, m.index).trim(), extraGuests };
}

function scheduleSerializeNotesWithGuests(cleanNotes, extraGuests) {
  const base = String(cleanNotes || '').trim();
  if (!extraGuests?.length) return base;
  const marker = `<!--extra-guests:${JSON.stringify(extraGuests)}-->`;
  return base ? `${base}\n\n${marker}` : marker;
}

function scheduleBookingWhoLabel(booking) {
  const primary = scheduleBookingWho(booking);
  const { extraGuests } = scheduleParseExtraGuests(booking.description);
  return extraGuests.length ? `${primary} +${extraGuests.length}` : primary;
}

/**
 * Persists an existing booking's guest list. There's no dedicated "update
 * notes" endpoint on the booking microservice, so this piggybacks on the
 * reschedule endpoint with the booking's own start time (i.e. a no-op time
 * change) just to push updated notes through. NOTE: depending on how the
 * upstream Cal.com booking works, this *could* trigger a "rescheduled"
 * notification to the primary attendee even though the time didn't change.
 */
async function scheduleSaveBookingGuests(booking, cleanNotes, extraGuests) {
  const notes = scheduleSerializeNotesWithGuests(cleanNotes, extraGuests);
  const res = await fetch(`/api/bookings/${encodeURIComponent(booking.uid)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: booking.startTime,
      ...(booking.location ? { address: booking.location } : {}),
      notes,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  const updatedDescription = data.booking?.description ?? notes;
  booking.description = updatedDescription;
  const cached = scheduleState.bookings.find((b) => b.uid === booking.uid);
  if (cached) cached.description = updatedDescription;
  return updatedDescription;
}

const schedClientResolveCache = new Map();

function schedulePickResolvedClient(data) {
  if ((data.match === 'exact' || data.match === 'likely') && data.contact?.uid) {
    return { uid: data.contact.uid, name: data.contact.name || '' };
  }
  if (data.match === 'possible' && Array.isArray(data.candidates) && data.candidates.length === 1) {
    const candidate = data.candidates[0];
    if (candidate?.uid && (candidate.score ?? 0) >= 0.85) {
      return { uid: candidate.uid, name: candidate.name || '' };
    }
  }
  return null;
}

async function scheduleResolveClientRequest(body) {
  const res = await fetch('/api/clients/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) return null;
  return schedulePickResolvedClient(data);
}

/** Resolve a booking guest to a client profile (email first, then name). */
async function scheduleResolveClientForGuest(guest) {
  const email = String(guest?.email || '').trim().toLowerCase();
  const name = String(guest?.name || '').trim();
  const cacheKey = email ? `e:${email}` : name ? `n:${name.toLowerCase()}` : '';
  if (!cacheKey) return null;
  if (schedClientResolveCache.has(cacheKey)) return schedClientResolveCache.get(cacheKey);
  const promise = (async () => {
    try {
      const combined = {};
      if (email) combined.email = email;
      if (name) combined.name = name;
      const match = await scheduleResolveClientRequest(combined);
      if (match) return match;
      if (email && name) return scheduleResolveClientRequest({ name });
      return null;
    } catch {
      return null;
    }
  })();
  schedClientResolveCache.set(cacheKey, promise);
  return promise;
}

/** Renders guest name chips into `container`; each chip upgrades into a profile link once resolved. */
function renderScheduleGuestChips(container, guests, opts = {}) {
  const { removable = false, onRemove } = opts;
  container.innerHTML = '';
  guests.forEach((guest, idx) => {
    const chip = document.createElement('span');
    chip.className = 'schedule-guest-chip';

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'schedule-guest-chip-name';
    label.textContent = guest.name || guest.email || 'Guest';
    chip.appendChild(label);

    if (guest.email || guest.name) {
      scheduleResolveClientForGuest(guest).then((match) => {
        if (!match || !chip.isConnected) return;
        label.title = 'View profile';
        label.classList.add('schedule-guest-chip-name--linked');
        label.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          navigateToClient(match.uid, { fromScheduleUid: scheduleState.activeUid });
        });
      });
    }

    const canRemove = typeof removable === 'function' ? removable(idx) : removable;
    if (canRemove) {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'schedule-guest-chip-remove';
      rm.setAttribute('aria-label', `Remove ${guest.name || guest.email || 'guest'}`);
      rm.textContent = '\u00d7';
      rm.addEventListener('click', (e) => {
        e.stopPropagation();
        onRemove?.(idx);
      });
      chip.appendChild(rm);
    }

    container.appendChild(chip);
  });
}

/** Small "+ Add guest" toggle that reveals a name/email mini-form; calls onAdd({name,email}). */
function mountScheduleGuestAdder(container, { onAdd } = {}) {
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'schedule-guest-add-btn';
  toggleBtn.textContent = '+ Add guest';

  const form = document.createElement('div');
  form.className = 'schedule-guest-adder';
  form.hidden = true;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Name';
  nameInput.className = 'schedule-guest-adder-input';
  nameInput.autocomplete = 'off';

  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.placeholder = 'Email (optional)';
  emailInput.className = 'schedule-guest-adder-input';
  emailInput.autocomplete = 'off';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'schedule-guest-adder-add';
  addBtn.textContent = 'Add';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'schedule-guest-adder-cancel';
  cancelBtn.setAttribute('aria-label', 'Cancel add guest');
  cancelBtn.textContent = '\u00d7';

  form.append(nameInput, emailInput, addBtn, cancelBtn);
  container.append(toggleBtn, form);

  function reset() {
    nameInput.value = '';
    emailInput.value = '';
    form.hidden = true;
    toggleBtn.hidden = false;
  }

  toggleBtn.addEventListener('click', () => {
    toggleBtn.hidden = true;
    form.hidden = false;
    nameInput.focus();
  });
  cancelBtn.addEventListener('click', reset);
  const submit = () => {
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    if (!name && !email) {
      nameInput.focus();
      return;
    }
    onAdd?.({ name: name || email, email: email || undefined });
    reset();
  };
  addBtn.addEventListener('click', submit);
  for (const input of [nameInput, emailInput]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        reset();
      }
    });
  }

  return {
    destroy: () => {
      toggleBtn.remove();
      form.remove();
    },
  };
}

function findScheduleBooking(uid) {
  return scheduleState.bookings.find((b) => b.uid === uid) || null;
}

function scheduleSortedBookings() {
  return [...scheduleState.bookings].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function scheduleAdjacentBooking(uid, delta) {
  const sorted = scheduleSortedBookings();
  const idx = sorted.findIndex((b) => b.uid === uid);
  if (idx < 0) return null;
  return sorted[idx + delta] || null;
}

function navigateScheduleBooking(delta) {
  const uid = scheduleState.activeUid;
  if (!uid) return;
  const next = scheduleAdjacentBooking(uid, delta);
  if (!next) return;
  scheduleState.activeUid = next.uid;
  scheduleState.selectedDate = scheduleBookingDateKey(next.startTime);
  scheduleState.focusDate = scheduleState.selectedDate;
  renderSchedulePanel();
  shell.syncFooterNav();
}

async function loadScheduleTab() {
  const root = getSchedulePanel();
  if (!root) return;
  scheduleEnsureFocusDate();
  scheduleState.loading = true;
  scheduleState.error = '';
  renderSchedulePanel();

  try {
    const range = scheduleVisibleRange(scheduleState.view, scheduleState.focusDate);
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    const res = await adminFetch(`/api/bookings?${qs.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    scheduleState.bookings = Array.isArray(data.bookings) ? data.bookings : [];
    if (data.meta && typeof data.meta === 'object') {
      scheduleState.meta = { ...scheduleState.meta, ...data.meta };
    }
    if (
      scheduleState.activeUid &&
      !findScheduleBooking(scheduleState.activeUid)
    ) {
      const oneRes = await adminFetch(
        `/api/bookings/${encodeURIComponent(scheduleState.activeUid)}`,
      );
      const oneData = await oneRes.json();
      if (oneRes.ok && oneData.booking) {
        scheduleState.bookings = [oneData.booking, ...scheduleState.bookings];
        scheduleState.selectedDate = scheduleBookingDateKey(oneData.booking.startTime);
        scheduleState.focusDate = scheduleState.selectedDate;
      }
    }
  } catch (e) {
    scheduleState.error = e.message || String(e);
    scheduleState.bookings = [];
  } finally {
    scheduleState.loading = false;
    renderSchedulePanel();
  }
}

function selectScheduleBooking(uid) {
  scheduleState.activeUid = uid;
  scheduleState.selectedSlot = null;
  getSchedulePanel()?.classList.add('de-pane-active');
  renderSchedulePanel();
  shell.syncFooterNav();
}

function closeScheduleDetail() {
  scheduleState.activeUid = null;
  getSchedulePanel()?.classList.remove('de-pane-active');
  renderSchedulePanel();
  shell.syncFooterNav();
}

async function cancelScheduleBooking(uid) {
  const res = await fetch(`/api/bookings/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancellationReason: 'Cancelled by user' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    await shell.osAlert({ title: 'Could not cancel', bodyHtml: escHtml(data.error || `HTTP ${res.status}`) });
    return;
  }
  scheduleState.activeUid = null;
  getSchedulePanel()?.classList.remove('de-pane-active');
  await loadScheduleTab();
  shell.syncFooterNav();
}

function scheduleStartFromParts(dateKey, hour = 9, minute = 0) {
  const d = scheduleParseDateKey(dateKey);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function scheduleSnapMinute(minute) {
  return Math.min(45, Math.max(0, Math.round(minute / 15) * 15));
}

function scheduleTimeFromClickY(clientY, colTop) {
  const y = Math.max(0, clientY - colTop);
  const totalMin = (y / (CAL_HOURS * CAL_HOUR_PX)) * CAL_HOURS * 60;
  const hour = Math.min(CAL_HOURS - 1, Math.floor(totalMin / 60));
  const minute = scheduleSnapMinute(totalMin % 60);
  return { hour, minute };
}

function scheduleDateInputValue(dateKey) {
  return dateKey;
}

function scheduleTimeInputValue(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

async function submitScheduleCreate(payload) {
  const res = await adminFetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    if (data.check) err.check = data.check;
    throw err;
  }
  return data;
}

let schedGuestSearchTimer = null;
let schedAddressSearchTimer = null;
const SCHED_LAST_ADDRESS_KEY = 'sched:lastAddress';

function readScheduleLastAddress() {
  try {
    return localStorage.getItem(SCHED_LAST_ADDRESS_KEY) || '';
  } catch {
    return '';
  }
}

function rememberScheduleAddress(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(SCHED_LAST_ADDRESS_KEY, trimmed);
  } catch {
    /* ignore quota / private mode */
  }
}

function isScheduleAddressError(message) {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('address') &&
    (m.includes('geocod') || m.includes('required') || m.includes('missing'))
  );
}

/** Collect a geocodable street address before creating a booking. */
function ensureScheduleAddress({ initial = '', forcePrompt = false } = {}) {
  if (!forcePrompt) {
    const preset = String(initial || readScheduleLastAddress() || '').trim();
    if (preset) return Promise.resolve(preset);
  }

  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    let destroyAddressAutocomplete = () => {};
    const finish = (value) => {
      if (settled) return;
      settled = true;
      destroyAddressAutocomplete();
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') finish(null);
    };

    titleEl.textContent = 'Meeting address';
    bodyEl.innerHTML =
      '<p class="em-book-dialog-lead">Enter the project site or meeting location so the booking can be placed on the map.</p>' +
      '<label class="de-label sched-create-field em-book-address-field">' +
        '<span>Address</span>' +
        '<div class="control-field">' +
          '<input id="em-book-address" type="text" autocomplete="street-address" autocapitalize="words" placeholder="Business or street address" required>' +
        '</div>' +
      '</label>';
    actionsEl.innerHTML = '';
    const addressInput = bodyEl.querySelector('#em-book-address');

    const mkBtn = (label, cls, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      actionsEl.appendChild(btn);
      return btn;
    };

    mkBtn('Cancel', 'os-dialog-btn--ghost', () => finish(null));
    mkBtn('Continue', 'os-dialog-btn--primary', () => {
      const address = addressInput?.value.trim() || '';
      if (!address) {
        addressInput?.focus();
        return;
      }
      finish(address);
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, () => finish(null), true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    destroyAddressAutocomplete = mountScheduleAddressAutocomplete(addressInput);
    scheduleOsDialogFieldFocus(addressInput);
  });
}

function formatScheduleAddressLabel(text) {
  return String(text || '').replace(/, USA$/i, '').trim();
}

function mountScheduleAddressAutocomplete(addressInput) {
  const portal = document.getElementById('os-dialog-backdrop');
  return mountAddressAutocomplete(addressInput, portal);
}

// Shared arrow-key navigation for autosuggest dropdowns. The active option is
// tracked purely via the `.active` class in the DOM so it self-heals when the
// dropdown re-renders on each new search.
function attachAutosuggestKeyboardNav(input, dropdown, options = {}) {
  if (!input || !dropdown) return () => {};
  const optionSelector = options.optionSelector || 'button';
  const onClose = typeof options.onClose === 'function' ? options.onClose : null;

  function isOpen() {
    return dropdown.style.display !== 'none' && dropdown.offsetParent !== null;
  }
  function getOptions() {
    return [...dropdown.querySelectorAll(optionSelector)].filter(
      (el) => !el.disabled && el.offsetParent !== null,
    );
  }
  function setActive(opts, idx) {
    opts.forEach((el, i) => el.classList.toggle('active', i === idx));
    if (idx >= 0) opts[idx]?.scrollIntoView({ block: 'nearest' });
  }
  const onKeyDown = (ev) => {
    if (!isOpen()) return;
    const opts = getOptions();
    if (!opts.length) return;
    const currentIdx = opts.findIndex((el) => el.classList.contains('active'));
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActive(opts, currentIdx < 0 ? 0 : (currentIdx + 1) % opts.length);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive(opts, currentIdx <= 0 ? opts.length - 1 : currentIdx - 1);
    } else if (ev.key === 'Enter') {
      if (currentIdx >= 0) {
        ev.preventDefault();
        opts[currentIdx].click();
      }
    } else if (ev.key === 'Escape') {
      if (onClose) {
        ev.preventDefault();
        onClose();
      }
    }
  };
  input.addEventListener('keydown', onKeyDown);
  return () => input.removeEventListener('keydown', onKeyDown);
}

const SCHED_DROPDOWN_MAX_HEIGHT = 220;

function getDropdownViewportBounds() {
  const vv = window.visualViewport;
  if (!vv) {
    return { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  }
  return {
    top: vv.offsetTop,
    bottom: vv.offsetTop + vv.height,
    left: vv.offsetLeft,
    right: vv.offsetLeft + vv.width,
  };
}

function positionFixedDropdown(dropdown, anchorInput, maxHeight = SCHED_DROPDOWN_MAX_HEIGHT) {
  const rect = anchorInput.getBoundingClientRect();
  const vp = getDropdownViewportBounds();
  const gap = 4;
  const minHeight = 80;

  dropdown.style.left = `${Math.max(vp.left, Math.min(rect.left, vp.right - rect.width))}px`;
  dropdown.style.width = `${rect.width}px`;

  const spaceBelow = vp.bottom - rect.bottom - gap;
  const spaceAbove = rect.top - vp.top - gap;

  if (spaceBelow >= minHeight || spaceBelow >= spaceAbove) {
    dropdown.style.top = `${rect.bottom + gap}px`;
    dropdown.style.bottom = '';
    dropdown.style.maxHeight = `${Math.min(maxHeight, Math.max(minHeight, spaceBelow))}px`;
  } else {
    const avail = Math.min(maxHeight, Math.max(minHeight, spaceAbove));
    dropdown.style.top = `${Math.max(vp.top + gap, rect.top - gap - avail)}px`;
    dropdown.style.bottom = '';
    dropdown.style.maxHeight = `${avail}px`;
  }
}

function collectDropdownScrollTargets(anchorInput) {
  const scrollTargets = new Set();
  let el = anchorInput.parentElement;
  while (el) {
    if (el === document.body || el === document.documentElement) break;
    const style = window.getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(style.overflowY) || /(auto|scroll|overlay)/.test(style.overflow)) {
      scrollTargets.add(el);
    }
    el = el.parentElement;
  }
  const dialogBody = document.getElementById('os-dialog-body');
  if (dialogBody?.contains(anchorInput)) scrollTargets.add(dialogBody);
  return scrollTargets;
}

function bindDropdownReposition(anchorInput, repositionFn) {
  const scrollTargets = collectDropdownScrollTargets(anchorInput);
  const handler = () => repositionFn();
  window.addEventListener('resize', handler);
  window.addEventListener('scroll', handler, true);
  window.visualViewport?.addEventListener('resize', handler);
  window.visualViewport?.addEventListener('scroll', handler);
  for (const target of scrollTargets) {
    target.addEventListener('scroll', handler, { passive: true });
  }

  let unregisterDialogReposition = null;
  const backdrop = document.getElementById('os-dialog-backdrop');
  if (backdrop?.contains(anchorInput)) {
    unregisterDialogReposition = registerOsDialogDropdownRepositioner(handler);
  }

  requestAnimationFrame(handler);
  window.setTimeout(handler, 120);
  window.setTimeout(handler, 360);

  return () => {
    window.removeEventListener('resize', handler);
    window.removeEventListener('scroll', handler, true);
    window.visualViewport?.removeEventListener('resize', handler);
    window.visualViewport?.removeEventListener('scroll', handler);
    for (const target of scrollTargets) {
      target.removeEventListener('scroll', handler);
    }
    unregisterDialogReposition?.();
  };
}

function mountAddressAutocomplete(addressInput, dropdownPortal, onPick) {
  if (!dropdownPortal || !addressInput) return () => {};

  const dropdown = document.createElement('div');
  dropdown.className = 'sched-guest-dropdown';
  dropdown.style.display = 'none';
  dropdownPortal.appendChild(dropdown);

  let unbindReposition = null;

  function positionDropdown() {
    positionFixedDropdown(dropdown, addressInput);
  }

  function setDropdownOpen(open) {
    if (open) {
      positionDropdown();
      dropdown.style.display = 'block';
      addressInput.setAttribute('aria-expanded', 'true');
      if (!unbindReposition) {
        unbindReposition = bindDropdownReposition(addressInput, positionDropdown);
      }
      return;
    }
    dropdown.style.display = 'none';
    addressInput.setAttribute('aria-expanded', 'false');
    if (unbindReposition) {
      unbindReposition();
      unbindReposition = null;
    }
  }

  async function pick(description) {
    addressInput.value = formatScheduleAddressLabel(description);
    setDropdownOpen(false);
    addressInput.dataset.autocompletePick = '1';
    try {
      if (typeof onPick === 'function') await onPick(addressInput.value);
    } finally {
      addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      delete addressInput.dataset.autocompletePick;
    }
  }

  function renderDropdown(predictions, query) {
    dropdown.innerHTML = '';
    if (!predictions.length) {
      const empty = document.createElement('div');
      empty.className = 'sched-guest-empty';
      empty.textContent = query.trim() ? 'No matching addresses.' : 'Type to search addresses.';
      dropdown.appendChild(empty);
      setDropdownOpen(true);
      return;
    }
    for (const p of predictions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sched-guest-option';
      btn.textContent = formatScheduleAddressLabel(p.description);
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', () => {
        void pick(p.description);
      });
      dropdown.appendChild(btn);
    }
    setDropdownOpen(true);
  }

  async function runSearch() {
    const q = addressInput.value.trim();
    if (q.length < 2) {
      setDropdownOpen(false);
      dropdown.innerHTML = '';
      return;
    }
    try {
      const params = new URLSearchParams({ input: q, types: 'address' });
      const res = await adminFetch(`/api/google/places-autocomplete?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.errorMessage || `HTTP ${res.status}`);
      renderDropdown(data.predictions || [], q);
    } catch (e) {
      if (e.message === 'Session expired') return;
      dropdown.innerHTML = `<div class="sched-guest-empty">${escHtml(e.message)}</div>`;
      setDropdownOpen(true);
    }
  }

  function scheduleSearch() {
    clearTimeout(schedAddressSearchTimer);
    const q = addressInput.value.trim();
    if (!q) {
      setDropdownOpen(false);
      dropdown.innerHTML = '';
      return;
    }
    schedAddressSearchTimer = setTimeout(runSearch, 300);
  }

  const onInput = () => {
    if (addressInput.dataset.autocompletePick) return;
    scheduleSearch();
  };
  const onBlur = () => {
    setTimeout(() => {
      if (!dropdown.contains(document.activeElement)) setDropdownOpen(false);
    }, 150);
  };

  addressInput.autocomplete = 'off';
  addressInput.setAttribute('role', 'combobox');
  addressInput.setAttribute('aria-autocomplete', 'list');
  addressInput.setAttribute('aria-expanded', 'false');
  addressInput.addEventListener('input', onInput);
  addressInput.addEventListener('blur', onBlur);
  const detachKeyNav = attachAutosuggestKeyboardNav(addressInput, dropdown, {
    optionSelector: '.sched-guest-option',
    onClose: () => setDropdownOpen(false),
  });

  return () => {
    clearTimeout(schedAddressSearchTimer);
    addressInput.removeEventListener('input', onInput);
    addressInput.removeEventListener('blur', onBlur);
    detachKeyNav();
    setDropdownOpen(false);
    dropdown.remove();
  };
}

function mountScheduleGuestAutocomplete(nameInput, emailInput) {
  const portal = document.getElementById('os-dialog-backdrop');
  if (!portal || !nameInput) return () => {};

  const dropdown = document.createElement('div');
  dropdown.className = 'sched-guest-dropdown';
  dropdown.style.display = 'none';
  portal.appendChild(dropdown);

  let unbindReposition = null;

  function positionDropdown() {
    positionFixedDropdown(dropdown, nameInput);
  }

  function setDropdownOpen(open) {
    if (open) {
      positionDropdown();
      dropdown.style.display = 'block';
      nameInput.setAttribute('aria-expanded', 'true');
      if (!unbindReposition) {
        unbindReposition = bindDropdownReposition(nameInput, positionDropdown);
      }
      return;
    }
    dropdown.style.display = 'none';
    nameInput.setAttribute('aria-expanded', 'false');
    if (unbindReposition) {
      unbindReposition();
      unbindReposition = null;
    }
  }

  function pick(client) {
    nameInput.value = client.name || '';
    if (emailInput && client.email) emailInput.value = client.email;
    setDropdownOpen(false);
  }

  function renderDropdown(clients, query) {
    dropdown.innerHTML = '';
    if (!clients.length) {
      const empty = document.createElement('div');
      empty.className = 'sched-guest-empty';
      empty.textContent = query.trim() ? 'No matching clients.' : 'No clients yet.';
      dropdown.appendChild(empty);
      setDropdownOpen(true);
      return;
    }
    for (const c of clients) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sched-guest-option';
      btn.innerHTML =
        `${escHtml(c.name || 'Client')}` +
        `<span class="sub">${escHtml(workClientSubline(c))}</span>`;
      btn.addEventListener('mousedown', (ev) => ev.preventDefault());
      btn.addEventListener('click', () => pick(c));
      dropdown.appendChild(btn);
    }
    setDropdownOpen(true);
  }

  async function runSearch() {
    const q = nameInput.value.trim();
    if (!q) {
      setDropdownOpen(false);
      dropdown.innerHTML = '';
      return;
    }
    try {
      const params = new URLSearchParams({ q, limit: '20' });
      const res = await adminFetch(`/api/clients?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      renderDropdown(data.clients || [], q);
    } catch (e) {
      if (e.message === 'Session expired') return;
      dropdown.innerHTML = `<div class="sched-guest-empty">${escHtml(e.message)}</div>`;
      setDropdownOpen(true);
    }
  }

  function scheduleSearch() {
    clearTimeout(schedGuestSearchTimer);
    const q = nameInput.value.trim();
    if (!q) {
      setDropdownOpen(false);
      dropdown.innerHTML = '';
      return;
    }
    schedGuestSearchTimer = setTimeout(runSearch, 250);
  }

  const onInput = () => scheduleSearch();
  const onBlur = () => {
    setTimeout(() => {
      if (!dropdown.contains(document.activeElement)) setDropdownOpen(false);
    }, 150);
  };

  nameInput.autocomplete = 'off';
  nameInput.setAttribute('role', 'combobox');
  nameInput.setAttribute('aria-autocomplete', 'list');
  nameInput.setAttribute('aria-expanded', 'false');
  nameInput.addEventListener('input', onInput);
  nameInput.addEventListener('blur', onBlur);
  const detachKeyNav = attachAutosuggestKeyboardNav(nameInput, dropdown, {
    optionSelector: '.sched-guest-option',
    onClose: () => setDropdownOpen(false),
  });

  return () => {
    clearTimeout(schedGuestSearchTimer);
    nameInput.removeEventListener('input', onInput);
    nameInput.removeEventListener('blur', onBlur);
    detachKeyNav();
    setDropdownOpen(false);
    dropdown.remove();
  };
}

function scheduleOpenCreateDialog() {
  scheduleEnsureFocusDate();
  const dateKey = scheduleState.selectedDate || scheduleState.focusDate;
  const slot = scheduleState.selectedSlot;
  const useSlot = slot && slot.dateKey === dateKey;
  void openScheduleCreateDialog({
    dateKey,
    hour: useSlot ? slot.hour : 9,
    minute: useSlot ? slot.minute : 0,
  });
}

function openScheduleCreateDialog(initial = {}) {
  const dateKey = initial.dateKey || scheduleState.selectedDate || scheduleTodayKey();
  const startDate = scheduleStartFromParts(
    dateKey,
    initial.hour ?? 9,
    initial.minute ?? 0,
  );

  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let destroyGuestAutocomplete = () => {};
    let destroyAddressAutocomplete = () => {};
    let destroyCreateGuestAdder = () => {};
    const finish = (value) => {
      if (settled) return;
      settled = true;
      destroyGuestAutocomplete();
      destroyAddressAutocomplete();
      destroyCreateGuestAdder();
      releaseOsDialogKeyboardLayout();
      closeOsDialogBackdrop();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (evKey) => {
      if (evKey.key === 'Escape') finish(false);
    };

    titleEl.textContent = 'New event';
    bodyEl.innerHTML =
      `<form class="sched-create-form" id="sched-create-form">` +
        `<label class="de-label sched-create-field">` +
          `<span>Guest name</span>` +
          `<div class="control-field">` +
            `<input name="name" type="text" autocapitalize="words" enterkeyhint="next" required>` +
          `</div>` +
        `</label>` +
        `<label class="de-label sched-create-field">` +
          `<span>Email</span>` +
          `<div class="control-field">` +
            `<input name="email" type="email" autocomplete="email" autocapitalize="none" enterkeyhint="next" required>` +
          `</div>` +
        `</label>` +
        `<label class="de-label sched-create-field sched-create-guests">` +
          `<span>Additional guests</span>` +
          `<div class="schedule-guest-list" id="sched-create-guest-list"></div>` +
        `</label>` +
        `<div class="sched-create-row">` +
          `<label class="de-label sched-create-field">` +
            `<span>Date</span>` +
            `<div class="control-field">` +
              `<input name="date" type="date" required>` +
            `</div>` +
          `</label>` +
          `<label class="de-label sched-create-field">` +
            `<span>Time</span>` +
            `<div class="control-field">` +
              `<input name="time" type="time" required>` +
            `</div>` +
          `</label>` +
        `</div>` +
        `<label class="de-label sched-create-field">` +
          `<span>Address</span>` +
          `<div class="control-field">` +
            `<input name="address" type="text" autocomplete="street-address" autocapitalize="words" enterkeyhint="next" placeholder="123 Main St, City, MA 02134">` +
          `</div>` +
        `</label>` +
        `<label class="de-label sched-create-field">` +
          `<span>Notes</span>` +
          `<div class="control-field">` +
            `<textarea name="notes" rows="2" enterkeyhint="done"></textarea>` +
          `</div>` +
        `</label>` +
        `<p class="sched-create-hint">Creates a Cal.com booking if the time does not conflict. Address is required unless BOOKING_DEFAULT_ADDRESS is configured.</p>` +
        `<p class="sched-create-error" id="sched-create-error" hidden></p>` +
        `<div class="em-book-alt-slots" id="sched-create-alts" hidden></div>` +
      `</form>`;
    actionsEl.innerHTML = '';

    const form = bodyEl.querySelector('#sched-create-form');
    const errEl = bodyEl.querySelector('#sched-create-error');
    const altsEl = bodyEl.querySelector('#sched-create-alts');
    const nameInput = form.querySelector('[name="name"]');
    const emailInput = form.querySelector('[name="email"]');
    const dateInput = form.querySelector('[name="date"]');
    const timeInput = form.querySelector('[name="time"]');
    const addressInput = form.querySelector('[name="address"]');
    dateInput.value = scheduleDateInputValue(dateKey);
    timeInput.value = scheduleTimeInputValue(startDate);
    if (addressInput) {
      addressInput.value = initial.address || readScheduleLastAddress();
    }
    if (initial.name) nameInput.value = String(initial.name);
    if (initial.email) emailInput.value = String(initial.email);
    if (initial.notes) {
      const notesInput = form.querySelector('[name="notes"]');
      if (notesInput) notesInput.value = String(initial.notes);
    }
    destroyGuestAutocomplete = mountScheduleGuestAutocomplete(nameInput, emailInput);
    if (addressInput) {
      destroyAddressAutocomplete = mountScheduleAddressAutocomplete(addressInput);
    }

    const createExtraGuests = [];
    const guestListEl = form.querySelector('#sched-create-guest-list');
    function refreshCreateGuestChips() {
      renderScheduleGuestChips(guestListEl, createExtraGuests, {
        removable: true,
        onRemove: (idx) => {
          createExtraGuests.splice(idx, 1);
          refreshCreateGuestChips();
        },
      });
    }
    refreshCreateGuestChips();
    destroyCreateGuestAdder = mountScheduleGuestAdder(guestListEl.parentElement, {
      onAdd: (guest) => {
        createExtraGuests.push(guest);
        refreshCreateGuestChips();
      },
    }).destroy;

    function readStartIso() {
      const [y, m, d] = dateInput.value.split('-').map(Number);
      const [hh, mm] = timeInput.value.split(':').map(Number);
      const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
      return dt.toISOString();
    }

    function showConflict(check) {
      if (!check) return;
      errEl.hidden = false;
      errEl.textContent = check.conflictReason || 'That time is not available.';
      if (check.alternatives?.length && altsEl) {
        altsEl.hidden = false;
        altsEl.innerHTML = '<p class="em-book-alt-label">Open slots nearby:</p>';
        for (const slot of check.alternatives) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'em-book-alt-slot';
          btn.textContent = slot.label || formatScheduleWhen(slot.iso);
          btn.addEventListener('click', () => {
            const slotDate = new Date(slot.iso);
            dateInput.value = scheduleDateInputValue(scheduleDateKey(slotDate));
            timeInput.value = scheduleTimeInputValue(slotDate);
            errEl.hidden = true;
            altsEl.hidden = true;
            altsEl.innerHTML = '';
          });
          altsEl.appendChild(btn);
        }
      }
    }

    const mkBtn = (label, cls, onClick) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `os-dialog-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      actionsEl.appendChild(btn);
      return btn;
    };

    mkBtn('Cancel', 'os-dialog-btn--ghost', () => finish(false));

    const saveBtn = mkBtn('Add event', 'os-dialog-btn--primary', async () => {
      if (!form.reportValidity()) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      errEl.hidden = true;
      if (altsEl) {
        altsEl.hidden = true;
        altsEl.innerHTML = '';
      }
      try {
        const address = form.address.value.trim();
        const data = await submitScheduleCreate({
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          start: readStartIso(),
          ...(address ? { address } : {}),
          notes: scheduleSerializeNotesWithGuests(form.notes.value.trim(), createExtraGuests),
        });
        if (address) rememberScheduleAddress(address);
        finish(true);
        scheduleState.selectedDate = scheduleBookingDateKey(data.booking?.startTime);
        scheduleState.focusDate = scheduleState.selectedDate;
        if (data.booking?.uid) scheduleState.activeUid = data.booking.uid;
        await loadScheduleTab();
        await shell.osAlert({
          title: 'Event scheduled',
          bodyHtml: `<p>Booked for <strong>${escHtml(formatScheduleWhen(data.booking?.startTime))}</strong>.</p>`,
        });
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Add event';
        if (err.check) {
          showConflict(err.check);
        } else {
          errEl.hidden = false;
          errEl.textContent = err.message || String(err);
        }
      }
    });

    openOsDialogBackdrop();
    bindOsDialogDismiss(backdrop, finish, true);
    document.addEventListener('keydown', onKey);
    bindOsDialogKeyboardLayout();
    scheduleOsDialogFieldFocus(nameInput);
  });
}

function scheduleShareBookingUrl(booking) {
  const calBase = scheduleState.meta.calcomAdminUrl?.replace(/\/+$/, '');
  if (booking?.uid && calBase) {
    return `${calBase}/booking/${encodeURIComponent(booking.uid)}`;
  }
  const formUrl = scheduleState.meta.bookingFormUrl || '/form/schedule';
  const url = scheduleState.meta.publicBookingUrl || formUrl;
  if (url.startsWith('http')) return url;
  return `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
}

function renderScheduleDetailWhenNav(booking) {
  const bar = document.createElement('div');
  bar.className = 'schedule-detail-when-nav';

  const prevBtn = createIosIconBtn({
    iconKey: 'chevron-left',
    label: 'Previous meeting',
    className: 'ios-icon-btn nav-chevron-btn schedule-detail-when-nav-btn',
    onClick: () => navigateScheduleBooking(-1),
  });
  prevBtn.disabled = !scheduleAdjacentBooking(booking.uid, -1);

  const when = document.createElement('p');
  when.className = 'schedule-detail-when';
  const whenFull = document.createElement('span');
  whenFull.className = 'schedule-detail-when-full';
  whenFull.textContent = formatScheduleRange(booking.startTime, booking.endTime);
  const whenCompact = document.createElement('span');
  whenCompact.className = 'schedule-detail-when-compact';
  whenCompact.textContent = formatScheduleRange(booking.startTime, booking.endTime, { compact: true });
  when.append(whenFull, whenCompact);

  const nextBtn = createIosIconBtn({
    iconKey: 'chevron-right',
    label: 'Next meeting',
    className: 'ios-icon-btn nav-chevron-btn schedule-detail-when-nav-btn',
    onClick: () => navigateScheduleBooking(1),
  });
  nextBtn.disabled = !scheduleAdjacentBooking(booking.uid, 1);

  bar.append(prevBtn, when, nextBtn);
  return bar;
}

function renderScheduleDetail(pane, booking) {
  pane.innerHTML = '';
  const who = scheduleBookingWho(booking);
  const statusNorm = String(booking.status || '').toLowerCase();
  const icons = [
    paneShareIcon({
      label: 'Share with guest',
      onClick: () =>
        openReaveShareSheet({
          kind: 'booking',
          recipient: { name: who, email: booking.email || undefined },
          booking: {
            uid: booking.uid,
            title: booking.title,
            startTime: booking.startTime,
            endTime: booking.endTime,
            location: booking.location,
            description: booking.description,
          },
          url: scheduleShareBookingUrl(booking),
          shareTitle: booking.title || 'Meeting',
        }),
    }),
  ];
  if (statusNorm === 'accepted' || statusNorm === 'pending') {
    icons.push(
      paneDeleteIcon({
        label: 'Cancel booking',
        onClick: () => cancelScheduleBooking(booking.uid),
      }),
    );
  }

  pane.appendChild(
    createPaneSubheader({
      back: {
        label: 'Back to schedule',
        onClick: () => closeScheduleDetail(),
      },
      title: booking.title || 'Meeting',
      icons,
    }).header,
  );
  pane.appendChild(renderScheduleDetailWhenNav(booking));

  const scroll = document.createElement('div');
  scroll.className = 're-form-scroll schedule-detail-scroll';

  if (booking.status) {
    const status = document.createElement('span');
    status.className = `schedule-status ${scheduleStatusClass(booking.status)}`;
    status.textContent = booking.status;
    scroll.appendChild(status);
  }

  const fields = document.createElement('dl');
  fields.className = 'schedule-detail-fields';
  const addField = (label, value, href) => {
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = value;
      a.className = 'schedule-detail-link';
      if (href.startsWith('mailto:') || href.startsWith('http')) {
        a.target = href.startsWith('http') ? '_blank' : '';
        a.rel = 'noopener';
      }
      dd.appendChild(a);
    } else {
      dd.textContent = value;
    }
    fields.appendChild(dt);
    fields.appendChild(dd);
  };
  const { cleanNotes, extraGuests: parsedExtraGuests } = scheduleParseExtraGuests(booking.description);
  const extraGuests = parsedExtraGuests.slice();

  const guestDt = document.createElement('dt');
  const guestDd = document.createElement('dd');
  guestDd.className = 'schedule-guest-field';
  const guestChips = document.createElement('div');
  guestChips.className = 'schedule-guest-list';
  guestDd.appendChild(guestChips);

  function refreshGuestField() {
    guestDt.textContent = extraGuests.length ? 'Guests' : 'Guest';
    renderScheduleGuestChips(guestChips, [{ name: who, email: booking.email }, ...extraGuests], {
      removable: (idx) => idx > 0,
      onRemove: (idx) => {
        const [removed] = extraGuests.splice(idx - 1, 1);
        refreshGuestField();
        scheduleSaveBookingGuests(booking, cleanNotes, extraGuests).catch((e) => {
          extraGuests.splice(idx - 1, 0, removed);
          refreshGuestField();
          alert(`Failed to remove guest: ${e.message}`);
        });
      },
    });
  }
  refreshGuestField();

  fields.appendChild(guestDt);
  fields.appendChild(guestDd);

  mountScheduleGuestAdder(guestDd, {
    onAdd: (guest) => {
      extraGuests.push(guest);
      refreshGuestField();
      scheduleSaveBookingGuests(booking, cleanNotes, extraGuests).catch((e) => {
        extraGuests.pop();
        refreshGuestField();
        alert(`Failed to add guest: ${e.message}`);
      });
    },
  });

  addField('Email', booking.email, booking.email ? `mailto:${booking.email}` : null);
  addField('Location', booking.location);
  if (cleanNotes) addField('Notes', cleanNotes);
  scroll.appendChild(fields);

  const actions = document.createElement('div');
  actions.className = 'de-actions schedule-detail-actions';
  if (scheduleState.meta.calcomAdminUrl) {
    const calLink = document.createElement('a');
    calLink.className = 'de-btn de-btn-ghost schedule-cal-link';
    calLink.href = `${scheduleState.meta.calcomAdminUrl.replace(/\/+$/, '')}/bookings/${booking.uid}`;
    calLink.target = '_blank';
    calLink.rel = 'noopener';
    calLink.textContent = 'Cal.com admin';
    actions.appendChild(calLink);
  }
  scroll.appendChild(actions);
  pane.appendChild(scroll);
}

function renderScheduleViewPicker() {
  const picker = createSlidingPillSelect({
    value: scheduleState.view,
    options: SCHEDULE_VIEWS,
    ariaLabel: 'Calendar view',
    className: 'cal-view-pill',
    onChange: (next) => {
      if (scheduleState.view === next) return;
      scheduleState.view = next;
      scheduleEnsureFocusDate();
      loadScheduleTab();
    },
  });
  return picker.el;
}

function renderScheduleToolbar() {
  scheduleEnsureFocusDate();
  const bar = document.createElement('div');
  bar.className = 'cal-toolbar';

  const nav = document.createElement('div');
  nav.className = 'cal-toolbar-nav';

  const prevBtn = createIosIconBtn({
    iconKey: 'chevron-left',
    label: 'Previous',
    className: 'ios-icon-btn nav-chevron-btn',
    onClick: () => scheduleShiftFocus(-1),
  });
  nav.appendChild(prevBtn);

  const title = document.createElement('h2');
  title.className = 'cal-toolbar-title';
  title.textContent = scheduleToolbarTitle(scheduleState.view, scheduleState.focusDate);
  nav.appendChild(title);

  const nextBtn = createIosIconBtn({
    iconKey: 'chevron-right',
    label: 'Next',
    className: 'ios-icon-btn nav-chevron-btn',
    onClick: () => scheduleShiftFocus(1),
  });
  nav.appendChild(nextBtn);

  bar.appendChild(nav);

  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className = 'cal-toolbar-today';
  todayBtn.textContent = 'Today';
  todayBtn.addEventListener('click', () => {
    scheduleState.focusDate = scheduleTodayKey();
    scheduleState.selectedDate = scheduleState.focusDate;
    scheduleState.selectedSlot = null;
    loadScheduleTab();
  });
  bar.appendChild(todayBtn);

  return bar;
}

function formatScheduleAgendaTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function createCalAgendaItem(booking) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className =
    'cal-agenda-item' +
    (scheduleBookingIsPast(booking) ? ' cal-agenda-item--past' : '') +
    (booking.uid === scheduleState.activeUid ? ' active' : '');
  const who = scheduleBookingWhoLabel(booking);
  item.innerHTML =
    `<span class="cal-agenda-time">${escHtml(formatScheduleAgendaTime(booking.startTime))}</span>` +
    `<span class="cal-agenda-main">` +
      `<span class="cal-agenda-title">${escHtml(booking.title || 'Meeting')}</span>` +
      `<span class="cal-agenda-sub">${escHtml(who)}</span>` +
    `</span>`;
  item.addEventListener('click', () => selectScheduleBooking(booking.uid));
  return item;
}

function renderCalDayAgenda(parent, dayKey, opts = {}) {
  const { showDayViewAction = false } = opts;
  const bookings = scheduleBookingsForDay(dayKey);

  const wrap = document.createElement('div');
  wrap.className = 'cal-day-agenda';

  const header = document.createElement('div');
  header.className = 'cal-day-agenda-header';
  const dateLabel = document.createElement('span');
  dateLabel.className = 'cal-day-agenda-date';
  dateLabel.textContent = scheduleParseDateKey(dayKey).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  header.appendChild(dateLabel);

  if (showDayViewAction) {
    const dayBtn = document.createElement('button');
    dayBtn.type = 'button';
    dayBtn.className = 'cal-day-agenda-action';
    dayBtn.textContent = 'Day view';
    dayBtn.addEventListener('click', () => {
      scheduleState.focusDate = dayKey;
      scheduleState.selectedDate = dayKey;
      scheduleState.view = 'day';
      loadScheduleTab();
    });
    header.appendChild(dayBtn);
  }
  wrap.appendChild(header);

  if (!bookings.length) {
    const empty = document.createElement('p');
    empty.className = 'cal-day-agenda-empty';
    empty.textContent = 'No events scheduled for this day.';
    wrap.appendChild(empty);
  } else {
    for (const booking of bookings) {
      wrap.appendChild(createCalAgendaItem(booking));
    }
  }
  parent.appendChild(wrap);
}

function renderCalMonthView(parent) {
  const focus = scheduleParseDateKey(scheduleState.focusDate);
  const month = focus.getMonth();
  const year = focus.getFullYear();
  const first = new Date(year, month, 1);
  const gridStart = scheduleStartOfWeek(first);

  const weekdays = document.createElement('div');
  weekdays.className = 'cal-weekdays';
  for (const label of CAL_WEEKDAYS) {
    const span = document.createElement('span');
    span.textContent = label;
    weekdays.appendChild(span);
  }
  parent.appendChild(weekdays);

  const grid = document.createElement('div');
  grid.className = 'cal-month-grid';
  const today = scheduleTodayKey();
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let i = 0; i < 42; i++) {
    const dayDate = scheduleAddDays(gridStart, i);
    const key = scheduleDateKey(dayDate);
    const dayBookings = scheduleBookingsForDay(key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    if (dayDate.getMonth() !== month) btn.classList.add('cal-day--other');
    const isToday = dayDate.getFullYear() === now.getFullYear() && 
                     dayDate.getMonth() === now.getMonth() && 
                     dayDate.getDate() === now.getDate();
    if (isToday) btn.classList.add('cal-day--today');
    if (
      key === scheduleState.selectedDate &&
      scheduleDateInSameMonth(key, scheduleState.focusDate)
    ) {
      btn.classList.add('cal-day--selected');
    }

    const num = document.createElement('span');
    num.className = 'cal-day-num';
    num.textContent = String(dayDate.getDate());
    btn.appendChild(num);

    if (dayBookings.length) {
      const dots = document.createElement('span');
      dots.className = 'cal-day-dots';
      const maxDots = Math.min(dayBookings.length, 3);
      for (let d = 0; d < maxDots; d++) {
        const dot = document.createElement('span');
        dot.className = 'cal-day-dot';
        dots.appendChild(dot);
      }
      btn.appendChild(dots);
    }

    btn.addEventListener('click', () => {
      scheduleState.selectedDate = key;
      scheduleState.selectedSlot = null;
      scheduleState.activeUid = null;
      getSchedulePanel()?.classList.remove('de-pane-active');
      renderSchedulePanel();
    });
    btn.addEventListener('dblclick', () => {
      scheduleState.selectedDate = key;
      scheduleState.focusDate = key;
      scheduleState.selectedSlot = null;
      scheduleState.view = 'day';
      loadScheduleTab();
    });
    grid.appendChild(btn);
  }
  parent.appendChild(grid);

  // Add swipe gesture support for navigating between months
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  
  const handleSwipeGesture = () => {
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    const minSwipeDistance = 50;
    
    // Only trigger swipe if horizontal movement is greater than vertical
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
      if (diffX > 0) {
        // Swipe right - go to previous month
        scheduleShiftFocus(-1);
      } else {
        // Swipe left - go to next month
        scheduleShiftFocus(1);
      }
    }
  };
  
  grid.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });
  
  grid.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture();
  }, { passive: true });

  const displayDate = scheduleMonthDisplayDate(scheduleState.focusDate);
  if (displayDate) {
    renderCalDayAgenda(parent, displayDate, { showDayViewAction: true });
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'cal-day-agenda';
    const empty = document.createElement('p');
    empty.className = 'cal-day-agenda-empty';
    empty.textContent = 'Select a day to view events.';
    wrap.appendChild(empty);
    parent.appendChild(wrap);
  }
}

function scheduleBookingEndTime(booking) {
  const start = new Date(booking.startTime);
  return booking.endTime ? new Date(booking.endTime) : new Date(start.getTime() + 30 * 60 * 1000);
}

function scheduleBookingIsPast(booking) {
  try {
    return scheduleBookingEndTime(booking).getTime() <= Date.now();
  } catch {
    return false;
  }
}

function scheduleEventLayout(booking) {
  const start = new Date(booking.startTime);
  const end = scheduleBookingEndTime(booking);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const top = (startMin / (CAL_HOURS * 60)) * (CAL_HOURS * CAL_HOUR_PX);
  const height = Math.max(((endMin - startMin) / (CAL_HOURS * 60)) * (CAL_HOURS * CAL_HOUR_PX), 36);
  return { top, height };
}

function renderCalTimeGrid(parent, dayKeys, opts = {}) {
  const { singleDay = false } = opts;
  const totalHeight = CAL_HOURS * CAL_HOUR_PX;

  if (!singleDay) {
    const header = document.createElement('div');
    header.className = 'cal-week-header';
    const today = scheduleTodayKey();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (const key of dayKeys) {
      const d = scheduleParseDateKey(key);
      const col = document.createElement('button');
      col.type = 'button';
      col.className = 'cal-week-header-col';
      const isToday = d.getFullYear() === now.getFullYear() && 
                       d.getMonth() === now.getMonth() && 
                       d.getDate() === now.getDate();
      if (isToday) col.classList.add('cal-week-header-col--today');
      if (key === scheduleState.selectedDate) col.classList.add('cal-week-header-col--selected');
      col.innerHTML =
        `<span class="cal-week-header-dow">${escHtml(d.toLocaleDateString(undefined, { weekday: 'short' }))}</span>` +
        `<span class="cal-week-header-daynum">${d.getDate()}</span>`;
      col.addEventListener('click', () => {
        scheduleState.selectedDate = key;
        scheduleState.focusDate = key;
        scheduleState.view = 'day';
        loadScheduleTab();
      });
      header.appendChild(col);
    }
    parent.appendChild(header);
  } else {
    const sub = document.createElement('div');
    sub.className = 'cal-day-view-header';
    sub.textContent = scheduleParseDateKey(dayKeys[0]).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    parent.appendChild(sub);
  }

  const wrap = document.createElement('div');
  wrap.className = 'cal-time-grid-wrap';
  wrap.style.height = `${totalHeight}px`;

  const gutter = document.createElement('div');
  gutter.className = 'cal-time-gutter';
  for (let h = 0; h < CAL_HOURS; h++) {
    const label = document.createElement('span');
    label.className = 'cal-time-label';
    label.style.top = `${h * CAL_HOUR_PX}px`;
    if (h === 0) {
      label.textContent = '';
    } else {
      const dt = new Date();
      dt.setHours(h, 0, 0, 0);
      label.textContent = dt.toLocaleTimeString(undefined, { hour: 'numeric' });
    }
    gutter.appendChild(label);
  }
  wrap.appendChild(gutter);

  const cols = document.createElement('div');
  cols.className = 'cal-time-columns';

  for (const key of dayKeys) {
    const col = document.createElement('div');
    col.className = 'cal-time-col';
    for (let h = 0; h < CAL_HOURS; h++) {
      const line = document.createElement('div');
      line.className = 'cal-hour-line';
      line.style.top = `${h * CAL_HOUR_PX}px`;
      col.appendChild(line);
    }
    col.addEventListener('click', (e) => {
      if (e.target.closest('.cal-event-block')) return;
      const rect = col.getBoundingClientRect();
      const { hour, minute } = scheduleTimeFromClickY(e.clientY, rect.top);
      scheduleState.selectedDate = key;
      scheduleState.selectedSlot = { dateKey: key, hour, minute };
      scheduleState.activeUid = null;
      getSchedulePanel()?.classList.remove('de-pane-active');
      renderSchedulePanel();
    });
    if (
      scheduleState.selectedSlot?.dateKey === key &&
      !scheduleState.activeUid
    ) {
      const { hour, minute } = scheduleState.selectedSlot;
      const top = ((hour * 60 + minute) / (CAL_HOURS * 60)) * (CAL_HOURS * CAL_HOUR_PX);
      const marker = document.createElement('div');
      marker.className = 'cal-slot-marker';
      marker.style.top = `${top}px`;
      col.appendChild(marker);
    }
    for (const booking of scheduleBookingsForDay(key)) {
      const { top, height } = scheduleEventLayout(booking);
      const block = document.createElement('button');
      block.type = 'button';
      block.className =
        'cal-event-block' +
        (scheduleBookingIsPast(booking) ? ' cal-event-block--past' : '') +
        (booking.uid === scheduleState.activeUid ? ' active' : '');
      block.style.top = `${top}px`;
      block.style.height = `${height}px`;
      block.innerHTML =
        `<span class="cal-event-block-title">${escHtml(booking.title || 'Meeting')}</span>` +
        `<span class="cal-event-block-sub">${escHtml(scheduleBookingWhoLabel(booking))}</span>`;
      block.addEventListener('click', (e) => {
        e.stopPropagation();
        selectScheduleBooking(booking.uid);
      });
      col.appendChild(block);
    }
    cols.appendChild(col);
  }

  wrap.appendChild(cols);
  parent.appendChild(wrap);
}

function renderCalWeekView(parent) {
  const focus = scheduleParseDateKey(scheduleState.focusDate);
  const start = scheduleStartOfWeek(focus);
  const dayKeys = [];
  for (let i = 0; i < 7; i++) {
    dayKeys.push(scheduleDateKey(scheduleAddDays(start, i)));
  }
  scheduleState.selectedDate = scheduleState.selectedDate || dayKeys[0];
  renderCalTimeGrid(parent, dayKeys);
}

function renderCalDayView(parent) {
  const key = scheduleState.focusDate || scheduleTodayKey();
  scheduleState.selectedDate = key;
  renderCalTimeGrid(parent, [key], { singleDay: true });
}

function renderScheduleCalendarBody(parent) {
  if (scheduleState.view === 'week') {
    renderCalWeekView(parent);
  } else if (scheduleState.view === 'day') {
    renderCalDayView(parent);
  } else {
    renderCalMonthView(parent);
  }
}

function renderSchedulePanel() {
  const root = getSchedulePanel();
  if (!root) return;
  scheduleEnsureFocusDate();
  root.classList.toggle('de-pane-active', Boolean(scheduleState.activeUid));
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar schedule-panel-scroll';

  sidebar.appendChild(renderScheduleToolbar());

  const pickerWrap = document.createElement('div');
  pickerWrap.className = 'cal-view-picker';
  pickerWrap.appendChild(renderScheduleViewPicker());
  sidebar.appendChild(pickerWrap);

  const body = document.createElement('div');
  body.className = 'cal-body';

  if (scheduleState.loading) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = 'Loading calendar…';
    body.appendChild(empty);
  } else if (scheduleState.error) {
    const err = document.createElement('div');
    err.className = 'de-empty de-error';
    err.textContent = scheduleState.error;
    body.appendChild(err);
    const hint = document.createElement('div');
    hint.className = 'de-empty';
    hint.innerHTML = 'Enable <code>scheduling</code> in FEATURES and set BOOKING_API_URL on Railway.';
    body.appendChild(hint);
  } else {
    renderScheduleCalendarBody(body);
  }

  sidebar.appendChild(body);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane schedule-detail-pane';
  const active = scheduleState.activeUid ? findScheduleBooking(scheduleState.activeUid) : null;
  if (active) {
    renderScheduleDetail(pane, active);
  } else {
    shell.appendEmptyDetailPane(pane, {
      mapKey: 'schedule',
      iconName: 'calendar',
      bodyHtml: '<p>Select an event to view guest details, or book a new time.</p>',
      btnLabel: 'New Meeting',
      onCreate: () => scheduleOpenCreateDialog(),
    });
  }
  root.appendChild(pane);
}
export {
  scheduleState,
  loadScheduleTab,
  scheduleShareBookingUrl,
  formatScheduleRange,
  mountAddressAutocomplete,
  formatScheduleWhen,
  openScheduleTab,
  scheduleTodayKey,
  scheduleEnsureFocusDate,
  scheduleOpenCreateDialog,
  readScheduleLastAddress,
  rememberScheduleAddress,
  mountScheduleAddressAutocomplete,
  isScheduleAddressError,
  ensureScheduleAddress,
  scheduleDateKey,
  openScheduleCreateDialog,
};
