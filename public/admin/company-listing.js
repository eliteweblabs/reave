/**
 * Company panel — structured hours repeater + Google Business Profile preview.
 */
import { escHtml, formatPhoneInput } from './shared.js?v=20260810a';

const MINUTES_PER_DAY = 24 * 60;
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Mon → Sun display order; values are Google weekday indexes (0 = Sunday). */
const WEEKDAY_UI_ORDER = [1, 2, 3, 4, 5, 6, 0];

function emptyWeek() {
  return [[], [], [], [], [], [], []];
}

function clampMinute(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), MINUTES_PER_DAY);
}

function formatMinutes(minutes) {
  const total = clampMinute(minutes);
  if (total >= MINUTES_PER_DAY) return 'midnight';
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const meridiem = hour24 >= 12 ? 'pm' : 'am';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0
    ? `${hour12}${meridiem}`
    : `${hour12}:${String(minute).padStart(2, '0')}${meridiem}`;
}

function formatInterval(interval) {
  return `${formatMinutes(interval.start)}–${formatMinutes(interval.end)}`;
}

function intervalsForDay(hours, weekday) {
  if (!hours) return [];
  if (hours.alwaysOpen) return [{ start: 0, end: MINUTES_PER_DAY }];
  const day = ((weekday % 7) + 7) % 7;
  return hours.days?.[day] ?? [];
}

function formatDayHours(hours, weekday) {
  const intervals = intervalsForDay(hours, weekday);
  if (!intervals.length) return 'Closed';
  if (hours?.alwaysOpen) return 'Open 24 hours';
  return intervals.map(formatInterval).join(', ');
}

function formatWeekHours(hours) {
  if (!hasAnyHours(hours)) return [];
  if (hours?.alwaysOpen) return ['Open 24 hours daily'];
  const lines = [];
  let runStart = 0;
  const signature = (day) => formatDayHours(hours, day);
  for (let day = 1; day <= 7; day += 1) {
    const sameAsRun = day < 7 && signature(day) === signature(runStart);
    if (sameAsRun) continue;
    const runEnd = day - 1;
    const label =
      runStart === runEnd
        ? WEEKDAY_SHORT[runStart]
        : `${WEEKDAY_SHORT[runStart]}–${WEEKDAY_SHORT[runEnd]}`;
    lines.push(`${label} ${signature(runStart)}`);
    runStart = day;
  }
  return lines;
}

function hasAnyHours(hours) {
  if (!hours) return false;
  if (hours.alwaysOpen) return true;
  return (hours.days ?? []).some((day) => day.length > 0);
}

function parseStoredBusinessHours(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.days)) return null;
  const days = emptyWeek();
  for (let day = 0; day < 7; day += 1) {
    const entry = raw.days[day];
    if (!Array.isArray(entry)) continue;
    days[day] = entry
      .map((i) => {
        const start = Number(i?.start);
        const end = Number(i?.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
        return { start, end };
      })
      .filter(Boolean);
  }
  const hours = {
    days,
    source: raw.source === 'places' || raw.source === 'text' ? raw.source : 'manual',
  };
  if (raw.alwaysOpen === true) hours.alwaysOpen = true;
  if (!hasAnyHours(hours)) return null;
  return hours;
}


function rowsFromHours(hours) {
  if (hours?.alwaysOpen) {
    return WEEKDAY_UI_ORDER.map((day) => ({
      day,
      closed: false,
      start: 0,
      end: MINUTES_PER_DAY,
    }));
  }
  return WEEKDAY_UI_ORDER.map((day) => {
    const intervals = intervalsForDay(hours, day);
    if (!intervals.length) return { day, closed: true, start: 9 * 60, end: 17 * 60 };
    const first = intervals[0];
    return { day, closed: false, start: first.start, end: first.end };
  });
}

function hoursFromRows(rows, alwaysOpen) {
  if (alwaysOpen) {
    return {
      days: emptyWeek().map(() => [{ start: 0, end: MINUTES_PER_DAY }]),
      alwaysOpen: true,
      source: 'manual',
      fetchedAt: new Date().toISOString(),
    };
  }
  const days = emptyWeek();
  for (const row of rows) {
    if (row.closed) continue;
    days[row.day].push({ start: row.start, end: row.end });
  }
  const hours = { days, source: 'manual', fetchedAt: new Date().toISOString() };
  if (!hasAnyHours(hours)) return null;
  return hours;
}

function timeSelectOptions(selected) {
  const parts = [];
  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += 30) {
    const label = formatMinutes(minutes);
    parts.push(
      `<option value="${minutes}"${minutes === selected ? ' selected' : ''}>${escHtml(label)}</option>`,
    );
  }
  return parts.join('');
}

function renderHoursRow(row) {
  const dayLabel = WEEKDAY_LABELS[row.day] || 'Day';
  return (
    `<div class="co-hours-row" data-day="${row.day}">` +
      `<span class="co-hours-day">${escHtml(dayLabel)}</span>` +
      `<label class="co-hours-closed">` +
        `<input type="checkbox" class="co-hours-closed-input"${row.closed ? ' checked' : ''} />` +
        `<span>Closed</span>` +
      `</label>` +
      `<select class="co-hours-start" aria-label="${escHtml(dayLabel)} open"${row.closed ? ' disabled' : ''}>${timeSelectOptions(row.start)}</select>` +
      `<span class="co-hours-sep" aria-hidden="true">–</span>` +
      `<select class="co-hours-end" aria-label="${escHtml(dayLabel)} close"${row.closed ? ' disabled' : ''}>${timeSelectOptions(row.end)}</select>` +
    `</div>`
  );
}

export function renderCompanyHoursSection(company) {
  const hours = parseStoredBusinessHours(company?.businessHours);
  const alwaysOpen = hours?.alwaysOpen === true;
  const syncToCalcom = company?.syncHoursToCalcom === true;
  const rows = rowsFromHours(hours);
  const hoursJson = hours ? JSON.stringify(hours) : '';
  return (
    `<input type="hidden" id="company-businessHours" name="businessHours" value="${escHtml(hoursJson)}" />` +
    `<input type="hidden" id="company-syncHoursToCalcom" name="syncHoursToCalcom" value="${syncToCalcom ? 'true' : 'false'}" />` +
    `<div class="co-hours-toggles">` +
      `<label class="co-hours-always">` +
        `<input type="checkbox" id="company-hours-always-open" class="co-hours-always-input"${alwaysOpen ? ' checked' : ''} />` +
        `<span>Open 24 hours</span>` +
      `</label>` +
      `<label class="co-hours-always">` +
        `<input type="checkbox" id="company-hours-sync-calcom" class="co-hours-sync-calcom-input"${syncToCalcom ? ' checked' : ''} />` +
        `<span>Sync to Cal.com</span>` +
      `</label>` +
    `</div>` +
    `<div id="company-hours-repeater" class="co-hours-repeater${alwaysOpen ? ' is-always-open' : ''}">` +
      rows.map(renderHoursRow).join('') +
    `</div>` +
    `<div class="co-hours-actions">` +
      `<button type="button" id="company-hours-copy-weekdays" class="de-btn de-btn-secondary">Copy Mon to weekdays</button>` +
    `</div>` +
    `<span class="prof-hint prof-hint--block">Structured hours feed directory listings and visit planning. Turn on Sync to Cal.com to push the same windows onto booking availability. Google uses Sunday as day 0 — we store the same shape.</span>`
  );
}

export function renderGoogleListingPreviewSection() {
  return (
    `<div id="company-gbp-preview" class="co-gbp-preview-wrap" aria-live="polite">` +
      `<div class="co-gbp-checklist" id="company-gbp-checklist"></div>` +
      `<div class="co-gbp-phone">` +
        `<div class="co-gbp-card" id="company-gbp-card"></div>` +
      `</div>` +
      `<span class="prof-hint prof-hint--block">Preview mirrors a Google Maps knowledge panel — not a live listing. Category, reviews, and photos beyond your logo still need platform setup.</span>` +
    `</div>`
  );
}

function readListingState(root) {
  const form = root.querySelector('#company-form');
  if (!(form instanceof HTMLFormElement)) return {};
  const logoPreview = root.querySelector('#company-logo-preview');
  const iconPreview = root.querySelector('#company-icon-preview');
  const logoUrl =
    logoPreview instanceof HTMLImageElement && logoPreview.src && !logoPreview.closest('.is-empty')
      ? logoPreview.src
      : '';
  const iconUrl =
    iconPreview instanceof HTMLImageElement && iconPreview.src && !iconPreview.closest('.is-empty')
      ? iconPreview.src
      : '';
  const hiddenHours = root.querySelector('#company-businessHours');
  let businessHours = null;
  if (hiddenHours instanceof HTMLInputElement && hiddenHours.value.trim()) {
    try {
      businessHours = parseStoredBusinessHours(JSON.parse(hiddenHours.value));
    } catch {
      businessHours = null;
    }
  }
  return {
    name: form.querySelector('#company-name')?.value?.trim() || '',
    legalName: form.querySelector('#company-legalName')?.value?.trim() || '',
    description: form.querySelector('#company-description')?.value?.trim() || '',
    address: form.querySelector('#company-address')?.value?.trim() || '',
    phone: form.querySelector('#company-supportPhone')?.value?.trim() || '',
    domain: form.querySelector('#company-domain')?.value?.trim() || '',
    businessHours,
    hoursLines: formatWeekHours(businessHours),
    logoUrl,
    iconUrl,
  };
}

function listingValidation(state) {
  return [
    { key: 'name', label: 'Display name', ok: Boolean(state.name) },
    { key: 'address', label: 'Address', ok: Boolean(state.address) },
    { key: 'phone', label: 'Phone', ok: Boolean(state.phone?.replace(/\D/g, '').length >= 10) },
    { key: 'website', label: 'Website', ok: Boolean(state.domain) },
    { key: 'hours', label: 'Hours', ok: hasAnyHours(state.businessHours) },
    { key: 'description', label: 'Description', ok: Boolean(state.description) },
    { key: 'logo', label: 'Logo or icon', ok: Boolean(state.logoUrl || state.iconUrl) },
  ];
}

function openStatusLine(hours) {
  const now = new Date();
  const weekday = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (!hasAnyHours(hours)) return { text: 'Hours not provided', open: null };
  if (hours.alwaysOpen) return { text: 'Open 24 hours', open: true };
  const intervals = intervalsForDay(hours, weekday);
  const openNow = intervals.some((i) => minutes >= i.start && minutes < i.end);
  if (openNow) {
    const closing = intervals.find((i) => minutes >= i.start && minutes < i.end);
    return { text: `Open · Closes ${formatMinutes(closing?.end ?? 0)}`, open: true };
  }
  return { text: 'Closed', open: false };
}

function renderChecklist(items) {
  return items
    .map(
      (item) =>
        `<div class="co-gbp-check${item.ok ? ' is-ok' : ' is-missing'}">` +
          `<span class="co-gbp-check-icon" aria-hidden="true">${item.ok ? '✓' : '·'}</span>` +
          `<span>${escHtml(item.label)}</span>` +
        `</div>`,
    )
    .join('');
}

function renderGbpCard(state) {
  const name = state.name || 'Business name';
  const category = state.description || 'Add a tagline / category';
  const status = openStatusLine(state.businessHours);
  const phoneDisplay = state.phone ? formatPhoneInput(state.phone) : '';
  const website = state.domain ? `https://${state.domain.replace(/^https?:\/\//, '')}` : '';
  const photo = state.logoUrl || state.iconUrl;
  const hoursRows = WEEKDAY_UI_ORDER.map((day) => ({
    label: WEEKDAY_SHORT[day],
    value: formatDayHours(state.businessHours, day),
  }));

  return (
    `<div class="co-gbp-header">` +
      `<h3 class="co-gbp-name">${escHtml(name)}</h3>` +
      `<p class="co-gbp-category">${escHtml(category)}</p>` +
      `<p class="co-gbp-rating"><span class="co-gbp-stars" aria-hidden="true">★★★★★</span> <span class="co-gbp-rating-meta">No reviews yet</span></p>` +
    `</div>` +
    (photo
      ? `<div class="co-gbp-photo"><img src="${escHtml(photo)}" alt="" /></div>`
      : `<div class="co-gbp-photo co-gbp-photo--empty"><span>No cover photo</span></div>`) +
    `<ul class="co-gbp-facts">` +
      (state.address
        ? `<li><span class="co-gbp-fact-icon" aria-hidden="true">📍</span><span>${escHtml(state.address)}</span></li>`
        : `<li class="co-gbp-missing"><span class="co-gbp-fact-icon" aria-hidden="true">📍</span><span>Add business address</span></li>`) +
      (phoneDisplay
        ? `<li><span class="co-gbp-fact-icon" aria-hidden="true">📞</span><span>${escHtml(phoneDisplay)}</span></li>`
        : '') +
      (website
        ? `<li><span class="co-gbp-fact-icon" aria-hidden="true">🌐</span><span>${escHtml(state.domain)}</span></li>`
        : '') +
      `<li class="co-gbp-hours-row">` +
        `<span class="co-gbp-fact-icon" aria-hidden="true">🕐</span>` +
        `<span class="co-gbp-hours-summary${status.open === true ? ' is-open' : status.open === false ? ' is-closed' : ''}">${escHtml(status.text)}</span>` +
      `</li>` +
    `</ul>` +
    `<div class="co-gbp-hours-table">` +
      hoursRows
        .map(
          (row) =>
            `<div class="co-gbp-hours-line"><span>${escHtml(row.label)}</span><span>${escHtml(row.value)}</span></div>`,
        )
        .join('') +
    `</div>` +
    (state.description
      ? `<p class="co-gbp-about"><span class="co-gbp-about-label">About</span> ${escHtml(state.description)}</p>`
      : '')
  );
}

export function refreshGoogleListingPreview(root) {
  const checklistEl = root.querySelector('#company-gbp-checklist');
  const cardEl = root.querySelector('#company-gbp-card');
  if (!(checklistEl instanceof HTMLElement) || !(cardEl instanceof HTMLElement)) return;
  const state = readListingState(root);
  const validation = listingValidation(state);
  checklistEl.innerHTML = renderChecklist(validation);
  cardEl.innerHTML = renderGbpCard(state);
}

function syncHiddenHours(root, rows, alwaysOpen) {
  const hidden = root.querySelector('#company-businessHours');
  if (!(hidden instanceof HTMLInputElement)) return;
  const hours = hoursFromRows(rows, alwaysOpen);
  hidden.value = hours ? JSON.stringify(hours) : '';
  hidden.dispatchEvent(new Event('change', { bubbles: true }));
  refreshGoogleListingPreview(root);
}

function readRowsFromDom(repeater) {
  const rows = [];
  for (const el of repeater.querySelectorAll('.co-hours-row')) {
    const day = Number(el.dataset.day);
    const closedInput = el.querySelector('.co-hours-closed-input');
    const startSelect = el.querySelector('.co-hours-start');
    const endSelect = el.querySelector('.co-hours-end');
    rows.push({
      day,
      closed: closedInput instanceof HTMLInputElement ? closedInput.checked : true,
      start: startSelect instanceof HTMLSelectElement ? Number(startSelect.value) : 9 * 60,
      end: endSelect instanceof HTMLSelectElement ? Number(endSelect.value) : 17 * 60,
    });
  }
  return rows;
}

export function bindCompanyListing(root, { onHoursChange } = {}) {
  const repeater = root.querySelector('#company-hours-repeater');
  const alwaysInput = root.querySelector('#company-hours-always-open');
  const syncCalcomInput = root.querySelector('#company-hours-sync-calcom');
  const syncCalcomHidden = root.querySelector('#company-syncHoursToCalcom');
  const copyBtn = root.querySelector('#company-hours-copy-weekdays');
  if (!(repeater instanceof HTMLElement)) return;

  const emitHours = () => {
    const alwaysOpen = alwaysInput instanceof HTMLInputElement && alwaysInput.checked;
    repeater.classList.toggle('is-always-open', alwaysOpen);
    const rows = readRowsFromDom(repeater);
    syncHiddenHours(root, rows, alwaysOpen);
    onHoursChange?.();
  };

  const emitSyncCalcom = () => {
    if (syncCalcomHidden instanceof HTMLInputElement) {
      syncCalcomHidden.value =
        syncCalcomInput instanceof HTMLInputElement && syncCalcomInput.checked ? 'true' : 'false';
      syncCalcomHidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    onHoursChange?.();
  };

  repeater.addEventListener('change', (event) => {
    const row = event.target.closest('.co-hours-row');
    if (!(row instanceof HTMLElement)) return;
    const closedInput = row.querySelector('.co-hours-closed-input');
    const startSelect = row.querySelector('.co-hours-start');
    const endSelect = row.querySelector('.co-hours-end');
    const closed = closedInput instanceof HTMLInputElement && closedInput.checked;
    if (startSelect instanceof HTMLSelectElement) startSelect.disabled = closed;
    if (endSelect instanceof HTMLSelectElement) endSelect.disabled = closed;
    emitHours();
  });

  if (alwaysInput instanceof HTMLInputElement) {
    alwaysInput.addEventListener('change', emitHours);
  }

  if (syncCalcomInput instanceof HTMLInputElement) {
    syncCalcomInput.addEventListener('change', emitSyncCalcom);
  }

  if (copyBtn instanceof HTMLButtonElement) {
    copyBtn.addEventListener('click', () => {
      const monRow = repeater.querySelector('.co-hours-row[data-day="1"]');
      if (!(monRow instanceof HTMLElement)) return;
      const closed = monRow.querySelector('.co-hours-closed-input')?.checked ?? true;
      const start = monRow.querySelector('.co-hours-start')?.value ?? String(9 * 60);
      const end = monRow.querySelector('.co-hours-end')?.value ?? String(17 * 60);
      for (const day of [2, 3, 4, 5]) {
        const row = repeater.querySelector(`.co-hours-row[data-day="${day}"]`);
        if (!(row instanceof HTMLElement)) continue;
        const closedInput = row.querySelector('.co-hours-closed-input');
        const startSelect = row.querySelector('.co-hours-start');
        const endSelect = row.querySelector('.co-hours-end');
        if (closedInput instanceof HTMLInputElement) closedInput.checked = closed;
        if (startSelect instanceof HTMLSelectElement) {
          startSelect.value = start;
          startSelect.disabled = closed;
        }
        if (endSelect instanceof HTMLSelectElement) {
          endSelect.value = end;
          endSelect.disabled = closed;
        }
      }
      emitHours();
    });
  }

  const form = root.querySelector('#company-form');
  if (form instanceof HTMLFormElement) {
    form.addEventListener('input', () => refreshGoogleListingPreview(root));
    form.addEventListener('change', () => refreshGoogleListingPreview(root));
  }

  refreshGoogleListingPreview(root);
}
