/**
 * Work / projects panel — extracted from os-map-loader.js for maintainability
 * and so the in-app agent can read/edit this file within tool size limits.
 */
import {
  IOS_ICONS,
  iosIcon,
  createIosIconBtn,
  createCenteredListEmpty,
  listSearchSubheader,
  createSlidingPillSelect,
  createPanelBackBtn,
  createPaneSubheader,
  armTitleFocus,
  requestTitleFocus,
  flushTitleFocus,
  matchesListSearch,
  createSwipeRow,
  closeOpenSwipeRow,
  bindSwipeListScroll,
  bindListMultiSelect,
  exitListMultiSelect,
  swipeAgentAction,
  swipeArchiveAction,
  swipeDeleteAction,
  paneDeleteIcon,
  paneShareIcon,
  createAgentBtn,
  setDeBtnLabel,
  getDeBtnLabel,
  updateDeBtnLabel,
  createCopyIconBtn,
  looksLikeHttpUrl,
} from './admin-ui.js?v=20260809b';
import { escHtml, adminFetch, readAdminJson, readApiJson, linkifyPlainText, sidebarAuthorIconHtml, ensureContactAuthorIconsReady, mountPanelSkeleton, skeletonHtml } from './shared.js?v=20260808k';
import { postTitle, postLower, postNew, postTitleLabel } from './post-alias.js?v=20260805a';
import { clientState, clientMapController } from './clients-panel.js?v=20260804d';
import { mountListFilterTabs } from './filter-tabs.js?v=20260807b';
import {
  createDetailChrome,
  createDetailFormScroll,
  createDetailPanelBody,
  mountDetailTabs,
  createDetailPanel,
  showDetailPanel,
} from './detail-tabs.js?v=20260807b';
import {
  openMediaPicker,
  imageMediaFilter,
  projectFileMediaFilter,
  fetchMediaAsFile,
} from './media-picker.js?v=20260807a';

/** Injected by os-map-loader via initWorkPanel(). */
let shell = {};

export function initWorkPanel(deps) {
  shell = deps;
  if (!workSettingsListenerBound) {
    workSettingsListenerBound = true;
    document.addEventListener('reave-app-settings-updated', (ev) => {
      const days = Number(ev?.detail?.recentlyViewedDays);
      if (!Number.isFinite(days) || days < 1) return;
      workState.recentlyViewedDays = Math.min(Math.round(days), 365);
      if (getWorkEditor()?.querySelector('.ch-sidebar')) {
        refreshWorkSidebarList();
      }
    });
  }
}

// ---- extracted from os-map-loader.js:10942-13417 ----

const WORK_STATUS_LABELS = {
  inquiry: 'Prospect',
  active: 'Active',
  archived: 'Archived',
};

const AUDIT_TAG_RE = /^(siri-audit|quick-audit|full-audit)$/i;

function isAuditWorkJob(job) {
  if (!job) return false;
  const tags = Array.isArray(job.tags) ? job.tags : [];
  if (tags.some((t) => AUDIT_TAG_RE.test(String(t || '')))) return true;
  if (String(job.source || '').toLowerCase() === 'siri_audit') return true;
  return false;
}

function workStatusDisplayLabel(job) {
  if (!job) return WORK_STATUS_LABELS.inquiry;
  if (isWorkArchivedStatus(job.status)) return WORK_STATUS_LABELS.archived;
  if (isAuditWorkJob(job)) return 'Audit';
  if ((job.status || 'inquiry') === 'inquiry') return 'Prospect';
  return WORK_STATUS_LABELS[job.status] || job.status || 'Prospect';
}

const WORK_PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const WK_SPINNER_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="42" stroke-dashoffset="15" opacity="0.9"/>' +
  '</svg>';

let workAuditingPollTimer = null;
/** Aborts stale project-detail fetches when the editor re-renders or the user switches projects. */
let workDetailFetchCtrl = null;
const WORK_DETAIL_FETCH_MS = 45000;

const WORK_SOURCE_SUGGESTIONS = ['instagram', 'email', 'referral', 'phone'];

const AUTOSAVE_DEBOUNCE_MS = 650;

const WORK_RECENTLY_VIEWED_KEY = 'reave-work-recently-viewed';
const DEFAULT_RECENTLY_VIEWED_DAYS = 7;
/** Keep local admin view history for up to a year so raising the settings window still works. */
const WORK_VIEW_HISTORY_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

/** Last opened project — restores detail after refresh when the URL has no slug. */
const WORK_LAST_ACTIVE_KEY = 'work:lastActiveSlug-v1';

const TODO_PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

let workState = {
  jobs: [],
  statuses: ['inquiry', 'active', 'archived'],
  priorities: ['low', 'normal', 'high', 'urgent'],
  search: '',
  statusFilter: 'all',
  recentlyViewedDays: DEFAULT_RECENTLY_VIEWED_DAYS,
  activeSlug: null,
  dirty: false,
  draft: null,
  returnToEmailId: null,
  returnToTodoId: null,
  detailTab: 'project',
  auditingSlugs: new Set(),
  auditingProgress: new Map(),
};

let workAutosaveTimer = null;
let workAutosaveFlush = null;
let workSettingsListenerBound = false;

function syncWorkSidebarTitle(slug, title) {
  const job = workState.jobs.find((j) => j.slug === slug);
  if (job) job.title = title;
  const titleEl = document.querySelector(
    `.ch-list-item[data-slug="${CSS.escape(slug)}"] .ch-item-title`,
  );
  if (titleEl) titleEl.textContent = title;
}

function syncWorkSidebarStatus(slug, status) {
  const job = workState.jobs.find((j) => j.slug === slug);
  if (!job || job.status === status) return;
  job.status = status;
  // Status affects the sidebar label, item grouping/archived styling, and
  // filter-tab counts, so re-render the list rather than patching one node.
  refreshWorkSidebarList();
}

function workPayloadUnchanged(payload, draft) {
  if (!draft) return true;
  const tags = Array.isArray(draft.tags) ? draft.tags.join(', ') : (draft.tags || '');
  const payloadTags = (payload.tags || []).join(', ');
  return (
    payload.title === draft.title &&
    (payload.contact_uid || '') === (draft.contact_uid || '') &&
    payload.status === draft.status &&
    payload.priority === (draft.priority || 'normal') &&
    (payload.due_date || '') === (draft.due_date || '') &&
    String(payload.value ?? '') === String(draft.value ?? '') &&
    payloadTags === tags &&
    (payload.source || '') === (draft.source || '') &&
    payload.body === draft.body
  );
}

function scheduleWorkAutosave(getPayload, activeEl) {
  clearTimeout(workAutosaveTimer);
  workAutosaveTimer = setTimeout(() => {
    workAutosaveTimer = null;
    void autosaveWorkQuiet(getPayload, activeEl);
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function flushWorkAutosave() {
  if (workAutosaveTimer) {
    clearTimeout(workAutosaveTimer);
    workAutosaveTimer = null;
  }
  if (typeof workAutosaveFlush === 'function') {
    await workAutosaveFlush();
    workAutosaveFlush = null;
  }
}

async function linkWorkToReturnTodoIfNeeded(slug) {
  const returnTodoId = workState.returnToTodoId;
  if (!returnTodoId) return;
  try {
    const linkRes = await fetch(`/api/todos/${encodeURIComponent(returnTodoId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_slug: slug }),
    });
    const linkData = await readApiJson(linkRes);
    if (!linkRes.ok) throw new Error(linkData.error || `HTTP ${linkRes.status}`);
  } catch (e) {
    console.warn('[work] todo link failed', e);
  }
}

async function autosaveWorkQuiet(getPayload, activeEl) {
  const payload = getPayload();
  if (!payload?.title || !payload?.contact_uid) {
    if (activeEl) shell.setFormFieldState(activeEl, 'invalid');
    return false;
  }
  const isNew = workState.activeSlug === '__new__';
  const slug = isNew ? slugifyTitle(payload.title) : workState.activeSlug;
  if (!slug) {
    if (activeEl) shell.setFormFieldState(activeEl, 'invalid');
    return false;
  }
  const draft = workState.draft;
  if (!isNew && workPayloadUnchanged(payload, draft)) {
    workState.dirty = false;
    return true;
  }
  if (activeEl) shell.setFormFieldState(activeEl, 'saving');
  try {
    let data;
    if (isNew) {
      const res = await fetch('/api/work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ...payload }),
      });
      data = await res.json();
      if (res.status === 409) throw new Error(`A ${postLower(1)} with that title already exists.`);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      workState.activeSlug = slug;
      syncWorkDeepLinkUrl(slug);
      const jobEntry = {
        slug,
        title: data.title || payload.title,
        contact_uid: data.contact_uid || payload.contact_uid,
        contact_name: data.contact_name || payload.contact_name,
        client: data.client,
        status: data.status || payload.status || 'inquiry',
        updated: data.updated || new Date().toISOString(),
      };
      if (!workState.jobs.some((j) => j.slug === slug)) {
        workState.jobs.push(jobEntry);
      }
      workState.jobs = sortWorkJobsForDisplay(workState.jobs);
      shell.clearEditorFooterSave();
      refreshWorkSidebarList();
      void linkWorkToReturnTodoIfNeeded(slug);
    } else {
      const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const idx = workState.jobs.findIndex((j) => j.slug === slug);
      if (idx !== -1) {
        workState.jobs[idx] = {
          ...workState.jobs[idx],
          title: data.title || payload.title,
          contact_name: data.contact_name || payload.contact_name,
          client: data.client,
          status: data.status || payload.status,
          updated: data.updated || new Date().toISOString(),
        };
        workState.jobs = sortWorkJobsForDisplay(workState.jobs);
        refreshWorkSidebarList();
      }
    }
    Object.assign(workState.draft, {
      title: payload.title,
      contact_uid: payload.contact_uid,
      contact_name: payload.contact_name,
      status: payload.status,
      priority: payload.priority,
      due_date: payload.due_date || '',
      value: payload.value ?? '',
      tags: payload.tags || [],
      source: payload.source || '',
      body: payload.body,
    });
    workState.dirty = false;
    syncWorkSidebarTitle(slug, payload.title);
    syncWorkSidebarStatus(slug, payload.status);
    if (activeEl) shell.flashFormFieldSaved(activeEl);
    return true;
  } catch (e) {
    console.warn('[work] autosave failed', e);
    if (activeEl) shell.setFormFieldState(activeEl, 'invalid');
    return false;
  }
}

function isWorkArchivedStatus(status) {
  return status === 'archived' || status === 'done';
}

function workJobLastEdited(job) {
  return job.updated || job.updated_at || job.created || '';
}

function compareWorkJobsByRecency(a, b) {
  const bT = workJobLastEdited(b) || b.slug || '';
  const aT = workJobLastEdited(a) || a.slug || '';
  return bT.localeCompare(aT);
}

function recentlyViewedCutoffMs() {
  const days = Number(workState.recentlyViewedDays);
  const n = Number.isFinite(days) && days > 0 ? days : DEFAULT_RECENTLY_VIEWED_DAYS;
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

function readWorkViewHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(WORK_RECENTLY_VIEWED_KEY) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const cutoff = Date.now() - WORK_VIEW_HISTORY_RETENTION_MS;
    const next = {};
    for (const [slug, ts] of Object.entries(raw)) {
      const n = typeof ts === 'number' ? ts : Date.parse(String(ts));
      if (!slug || !Number.isFinite(n) || n < cutoff) continue;
      next[slug] = n;
    }
    return next;
  } catch {
    return {};
  }
}

function writeWorkViewHistory(map) {
  try {
    localStorage.setItem(WORK_RECENTLY_VIEWED_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

function recordWorkView(slug) {
  if (!slug || slug === '__new__') return;
  const map = readWorkViewHistory();
  map[slug] = Date.now();
  writeWorkViewHistory(map);
}

function workAdminViewedAtMs(slug) {
  if (!slug) return 0;
  return readWorkViewHistory()[slug] || 0;
}

/** Client portal dwell — admin edits / saves must not count as a client view. */
function workJobClientViewedAtMs(job) {
  const raw = job?.last_client_viewed_at || job?.lastClientViewedAt || '';
  if (!raw) return 0;
  const n = Date.parse(String(raw));
  return Number.isFinite(n) ? n : 0;
}

/** Recently Viewed = admin opens (local) or client portal dwell, within the settings window. */
function workJobRecentlyViewedAtMs(job) {
  return Math.max(workAdminViewedAtMs(job?.slug), workJobClientViewedAtMs(job));
}

function isRecentlyViewedJob(job) {
  const at = workJobRecentlyViewedAtMs(job);
  return at > 0 && at >= recentlyViewedCutoffMs();
}

function compareWorkJobsByRecentlyViewed(a, b) {
  const diff = workJobRecentlyViewedAtMs(b) - workJobRecentlyViewedAtMs(a);
  if (diff !== 0) return diff;
  return compareWorkJobsByRecency(a, b);
}

function sortWorkJobsForDisplay(jobs) {
  if (workState.statusFilter === 'recent') {
    return [...jobs].sort(compareWorkJobsByRecentlyViewed);
  }
  return [...jobs].sort(compareWorkJobsByRecency);
}

function filterWorkJobs(jobs, query) {
  return workJobsForStatusFilter(jobs).filter((job) =>
    matchesListSearch(
      query,
      job.title,
      job.contact_name,
      job.client,
      job.status,
      WORK_STATUS_LABELS[job.status],
      job.slug,
      job.tags,
    ),
  );
}

function workStatusTabCounts() {
  const jobs = workState.jobs;
  return {
    all: jobs.length,
    recent: jobs.filter((j) => isRecentlyViewedJob(j)).length,
    audits: jobs.filter((j) => isAuditWorkJob(j) && !isWorkArchivedStatus(j.status)).length,
    prospects: jobs.filter(
      (j) => (j.status || 'inquiry') === 'inquiry' && !isAuditWorkJob(j),
    ).length,
    active: jobs.filter((j) => j.status === 'active').length,
    archived: jobs.filter((j) => isWorkArchivedStatus(j.status)).length,
  };
}

function workJobsForStatusFilter(jobs) {
  const f = workState.statusFilter;
  if (f === 'all') return jobs;
  if (f === 'recent') return jobs.filter((j) => isRecentlyViewedJob(j));
  if (f === 'archived') return jobs.filter((j) => isWorkArchivedStatus(j.status));
  if (f === 'audits') {
    return jobs.filter((j) => isAuditWorkJob(j) && !isWorkArchivedStatus(j.status));
  }
  if (f === 'prospects' || f === 'inquiry') {
    return jobs.filter(
      (j) => (j.status || 'inquiry') === 'inquiry' && !isAuditWorkJob(j),
    );
  }
  return jobs.filter((j) => (j.status || 'inquiry') === f);
}

function workCountForActiveStatusFilter() {
  const counts = workStatusTabCounts();
  return counts[workState.statusFilter] ?? counts.all;
}

function workSearchPlaceholder(count) {
  const n = Number.isFinite(count) ? count : workCountForActiveStatusFilter();
  return `Search ${n} ${postTitle(n === 1 ? 1 : 2)}`;
}

function renderWorkFilterTabs(savedScrollLeft = 0) {
  const counts = workStatusTabCounts();
  return mountListFilterTabs({
    tabs: [
      { id: 'all', label: 'All', count: counts.all },
      { id: 'recent', label: 'Recently Viewed', count: counts.recent },
      { id: 'audits', label: 'Audits', count: counts.audits },
      { id: 'prospects', label: 'Prospects', count: counts.prospects },
      { id: 'active', label: 'Active', count: counts.active },
      { id: 'archived', label: 'Archived', count: counts.archived },
    ],
    activeId: workState.statusFilter === 'inquiry' ? 'prospects' : workState.statusFilter,
    ariaLabel: `${postTitle(1)} status filters`,
    savedScrollLeft,
    onSelect(tabId) {
      workState.statusFilter = tabId;
      const visible = filterWorkJobs(workState.jobs, workState.search);
      let cleared = false;
      if (workState.activeSlug && !visible.some((j) => j.slug === workState.activeSlug)) {
        workState.activeSlug = null;
        workState.draft = null;
        workState.dirty = false;
        syncWorkDeepLinkUrl(null);
        getWorkEditor()?.classList.remove('de-pane-active');
        cleared = true;
      }
      const root = getWorkEditor();
      const sidebar = root?.querySelector('.ch-sidebar');
      if (sidebar) {
        sidebar.querySelector('.wk-visit-plan-link')?.remove();
        const visitPlanLink = renderVisitPlanLink();
        const list = sidebar.querySelector('.ch-list');
        if (visitPlanLink && list) sidebar.insertBefore(visitPlanLink, list);
        else if (visitPlanLink) sidebar.appendChild(visitPlanLink);
      }
      refreshWorkSidebarList();
      syncWorkSidebarActiveState();
      if (cleared) renderWorkPane();
    },
  });
}

/**
 * Entry point to the field visit planner, shown only on the Prospects filter
 * since that is the open-door-knock list (non-audit inquiries).
 */
function renderVisitPlanLink() {
  if (workState.statusFilter !== 'prospects' && workState.statusFilter !== 'inquiry') {
    return null;
  }
  const counts = workStatusTabCounts();
  if (!counts.prospects) return null;

  const link = document.createElement('a');
  link.href = '/admin/visit-plan';
  link.className = 'wk-visit-plan-link';
  link.textContent = `Plan visits to these ${counts.prospects} prospects`;
  return link;
}

function getWorkEditor() { return document.getElementById('work-editor'); }

function workStatusClass(status) {
  const key = isWorkArchivedStatus(status) ? 'archived' : status || 'inquiry';
  return `wk-status wk-status-${key}`;
}

function workStatusLabel(status, job) {
  if (job) return workStatusDisplayLabel(job);
  if (isWorkArchivedStatus(status)) return WORK_STATUS_LABELS.archived;
  return WORK_STATUS_LABELS[status] || status || 'Prospect';
}

function formatWorkCardDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(iso);
  }
}

function formatWorkCardValue(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function createClientWorkCardBullets(job) {
  const bullets = Array.isArray(job.preview_bullets) ? job.preview_bullets.filter(Boolean) : [];
  if (!bullets.length) return null;
  const list = document.createElement('ul');
  list.className = 'cl-job-card-bullets';
  for (const text of bullets.slice(0, 3)) {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  }
  return list;
}

const WORK_CHECKBOX_RE = /^- \[([ xX])\] (.+)$/;

function parseWorkChecklistFromBody(body) {
  const lines = String(body || '').split('\n');
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(WORK_CHECKBOX_RE);
    if (!m) continue;
    items.push({
      lineIndex: i,
      text: m[2].trim(),
      checked: m[1].toLowerCase() === 'x',
    });
  }
  return items;
}

function renderWorkChecklistPanel(mountEl, opts) {
  const { slug, title, clientName, getBody, setBody } = opts;
  const items = parseWorkChecklistFromBody(getBody());
  mountEl.innerHTML = '';
  if (!items.length) {
    mountEl.hidden = false;
    mountEl.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    empty.textContent = 'No action items yet. Add checklist lines in Markup (- [ ] item).';
    mountEl.appendChild(empty);
    return;
  }
  mountEl.hidden = false;

  const section = document.createElement('div');
  section.className = 'wk-checklist-section';

  const head = document.createElement('div');
  head.className = 'wk-checklist-head';
  const label = document.createElement('span');
  label.className = 'wk-checklist-label';
  label.textContent = 'Action items';
  head.appendChild(label);
  const doneCount = items.filter((i) => i.checked).length;
  if (doneCount) {
    const badge = document.createElement('span');
    badge.className = 'wk-checklist-progress';
    badge.textContent = `${doneCount}/${items.length} done`;
    head.appendChild(badge);
  }
  section.appendChild(head);

  const list = document.createElement('ul');
  list.className = 'wk-checklist';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'wk-checklist-item' + (item.checked ? ' wk-checklist-item--done' : '');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wk-checklist-btn';
    btn.setAttribute('aria-pressed', item.checked ? 'true' : 'false');
    btn.title = item.checked ? 'Mark as not done' : 'Mark as done';

    const box = document.createElement('span');
    box.className = 'wk-checklist-box';
    box.setAttribute('aria-hidden', 'true');
    box.textContent = item.checked ? '✓' : '';

    const text = document.createElement('span');
    text.className = 'wk-checklist-text';
    text.textContent = item.text;

    btn.append(box, text);
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      btn.disabled = true;
      const nextChecked = !item.checked;
      fetch(`/api/work/${encodeURIComponent(slug)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineIndex: item.lineIndex, checked: nextChecked }),
      })
        .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (!ok || !data.ok) throw new Error(data.error || 'Toggle failed');
          setBody(data.body);
          renderWorkChecklistPanel(mountEl, opts);
        })
        .catch((err) => {
          shell.osAlert({ title: 'Could not update item', bodyHtml: escHtml(err.message) });
        })
        .finally(() => {
          btn.disabled = false;
        });
    });

    li.appendChild(btn);
    list.appendChild(li);
  }
  section.appendChild(list);

  const doneItems = items.filter((i) => i.checked);
  if (doneItems.length) {
    const bill = document.createElement('div');
    bill.className = 'wk-billable-section';

    const billHead = document.createElement('div');
    billHead.className = 'wk-billable-head';
    const billLabel = document.createElement('span');
    billLabel.className = 'wk-billable-label';
    billLabel.textContent = 'Ready to invoice';
    billHead.appendChild(billLabel);

    const copyBtn = createCopyIconBtn({
      label: 'Copy line descriptions',
      className: 'ios-icon-btn wk-billable-copy',
      getText: () => doneItems.map((i) => i.text).join('\n'),
      onError: () =>
        shell.osAlert({ title: 'Copy failed', bodyHtml: '<p>Could not access clipboard.</p>' }),
    });
    billHead.appendChild(copyBtn);
    bill.appendChild(billHead);

    const billList = document.createElement('ul');
    billList.className = 'wk-billable-list';
    for (const item of doneItems) {
      const li = document.createElement('li');
      li.className = 'wk-billable-item';
      li.textContent = item.text;
      billList.appendChild(li);
    }
    bill.appendChild(billList);

    const hint = document.createElement('p');
    hint.className = 'wk-billable-hint';
    hint.textContent = `Use these as Crater line-item descriptions for ${clientName || title || 'this client'}.`;
    bill.appendChild(hint);

    section.appendChild(bill);
  }

  mountEl.appendChild(section);
}

function hasInstallFeature(id) {
  const features = window.__installConfig?.features;
  return Array.isArray(features) && features.includes(id);
}

function newWorkTimeEntryId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `time-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatWorkTimeHours(total) {
  const rounded = Math.round(total * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

function mountWorkTimeSection(pane, slug, opts = {}) {
  if (!hasInstallFeature('time_tracking')) return;

  const wrap = document.createElement('div');
  wrap.className = 'wk-time-section';
  wrap.innerHTML = skeletonHtml('list', 'Loading time…');
  pane.appendChild(wrap);

  let entries = [];
  let saveTimer = null;
  let saving = false;

  const render = () => {
    wrap.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'wk-time-head';
    const label = document.createElement('span');
    label.className = 'wk-time-label';
    label.textContent = 'Time';
    head.appendChild(label);

    const totalHours = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
    if (totalHours > 0) {
      const total = document.createElement('span');
      total.className = 'wk-time-total';
      total.textContent = `${formatWorkTimeHours(totalHours)}h total`;
      head.appendChild(total);
    }
    wrap.appendChild(head);

    const list = document.createElement('div');
    list.className = 'wk-time-list';

    const scheduleSave = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void saveEntries(), 650);
    };

    const renderRow = (entry, index) => {
      const row = document.createElement('div');
      row.className = 'wk-time-row';

      const hoursInput = document.createElement('input');
      hoursInput.type = 'number';
      hoursInput.className = 'de-input wk-time-hours';
      hoursInput.inputMode = 'decimal';
      hoursInput.min = '0.25';
      hoursInput.max = '9999';
      hoursInput.step = '0.25';
      hoursInput.placeholder = 'hrs';
      hoursInput.value = entry.hours ? String(entry.hours) : '';
      hoursInput.setAttribute('aria-label', 'Hours');

      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.className = 'de-input wk-time-note';
      noteInput.placeholder = 'Note';
      noteInput.maxLength = 500;
      noteInput.value = entry.note || '';
      noteInput.setAttribute('aria-label', 'Note');

      const removeBtn = createIosIconBtn({
        iconKey: 'trash',
        label: 'Remove time row',
        className: 'ios-icon-btn wk-time-remove',
        onClick: () => {
          entries.splice(index, 1);
          render();
          scheduleSave();
        },
      });

      hoursInput.addEventListener('input', () => {
        entry.hours = hoursInput.value;
        scheduleSave();
      });
      hoursInput.addEventListener('blur', () => {
        const parsed = Number(String(entry.hours).trim());
        if (Number.isFinite(parsed) && parsed > 0) {
          entry.hours = Math.round(parsed * 100) / 100;
          hoursInput.value = String(entry.hours);
        }
        void saveEntries();
      });
      noteInput.addEventListener('input', () => {
        entry.note = noteInput.value;
        scheduleSave();
      });
      noteInput.addEventListener('blur', () => void saveEntries());

      row.append(hoursInput, noteInput, removeBtn);
      list.appendChild(row);
    };

    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'de-empty wk-time-empty';
      empty.textContent = 'No time logged yet.';
      list.appendChild(empty);
    } else {
      entries.forEach((entry, index) => renderRow(entry, index));
    }
    wrap.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'wk-time-actions';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'de-btn de-btn-secondary de-btn-with-icon';
    setDeBtnLabel(addBtn, 'Add time', 'plus');
    addBtn.addEventListener('click', () => {
      entries.push({
        id: newWorkTimeEntryId(),
        hours: '',
        note: '',
        createdAt: new Date().toISOString(),
      });
      render();
      const lastHours = wrap.querySelector('.wk-time-hours:last-of-type');
      if (lastHours) lastHours.focus();
    });
    actions.appendChild(addBtn);

    if (saving) {
      const status = document.createElement('span');
      status.className = 'wk-time-save-status';
      status.textContent = 'Saving…';
      actions.appendChild(status);
    }

    wrap.appendChild(actions);

    const billable = entries.filter((e) => Number(e.hours) > 0);
    if (billable.length) {
      const bill = document.createElement('div');
      bill.className = 'wk-billable-section wk-time-billable';

      const billHead = document.createElement('div');
      billHead.className = 'wk-billable-head';
      const billLabel = document.createElement('span');
      billLabel.className = 'wk-billable-label';
      billLabel.textContent = 'Ready to invoice';
      billHead.appendChild(billLabel);

      const copyBtn = createCopyIconBtn({
        label: 'Copy time for invoice',
        className: 'ios-icon-btn wk-billable-copy',
        getText: () =>
          billable
            .map((e) => {
              const note = (e.note || '').trim() || 'Time worked';
              return `${formatWorkTimeHours(Number(e.hours))}h — ${note}`;
            })
            .join('\n'),
        onError: () =>
          shell.osAlert({ title: 'Copy failed', bodyHtml: '<p>Could not access clipboard.</p>' }),
      });
      billHead.appendChild(copyBtn);
      bill.appendChild(billHead);

      const billList = document.createElement('ul');
      billList.className = 'wk-billable-list';
      for (const entry of billable) {
        const li = document.createElement('li');
        li.className = 'wk-billable-item';
        const note = (entry.note || '').trim() || 'Time worked';
        li.textContent = `${formatWorkTimeHours(Number(entry.hours))}h — ${note}`;
        billList.appendChild(li);
      }
      bill.appendChild(billList);

      const hint = document.createElement('p');
      hint.className = 'wk-billable-hint';
      hint.textContent = `Bill ${opts.clientName || opts.title || 'this client'} using hours as quantity on each line item.`;
      bill.appendChild(hint);

      wrap.appendChild(bill);
    }
  };

  const saveEntries = async () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const payload = entries
      .map((e) => ({
        id: e.id,
        hours: Number(String(e.hours).trim()),
        note: (e.note || '').trim(),
        createdAt: e.createdAt,
      }))
      .filter((e) => Number.isFinite(e.hours) && e.hours > 0);

    saving = true;
    render();

    try {
      const res = await fetch(`/api/work/${encodeURIComponent(slug)}/time`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      entries = (data.entries || []).map((e) => ({
        id: e.id,
        hours: e.hours,
        note: e.note || '',
        createdAt: e.createdAt,
      }));
    } catch (e) {
      shell.osAlert({ title: 'Could not save time', bodyHtml: escHtml(e.message) });
    } finally {
      saving = false;
      render();
    }
  };

  fetch(`/api/work/${encodeURIComponent(slug)}/time`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data) => {
      if (!data.ok) throw new Error(data.error || 'Failed to load time');
      entries = (data.entries || []).map((e) => ({
        id: e.id,
        hours: e.hours,
        note: e.note || '',
        createdAt: e.createdAt,
      }));
      render();
    })
    .catch(() => {
      wrap.remove();
    });
}

function createClientWorkCard(job) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'cl-job-card';

  const title = document.createElement('span');
  title.className = 'cl-job-card-title';
  title.textContent = job.title || job.slug || 'Untitled';

  const meta = document.createElement('div');
  meta.className = 'cl-job-card-meta';

  const status = document.createElement('span');
  status.className = workStatusClass(job.status);
  status.textContent = workStatusLabel(job.status, job);
  meta.appendChild(status);

  if (job.created) {
    const created = document.createElement('span');
    created.className = 'cl-job-card-date';
    created.textContent = formatWorkCardDate(job.created);
    meta.appendChild(created);
  }

  if (job.priority && job.priority !== 'normal') {
    const prio = document.createElement('span');
    prio.className = `cl-job-card-priority cl-job-card-priority--${job.priority}`;
    prio.textContent = WORK_PRIORITY_LABELS[job.priority] || job.priority;
    meta.appendChild(prio);
  }

  if (job.due_date) {
    const due = document.createElement('span');
    due.className = 'cl-job-card-due';
    due.textContent = `Due ${job.due_date}`;
    meta.appendChild(due);
  }

  const valueLabel = formatWorkCardValue(job.value);
  if (valueLabel) {
    const val = document.createElement('span');
    val.className = 'cl-job-card-value';
    val.textContent = valueLabel;
    meta.appendChild(val);
  }

  if (job.source) {
    const source = document.createElement('span');
    source.className = 'cl-job-card-source';
    source.textContent = job.source;
    meta.appendChild(source);
  }

  card.appendChild(title);
  const bullets = createClientWorkCardBullets(job);
  if (bullets) card.appendChild(bullets);
  card.appendChild(meta);
  card.addEventListener('click', () => {
    navigateToWork(job.slug);
  });
  return card;
}

const CLIENT_DETAIL_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'branding', label: 'Branding', clientOnly: true },
  { id: 'notes', label: 'Notes' },
  { id: 'projects', label: postTitle(2) },
  { id: 'vault', label: 'Vault' },
  { id: 'analytics', label: 'Analytics', feature: 'analytic_audit', clientOnly: true },
];

/** Branding / Analytics are for business contacts — not personal. */
function contactShowsClientBusinessTabs(kindOrRecord) {
  const kind =
    typeof kindOrRecord === 'string'
      ? kindOrRecord
      : kindOrRecord?.kind || (kindOrRecord?.personal ? 'personal' : 'professional');
  return String(kind || '').trim().toLowerCase() !== 'personal';
}

function clientDetailTabs(opts = {}) {
  const showBusiness = opts.showBusinessTabs !== false;
  return CLIENT_DETAIL_TABS.filter((t) => {
    if (t.feature && !hasInstallFeature(t.feature)) return false;
    if (t.clientOnly && !showBusiness) return false;
    return true;
  });
}

const WORK_DETAIL_TABS = [
  { id: 'project', label: postTitle(1) },
  { id: 'markup', label: 'Markup' },
  { id: 'action-items', label: 'Action Items' },
  { id: 'time', label: 'Time', feature: 'time_tracking' },
  { id: 'files', label: 'Files' },
  { id: 'todo', label: 'To-Do' },
  { id: 'comments', label: 'Comments' },
];

function workDetailTabs(isNew = false) {
  const tabs = WORK_DETAIL_TABS.filter((t) => !t.feature || hasInstallFeature(t.feature));
  if (isNew) return tabs.filter((t) => t.id === 'project' || t.id === 'markup');
  return tabs;
}

function createWorkDetailChrome(pane) {
  return createDetailChrome(pane, 'wk-detail-chrome');
}

function mountWorkDetailTabs(pane, activeTab, onSelect, opts = {}) {
  return mountDetailTabs(pane, {
    tabs: workDetailTabs(opts.isNew),
    activeTab,
    onSelect,
    ariaLabel: `${postTitle(1)} sections`,
    tabClass: 'wk-detail-tab',
    tabsClass: 'wk-detail-tabs',
    dataAttr: 'workTab',
  });
}

function clearWorkDetailScrollBody(scroll) {
  scroll.querySelectorAll('.wk-detail-panel, .wk-detail-loading, .de-loading').forEach((el) => el.remove());
}

function setWorkDetailScrollLoading(scroll, html) {
  clearWorkDetailScrollBody(scroll);
  const loading = document.createElement('div');
  loading.className = 'wk-detail-loading';
  loading.innerHTML = html;
  scroll.appendChild(loading);
}

function showWorkDetailPanel(pane, tabId) {
  showDetailPanel(pane, {
    tabId,
    tabBtnSelector: '.wk-detail-tab',
    panelSelector: '.wk-detail-panel',
    tabDataAttr: 'workTab',
    panelDataAttr: 'workTab',
    scrollSelector: '.re-form-scroll.wk-form-scroll',
  });
}

function createWorkDetailPanel(tabId, activeTab) {
  return createDetailPanel({
    tabId,
    activeTab,
    panelClass: 'wk-detail-panel',
    dataAttr: 'workTab',
  });
}

function syncClientProjectsTabBadge(count) {
  const btn = document.querySelector('#clients-editor .detail-tab[data-client-tab="projects"]');
  if (!btn) return;
  const badge = btn.querySelector('.cl-detail-tab-badge');
  if (!badge) return;
  const n = Math.max(0, Number(count) || 0);
  if (n > 0) {
    badge.hidden = false;
    badge.removeAttribute('aria-hidden');
    badge.textContent = n > 99 ? '99+' : String(n);
  } else {
    badge.hidden = true;
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = '0';
  }
}

function mountClientDetailTabs(pane, activeTab, onSelect, opts = {}) {
  return mountDetailTabs(pane, {
    tabs: clientDetailTabs(opts),
    activeTab,
    onSelect,
    ariaLabel: 'Client sections',
    tabClass: 'cl-detail-tab',
    tabsClass: 'cl-detail-tabs',
    dataAttr: 'clientTab',
    renderTab(btn, tab) {
      if (tab.id === 'projects') {
        btn.innerHTML =
          `${escHtml(tab.label)}` +
          `<span class="footer-nav-badge cl-detail-tab-badge" hidden aria-hidden="true">0</span>`;
      } else {
        btn.textContent = tab.label;
      }
    },
  });
}

function showClientDetailPanel(pane, tabId) {
  showDetailPanel(pane, {
    tabId,
    tabBtnSelector: '.cl-detail-tab',
    panelSelector: '.cl-detail-panel',
    tabDataAttr: 'clientTab',
    panelDataAttr: 'clientTab',
    resetScroll: false,
    onShow(id) {
      if (id === 'profile') {
        setTimeout(() => clientMapController?.resize?.(), 60);
      }
    },
  });
}

function createClientDetailPanel(tabId, activeTab) {
  return createDetailPanel({
    tabId,
    activeTab,
    panelClass: 'cl-detail-panel',
    dataAttr: 'clientTab',
  });
}

let clientVaultSaveTimer = null;

async function saveClientVaultData(uid, data) {
  const res = await fetch(`/api/clients/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  const saved = body.data || data;
  if (clientState.draft) clientState.draft.data = saved;
  return saved;
}

async function flushClientVaultSave() {
  if (clientVaultSaveTimer) {
    clearTimeout(clientVaultSaveTimer);
    clientVaultSaveTimer = null;
  }
  const uid = clientState.activeUid;
  const getData = clientState.vaultGetData;
  if (!uid || uid === '__new__' || typeof getData !== 'function') return;
  try {
    await saveClientVaultData(uid, getData());
  } catch (e) {
    console.warn('[clients] vault flush failed', e);
  }
}

function scheduleClientVaultSave(uid, getData) {
  clearTimeout(clientVaultSaveTimer);
  clientVaultSaveTimer = setTimeout(async () => {
    clientVaultSaveTimer = null;
    try {
      await saveClientVaultData(uid, getData());
    } catch (e) {
      console.warn('[clients] vault save failed', e);
      shell.showChatToast(e.message || 'Vault save failed');
    }
  }, 650);
}

async function mountClientAnalyticsSection(parent, uid) {
  const wrap = createDetailPanelBody('cl-analytics-section');
  wrap.innerHTML = `<p class="dash-empty">Loading analytics…</p>`;
  parent.appendChild(wrap);

  const connectRow = document.createElement('div');
  connectRow.className = 'cl-vault-actions';
  connectRow.style.marginBottom = '12px';
  const connectLink = document.createElement('a');
  connectLink.className = 'prof-btn-secondary';
  connectLink.href = `/api/admin/analytic-audit/connect?contact_uid=${encodeURIComponent(uid)}`;
  connectLink.textContent = 'Connect Google (this client)';
  connectRow.appendChild(connectLink);
  wrap.prepend(connectRow);

  try {
    const res = await fetch(`/api/clients/${encodeURIComponent(uid)}/analytics?range=30`, {
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const d = data.dashboard || {};
    if (!d.configured) {
      const empty = document.createElement('p');
      empty.className = 'dash-empty';
      empty.textContent =
        d.error ||
        'No Plausible site id or GA4 property for this client. Add vault labels “Plausible site id” / “GA4 property id”, or connect Google.';
      wrap.appendChild(empty);
      return;
    }
    if (d.failed || d.error) {
      const err = document.createElement('p');
      err.className = 'dash-empty';
      err.textContent = `Analytics failed: ${d.error || 'unknown error'}`;
      wrap.appendChild(err);
      return;
    }
    const m = d.metrics || {};
    const stats = document.createElement('div');
    stats.className = 'dash-stats';
    stats.innerHTML =
      `<div class="dash-stat dash-stat--muted"><span class="dash-stat-value">${escHtml(String(Math.round(m.visitors?.value || 0)))}</span><span class="dash-stat-label">Visitors</span></div>` +
      `<div class="dash-stat dash-stat--muted"><span class="dash-stat-value">${escHtml(String(Math.round(m.pageviews?.value || 0)))}</span><span class="dash-stat-label">Pageviews</span></div>` +
      `<div class="dash-stat dash-stat--muted"><span class="dash-stat-value">${escHtml(String(d.source || ''))}</span><span class="dash-stat-label">Source</span></div>` +
      `<div class="dash-stat dash-stat--muted"><span class="dash-stat-value">${escHtml(String(d.siteId || '—'))}</span><span class="dash-stat-label">Property</span></div>`;
    wrap.appendChild(stats);
  } catch (e) {
    const err = document.createElement('p');
    err.className = 'dash-empty';
    err.textContent = e.message || 'Could not load client analytics';
    wrap.appendChild(err);
  }
}

function mountClientVaultSection(parent, uid, entries, opts = {}) {
  const wrap = createDetailPanelBody('cl-vault-section');

  const header = document.createElement('div');
  header.className = 'cl-vault-header';
  const title = document.createElement('div');
  title.className = 'cl-vault-title';
  title.textContent = 'Credentials & handoff data';
  header.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'cl-vault-actions';

  const portalUrl = (clientState.draft?.portal_url || '').trim();
  const submitUrl = portalUrl ? `${portalUrl}${portalUrl.includes('?') ? '&' : '?'}submit` : '';

  if (submitUrl) {
    const copySubmitBtn = createCopyIconBtn({
      label: 'Copy submit link',
      className: 'ios-icon-btn cl-vault-submit-copy',
      getText: () => submitUrl,
      onError: () => shell.showChatToast?.('Copy failed — check browser permissions'),
    });
    actions.appendChild(copySubmitBtn);
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'de-btn';
  addBtn.textContent = 'Add entry';
  actions.appendChild(addBtn);
  header.appendChild(actions);
  wrap.appendChild(header);

  const hint = document.createElement('p');
  hint.className = 'cl-vault-hint';
  hint.textContent =
    'Passwords, DNS, hosting, and other account details shown on the client portal Data tab. The submit link lets clients add entries themselves.';
  wrap.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'cl-vault-list';
  wrap.appendChild(list);
  parent.appendChild(wrap);

  let rows = (entries || []).map((entry) => ({ ...entry }));

  function readRowsFromDom() {
    return rows.map((row, index) => {
      const card = list.children[index];
      if (!card) return row;
      const getVal = (field) => card.querySelector(`[data-field="${field}"]`)?.value?.trim() || '';
      const next = { label: getVal('label') };
      const value = getVal('value');
      const username = getVal('username');
      const password = getVal('password');
      const url = getVal('url');
      if (value) next.value = value;
      if (username) next.username = username;
      if (password) next.password = password;
      if (url) next.url = url;
      return next;
    }).filter((entry) => entry.label);
  }

  function queueSave() {
    scheduleClientVaultSave(uid, readRowsFromDom);
  }

  clientState.vaultGetData = readRowsFromDom;

  function appendVaultField(card, label, field, value, opts = {}) {
    const row = document.createElement('div');
    row.className = 'cl-vault-row';
    const key = document.createElement('span');
    key.className = 'cl-vault-row-label';
    key.textContent = opts.required ? `${label} *` : label;
    const input = document.createElement('input');
    input.className = 'de-input' + (opts.secret ? ' cl-vault-secret' : '');
    input.dataset.field = field;
    input.value = value || '';
    input.placeholder = opts.placeholder || '';
    if (opts.required) {
      input.required = true;
      input.setAttribute('aria-required', 'true');
    }
    if (opts.type) input.type = opts.type;
    row.appendChild(key);
    row.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'cl-vault-row-actions';
    if (opts.secret) {
      const revealBtn = createIosIconBtn({
        iconKey: 'eye',
        label: 'Show password',
        className: 'ios-icon-btn cl-vault-reveal',
        onClick: (btn) => {
          const masked = input.classList.toggle('cl-vault-secret-masked');
          btn.innerHTML = masked ? IOS_ICONS.eye : IOS_ICONS['eye-off'];
          btn.setAttribute('aria-label', masked ? 'Show password' : 'Hide password');
          btn.title = masked ? 'Show password' : 'Hide password';
        },
      });
      input.classList.add('cl-vault-secret-masked');
      actions.appendChild(revealBtn);
    }
    if (opts.linkWhenUrl) {
      const linkBtn = createIosIconBtn({
        iconKey: 'link',
        label: 'Open link',
        className: 'ios-icon-btn cl-vault-link',
        onClick: () => {
          const href = looksLikeHttpUrl(input.value);
          if (href) window.open(href, '_blank', 'noopener,noreferrer');
        },
      });
      const syncLinkVisibility = () => {
        const href = looksLikeHttpUrl(input.value);
        linkBtn.hidden = !href;
        linkBtn.disabled = !href;
      };
      syncLinkVisibility();
      input.addEventListener('input', syncLinkVisibility);
      actions.appendChild(linkBtn);
    }
    const copyBtn = createCopyIconBtn({
      label: `Copy ${label.toLowerCase()}`,
      className: 'ios-icon-btn cl-vault-copy',
      getText: () => input.value,
      onError: () => shell.showChatToast?.('Copy failed — check browser permissions'),
    });
    actions.appendChild(copyBtn);
    row.appendChild(actions);
    input.addEventListener('input', queueSave);
    input.addEventListener('blur', () => {
      void saveClientVaultData(uid, readRowsFromDom()).catch((e) => {
        shell.showChatToast(e.message || 'Vault save failed');
      });
    });
    card.appendChild(row);
    return input;
  }

  function renderVaultList() {
    list.innerHTML = '';
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cl-vault-empty';
      empty.textContent = 'No vault entries yet. Add one or send the client submit link.';
      list.appendChild(empty);
      return;
    }

    rows.forEach((entry, index) => {
      const card = document.createElement('div');
      card.className = 'cl-vault-card';

      const head = document.createElement('div');
      head.className = 'cl-vault-card-head';
      const cardTitle = document.createElement('div');
      cardTitle.className = 'cl-vault-card-title';
      cardTitle.textContent = entry.label || `Entry ${index + 1}`;
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'de-btn de-btn-secondary';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        rows.splice(index, 1);
        renderVaultList();
        try {
          await saveClientVaultData(uid, readRowsFromDom());
        } catch (e) {
          shell.showChatToast(e.message || 'Vault save failed');
        }
      });
      head.appendChild(cardTitle);
      head.appendChild(deleteBtn);
      card.appendChild(head);

      const labelInput = appendVaultField(card, 'Label', 'label', entry.label, {
        placeholder: 'e.g. WordPress admin',
        required: true,
      });
      appendVaultField(card, 'Data', 'url', entry.url, {
        placeholder: 'URL, API key, token…',
        linkWhenUrl: true,
      });
      appendVaultField(card, 'Username', 'username', entry.username);
      appendVaultField(card, 'Password', 'password', entry.password, { secret: true });
      appendVaultField(card, 'Notes', 'value', entry.value, { placeholder: 'Other details' });
      labelInput.addEventListener('input', () => {
        cardTitle.textContent = labelInput.value.trim() || `Entry ${index + 1}`;
      });
      list.appendChild(card);
    });
  }

  addBtn.addEventListener('click', () => {
    rows.push({ label: '', url: '', username: '', password: '', value: '' });
    renderVaultList();
    const firstInput = list.querySelector('[data-field="label"]');
    firstInput?.focus();
  });

  renderVaultList();
  if (typeof opts.onUpdate === 'function') opts.onUpdate(rows);
  return wrap;
}

function renderClientWorkSection(jobsWrap, jobs) {
  jobsWrap.innerHTML = '';
  syncClientProjectsTabBadge(jobs.length);
  if (jobs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty cl-jobs-empty';
    empty.textContent = `No active ${postLower(2)} for this client.`;
    jobsWrap.appendChild(empty);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'cl-jobs-grid';
  for (const job of jobs) {
    grid.appendChild(createClientWorkCard(job));
  }
  jobsWrap.appendChild(grid);
}

function mountClientWorkSection(pane, uid) {
  const jobsWrap = createDetailPanelBody('cl-jobs-section');
  jobsWrap.innerHTML = skeletonHtml('list', `Loading ${postLower(2)}…`);
  pane.appendChild(jobsWrap);
  syncClientProjectsTabBadge(0);
  fetch(`/api/work?contact_uid=${encodeURIComponent(uid)}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((jobData) => {
      const jobs = (jobData.jobs || [])
        .filter((j) => j.status !== 'archived')
        .sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
      renderClientWorkSection(jobsWrap, jobs);
    })
    .catch(() => {
      jobsWrap.innerHTML = '';
    });
}

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function loadWorkTab(opts = {}) {
  const root = getWorkEditor();
  if (!root) return;
  await ensureContactAuthorIconsReady();
  const deepSlug = opts.workSlug || pendingWorkDeepLinkSlug || parseWorkDeepLinkFromUrl();
  const prevActiveSlug = workState.activeSlug;
  const preserveNew =
    workState.activeSlug === '__new__' &&
    workState.draft &&
    (opts.workSlug === '__new__' || pendingWorkDeepLinkSlug === '__new__');
  const keepDetailOpen =
    !preserveNew &&
    prevActiveSlug &&
    prevActiveSlug !== '__new__' &&
    deepSlug === prevActiveSlug &&
    !!root.querySelector('.wk-detail-chrome');
  if (!preserveNew && !keepDetailOpen) {
    mountPanelSkeleton(root, 'list', 'Loading work…', { contentSelector: '.ch-sidebar' });
  }
  try {
    const [res, settingsRes] = await Promise.all([
      adminFetch('/api/work'),
      adminFetch('/api/admin/settings').catch(() => null),
    ]);
    const data = await readAdminJson(res, postTitle(2));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (settingsRes?.ok) {
      try {
        const settingsData = await settingsRes.json();
        const days = Number(settingsData?.settings?.recentlyViewedDays);
        if (Number.isFinite(days) && days >= 1) {
          workState.recentlyViewedDays = Math.min(Math.round(days), 365);
        }
      } catch {
        /* keep default */
      }
    }
    workState.jobs = sortWorkJobsForDisplay(data.jobs || []);
    workState.statuses = data.statuses || workState.statuses;
    workState.priorities = data.priorities || workState.priorities;
    if (workState.statusFilter === 'done') workState.statusFilter = 'archived';
  } catch (e) {
    if (e.message === 'Session expired') {
      root.innerHTML = `<div class="de-loading de-error">Session expired — sign in again to continue.</div>`;
      return;
    }
    if (!deepSlug) {
      root.innerHTML = `<div class="de-loading de-error">Failed to load: ${escHtml(e.message)}</div>`;
      return;
    }
    console.warn('[work] project list unavailable', e);
  }
  pendingWorkDeepLinkSlug = null;

  let restoreSlug = deepSlug || null;
  if (!restoreSlug && preserveNew) restoreSlug = '__new__';
  if (!restoreSlug && prevActiveSlug && prevActiveSlug !== '__new__') {
    restoreSlug = prevActiveSlug;
  }
  if (!restoreSlug) restoreSlug = readWorkLastActiveSlug();
  if (
    restoreSlug &&
    restoreSlug !== '__new__' &&
    workState.jobs.length > 0 &&
    !workState.jobs.some((j) => j.slug === restoreSlug)
  ) {
    restoreSlug = null;
    clearWorkLastActiveSlug();
  }

  workState.activeSlug = restoreSlug || null;
  workState.dirty = false;
  if (restoreSlug && restoreSlug !== '__new__' && restoreSlug !== prevActiveSlug) {
    recordWorkView(restoreSlug);
  }
  if (!preserveNew) workState.draft = null;
  shell.clearEditorFooterSave();
  if (workState.activeSlug && workState.activeSlug !== '__new__') {
    syncWorkDeepLinkUrl(workState.activeSlug);
  } else if (workState.activeSlug === '__new__') {
    syncWorkDeepLinkUrl('__new__');
  } else {
    syncWorkDeepLinkUrl(null);
    getWorkEditor()?.classList.remove('de-pane-active');
  }
  if (keepDetailOpen && workState.activeSlug === prevActiveSlug) {
    refreshWorkSidebarList();
    applyWorkAuditingIndicators();
    return;
  }
  renderWorkEditor();
  activateWorkPaneOnMobile();
}

function beginNewProjectDrawer() {
  shell.beginCreateDrawer({
    key: 'work',
    title: postNew(),
    submitLabel: 'Add',
    onSubmit: async () => {
      const pane = shell.getCreateDrawerPane();
      if (!pane?.querySelector('.de-header-title-input')?.value.trim()) {
        shell.flagCreateDrawerTitleMissing();
        return;
      }
      // The form's save path is its autosave, so flushing it creates the project.
      await flushWorkAutosave();
      const slug = workState.activeSlug;
      if (!slug || slug === '__new__') {
        await shell.osAlert({
          title: 'Pick a client',
          bodyHtml: `A ${postLower(1)} needs a client before it can be created.`,
        });
        return;
      }
      shell.finishCreateDrawer();
      workState.draft = null;
      getWorkEditor()?.classList.add('de-pane-active');
      await openWork(slug);
    },
    onDismiss: () => {
      const returnTodoId = workState.returnToTodoId;
      workState.activeSlug = null;
      workState.draft = null;
      workState.returnToTodoId = null;
      syncWorkDeepLinkUrl(null);
      getWorkEditor()?.classList.remove('de-pane-active');
      if (returnTodoId) shell.navigateToTodo(returnTodoId);
      else {
        syncWorkSidebarActiveState();
        renderWorkPane();
      }
    },
  });
}

function startNewProject() {
  shell.armTitleFocus('work');
  beginNewProjectDrawer();
  workState.returnToEmailId = null;
  workState.returnToTodoId = null;
  workState.detailTab = 'project';
  workState.activeSlug = '__new__';
  workState.dirty = false;
  workState.draft = {
    title: '',
    contact_uid: '',
    contact_name: '',
    status: 'inquiry',
    priority: 'normal',
    due_date: '',
    value: '',
    tags: '',
    source: '',
    body: '',
  };
  syncWorkDeepLinkUrl('__new__');
  syncWorkSidebarActiveState();
  renderWorkPane();
}

function fillWorkSidebarList(list) {
  exitListMultiSelect(list);
  const { search } = workState;
  const filtered = filterWorkJobs(workState.jobs, search);
  const visibleJobs = sortWorkJobsForDisplay(filtered);
  list.innerHTML = '';
  for (const job of visibleJobs) {
    list.appendChild(createWorkSwipeRow(job));
  }
  if (visibleJobs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'de-empty';
    if (search.trim()) {
      empty.textContent = 'No matches.';
    } else if (workState.statusFilter === 'recent') {
      const days = workState.recentlyViewedDays || DEFAULT_RECENTLY_VIEWED_DAYS;
      empty.textContent = `No ${postLower(2)} viewed in the last ${days} day${days === 1 ? '' : 's'}.`;
    } else {
      empty.textContent = `No ${postLower(2)} yet.`;
    }
    list.appendChild(empty);
  }
}

function refreshWorkSidebarList() {
  const root = getWorkEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) {
    renderWorkEditor();
    return;
  }
  const searchInput = root.querySelector('.panel-list-search');
  if (searchInput) {
    searchInput.placeholder = workSearchPlaceholder(filterWorkJobs(workState.jobs, workState.search).length);
  }
  fillWorkSidebarList(list);
  syncWorkSidebarActiveState();
}

function syncWorkSidebarActiveState(opts = {}) {
  const { scroll = false } = opts;
  const root = getWorkEditor();
  if (!root) return;
  let activeEl = null;
  root.querySelectorAll('.ch-sidebar .ch-list-item').forEach((el) => {
    const isActive = el.dataset.slug === workState.activeSlug;
    el.classList.toggle('active', isActive);
    if (isActive) {
      el.setAttribute('aria-current', 'page');
      activeEl = el;
    } else {
      el.removeAttribute('aria-current');
    }
  });
  if (scroll && activeEl) {
    const list = root.querySelector('.ch-sidebar .ch-list');
    if (list) {
      requestAnimationFrame(() => shell.scrollSidebarListItemIntoView(list, activeEl));
    }
  }
}

function renderWorkPane() {
  const root = getWorkEditor();
  if (!root) return;
  let pane = root.querySelector('.de-pane');
  if (!pane) {
    renderWorkEditor();
    return;
  }
  const { activeSlug } = workState;

  if (activeSlug === '__new__') {
    renderNewWorkForm(pane);
    shell.mountCreateDrawerChrome(pane);
  } else if (activeSlug) {
    renderEditWorkForm(pane);
  } else {
    shell.clearEditorFooterSave();
    pane.innerHTML = '';
    shell.appendEmptyDetailPane(pane, {
      mapKey: 'work',
      iconName: 'briefcase',
      bodyHtml: `<p>Select a ${postLower(1)} to edit, or create a new one.</p>`,
      onCreate: () => startNewProject(),
    });
  }
  shell.flushTitleFocus('work');
}

function renderWorkEditor() {
  const root = getWorkEditor();
  if (!root) return;
  const savedSidebarScroll = shell.captureSidebarListScroll(root);
  const savedFilterScroll = shell.captureFilterTabsScroll(root);
  const { jobs, search } = workState;
  root.innerHTML = '';

  const sidebar = document.createElement('div');
  sidebar.className = 'ch-sidebar';

  const countForTab = filterWorkJobs(jobs, search).length;
  const subheader = listSearchSubheader({
    itemCount: countForTab,
    search: {
      value: search,
      placeholder: workSearchPlaceholder(countForTab),
      onInput: (value) => {
        workState.search = value;
        refreshWorkSidebarList();
      },
    },
    below: renderWorkFilterTabs(savedFilterScroll),
  });
  if (subheader) sidebar.appendChild(subheader.el);

  const visitPlanLink = renderVisitPlanLink();
  if (visitPlanLink) sidebar.appendChild(visitPlanLink);

  const list = document.createElement('div');
  list.className = 'ch-list';
  bindSwipeListScroll(list);
  bindListMultiSelect(list, {
    onBulkArchive: bulkArchiveWork,
    onBulkDelete: bulkDeleteWork,
  });
  fillWorkSidebarList(list);
  sidebar.appendChild(list);
  root.appendChild(sidebar);

  const pane = document.createElement('div');
  pane.className = 'de-pane';
  root.appendChild(pane);
  renderWorkPane();
  shell.finishSidebarListScroll(root, savedSidebarScroll);
}

function workStatusPillOptions() {
  return workState.statuses.map((s) => ({ value: s, label: WORK_STATUS_LABELS[s] || s }));
}

function workPriorityPillOptions() {
  return workState.priorities.map((p) => ({ value: p, label: WORK_PRIORITY_LABELS[p] || p }));
}

function appendWorkMetaFields(fields, draft, markDirty) {
  const priorityPill = createSlidingPillSelect({
    label: 'Priority',
    value: draft?.priority || 'normal',
    options: workPriorityPillOptions(),
    ariaLabel: 'Priority',
    onChange: markDirty || undefined,
  });
  fields.appendChild(priorityPill.el);

  const dueLabel = document.createElement('label');
  dueLabel.className = 'de-label';
  dueLabel.textContent = 'Due date';
  const dueInput = document.createElement('input');
  dueInput.className = 'de-input';
  dueInput.type = 'date';
  dueInput.value = draft?.due_date || '';
  dueLabel.appendChild(dueInput);
  fields.appendChild(dueLabel);

  const valueLabel = document.createElement('label');
  valueLabel.className = 'de-label';
  valueLabel.textContent = 'Value ($)';
  const valueInput = document.createElement('input');
  valueInput.className = 'de-input';
  valueInput.type = 'number';
  valueInput.min = '0';
  valueInput.step = '0.01';
  valueInput.placeholder = '0.00';
  valueInput.value = draft?.value != null && draft?.value !== '' ? String(draft.value) : '';
  valueLabel.appendChild(valueInput);
  fields.appendChild(valueLabel);

  const tagsLabel = document.createElement('label');
  tagsLabel.className = 'de-label';
  tagsLabel.textContent = 'Tags';
  const tagsInput = document.createElement('input');
  tagsInput.className = 'de-input';
  tagsInput.placeholder = 'web-design, seo, hosting';
  tagsInput.value = Array.isArray(draft?.tags) ? draft.tags.join(', ') : (draft?.tags || '');
  tagsLabel.appendChild(tagsInput);
  fields.appendChild(tagsLabel);

  const sourceLabel = document.createElement('label');
  sourceLabel.className = 'de-label';
  sourceLabel.textContent = 'Lead source';
  const sourceInput = document.createElement('input');
  sourceInput.className = 'de-input';
  sourceInput.placeholder = 'instagram, email, referral, phone';
  sourceInput.setAttribute('list', 'wk-source-suggestions');
  sourceInput.value = draft?.source || '';
  sourceLabel.appendChild(sourceInput);
  fields.appendChild(sourceLabel);
  let datalist = document.getElementById('wk-source-suggestions');
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = 'wk-source-suggestions';
    for (const s of WORK_SOURCE_SUGGESTIONS) {
      const opt = document.createElement('option');
      opt.value = s;
      datalist.appendChild(opt);
    }
    document.body.appendChild(datalist);
  }

  if (markDirty) {
    dueInput.addEventListener('input', () => markDirty(dueInput));
    valueInput.addEventListener('input', () => markDirty(valueInput));
    tagsInput.addEventListener('input', () => markDirty(tagsInput));
    sourceInput.addEventListener('input', () => markDirty(sourceInput));
    dueInput.addEventListener('change', () => markDirty(dueInput));
    valueInput.addEventListener('change', () => markDirty(valueInput));
  }

  return {
    getPayload() {
      const valueRaw = valueInput.value.trim();
      return {
        priority: priorityPill.getValue(),
        due_date: dueInput.value.trim() || null,
        value: valueRaw === '' ? null : Number(valueRaw),
        tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
        source: sourceInput.value.trim(),
      };
    },
  };
}

let workClientSearchTimer = null;

/** Extract a client search hint from titles like "Reggie / Solid Builders". */
function extractClientHintFromTitle(title) {
  const trimmed = String(title || '').trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s*[\/|—–-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  return parts[parts.length - 1];
}

function workClientSubline(c) {
  const bits = [];
  if (c.matchReason === 'company' && c.company) bits.push(c.company);
  else if (c.company) bits.push(c.company);
  if (c.email) bits.push(c.email);
  if (!bits.length && c.phone) bits.push(c.phone);
  if (!bits.length) bits.push(c.uid.slice(0, 8) + '…');
  return bits.join(' · ');
}

/**
 * Client combobox: search existing contacts, pick one, or add new inline.
 * Returns { getPayload, isValid } — save uses contact_uid (no resolve on save).
 */
function mountWorkClientPicker(parent, initial, onChange, opts = {}) {
  const readOnly = opts.readOnly === true;
  let selected = initial?.contact_uid
    ? {
        uid: initial.contact_uid,
        name: initial.contact_name || initial.client || '',
        logoUrl: initial.contact_logo_url || '',
        email: initial.contact_email || '',
        phone: initial.contact_phone || '',
      }
    : null;
  let changing = false;
  let showingNew = false;

  const wrap = document.createElement('div');
  wrap.className = 'wk-client-picker' + (readOnly ? ' wk-client-picker--readonly' : '');

  let profileLink = null;
  let clientNameEl = null;
  let emailActionBtn = null;
  let callActionBtn = null;
  let smsActionBtn = null;
  let readonlyBar = null;
  const selectedEl = document.createElement('div');
  selectedEl.className = 'wk-client-selected';
  const selectedName = document.createElement('span');
  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'de-btn de-btn-ghost';
  changeBtn.textContent = 'Change';

  if (readOnly) {
    readonlyBar = document.createElement('div');
    readonlyBar.className = 'wk-client-readonly-bar';

    profileLink = document.createElement('button');
    profileLink.type = 'button';
    profileLink.className = 'wk-client-name-link';

    clientNameEl = document.createElement('span');
    clientNameEl.className = 'wk-client-name';
    profileLink.appendChild(clientNameEl);

    const nameArrow = document.createElement('span');
    nameArrow.className = 'wk-client-name-arrow';
    nameArrow.setAttribute('aria-hidden', 'true');
    nameArrow.innerHTML = IOS_ICONS['chevron-right'];
    profileLink.appendChild(nameArrow);

    profileLink.addEventListener('click', () => {
      if (selected?.uid) {
        shell.navigateToClient(selected.uid, { fromWorkSlug: workState.activeSlug });
      }
    });

    readonlyBar.appendChild(profileLink);

    const actions = document.createElement('div');
    actions.className = 'wk-client-readonly-actions';

    emailActionBtn = createIosIconBtn({
      iconKey: 'mail',
      label: 'Email client',
      className: 'ios-icon-btn wk-client-action-btn',
      onClick: () => {
        if (selected?.email) window.location.href = `mailto:${selected.email}`;
      },
    });
    actions.appendChild(emailActionBtn);

    callActionBtn = createIosIconBtn({
      iconKey: 'phone',
      label: 'Call client',
      className: 'ios-icon-btn wk-client-action-btn',
      onClick: () => {
        if (selected?.phone) window.location.href = `tel:${selected.phone.replace(/[^\d+]/g, '')}`;
      },
    });
    actions.appendChild(callActionBtn);

    smsActionBtn = createIosIconBtn({
      iconKey: 'message',
      label: 'Text client',
      className: 'ios-icon-btn wk-client-action-btn',
      onClick: () => {
        if (selected?.phone) window.location.href = `sms:${selected.phone.replace(/[^\d+]/g, '')}`;
      },
    });
    actions.appendChild(smsActionBtn);

    readonlyBar.appendChild(actions);
    wrap.appendChild(readonlyBar);
  } else {
    selectedEl.appendChild(selectedName);
    selectedEl.appendChild(changeBtn);
    wrap.appendChild(selectedEl);
  }

  const searchWrap = document.createElement('div');
  searchWrap.className = 'wk-client-search-wrap';
  const searchLabel = document.createElement('label');
  searchLabel.className = 'de-label';
  searchLabel.textContent = 'Search.';
  const searchInput = document.createElement('input');
  searchInput.className = 'de-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Clients…';
  searchInput.autocomplete = 'off';
  searchLabel.appendChild(searchInput);
  searchWrap.appendChild(searchLabel);
  const dropdown = document.createElement('div');
  dropdown.className = 'wk-client-dropdown';
  dropdown.style.display = 'none';
  searchWrap.appendChild(dropdown);
  wrap.appendChild(searchWrap);

  const newForm = document.createElement('div');
  newForm.className = 'wk-client-new';
  newForm.style.display = 'none';
  newForm.innerHTML = '<span class="de-label">New client</span>';
  const newName = document.createElement('input');
  newName.className = 'de-input';
  newName.placeholder = 'Full name (required)';
  const newEmail = document.createElement('input');
  newEmail.className = 'de-input';
  newEmail.type = 'email';
  newEmail.placeholder = 'Email (optional)';
  const newActions = document.createElement('div');
  newActions.className = 'wk-client-new-actions';
  const newCancel = document.createElement('button');
  newCancel.type = 'button';
  newCancel.className = 'de-btn de-btn-ghost';
  newCancel.textContent = 'Cancel';
  const newSave = document.createElement('button');
  newSave.type = 'button';
  newSave.className = 'de-btn de-btn-primary';
  newSave.textContent = 'Create client';
  newActions.appendChild(newCancel);
  newActions.appendChild(newSave);
  newForm.appendChild(newName);
  newForm.appendChild(newEmail);
  newForm.appendChild(newActions);
  wrap.appendChild(newForm);

  parent.appendChild(wrap);

  function syncReadOnlyClientLink() {
    const has = !!selected?.uid;
    searchWrap.style.display = 'none';
    newForm.style.display = 'none';
    readonlyBar.style.display = !showingNew && !changing ? 'flex' : 'none';

    const name = selected?.name || 'No client';
    clientNameEl.textContent = name;

    profileLink.disabled = !has;
    profileLink.setAttribute('aria-label', has ? `Open ${name} profile` : 'No client linked');
    if (has) profileLink.title = `Open ${name} profile`;
    else profileLink.removeAttribute('title');

    const email = selected?.email || '';
    emailActionBtn.disabled = !email;
    emailActionBtn.title = email ? `Email ${name} at ${email}` : 'No email on file';

    const phone = selected?.phone || '';
    callActionBtn.disabled = !phone;
    callActionBtn.title = phone ? `Call ${name} at ${phone}` : 'No phone on file';

    smsActionBtn.disabled = !phone;
    smsActionBtn.title = phone ? `Text ${name} at ${phone}` : 'No phone on file';
  }

  function syncView() {
    const has = !!selected?.uid;
    if (readOnly) {
      syncReadOnlyClientLink();
      return;
    }
    selectedEl.style.display = has && !showingNew && !changing ? 'flex' : 'none';
    searchWrap.style.display = showingNew ? 'none' : changing || !has ? 'block' : 'none';
    newForm.style.display = showingNew ? 'flex' : 'none';
    if (has) selectedName.textContent = selected.name;
  }

  function exitChangeMode() {
    changing = false;
    searchInput.value = '';
    dropdown.style.display = 'none';
    syncView();
  }

  function pick(client) {
    const prevUid = selected?.uid || '';
    selected = { uid: client.uid, name: client.name, logoUrl: client.logoUrl || '' };
    showingNew = false;
    changing = false;
    dropdown.style.display = 'none';
    searchInput.value = '';
    syncView();
    if (client.uid !== prevUid) onChange?.();
  }

  function renderDropdown(clients, query) {
    dropdown.innerHTML = '';
    for (const c of clients) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-client-option';
      const matchTag = c.matchReason === 'company'
        ? `<span class="wk-client-match-tag">company match</span>`
        : '';
      btn.innerHTML = `${escHtml(c.name)}${matchTag}<span class="sub">${escHtml(workClientSubline(c))}</span>`;
      btn.addEventListener('click', () => pick(c));
      dropdown.appendChild(btn);
    }
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'wk-client-option wk-client-add';
    addBtn.textContent = query.trim() ? `+ Add "${query.trim()}" as new client` : '+ Add new client';
    addBtn.addEventListener('click', () => beginAddNewClient(query.trim()));
    dropdown.appendChild(addBtn);
    dropdown.style.display = 'block';
  }

  async function resolveClientMatches(name) {
    if (!name?.trim()) return null;
    const res = await fetch('/api/clients/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), kind: 'work' }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    return data;
  }

  async function beginAddNewClient(name) {
    const resolved = await resolveClientMatches(name);
    if (resolved?.match === 'likely' && resolved.contact?.uid) {
      const label = resolved.contact.company
        ? `${resolved.contact.name} (${resolved.contact.company})`
        : resolved.contact.name;
      if (confirm(`"${label}" already exists. Use this client instead of creating a new one?`)) {
        pick(resolved.contact);
        return;
      }
    }
    if (resolved?.match === 'possible' && Array.isArray(resolved.candidates) && resolved.candidates.length) {
      renderDropdown(resolved.candidates, name);
      changing = true;
      showingNew = false;
      searchInput.value = name;
      syncView();
      searchInput.focus();
      return;
    }
    showingNew = true;
    newName.value = name;
    newEmail.value = '';
    dropdown.style.display = 'none';
    syncView();
    newName.focus();
  }

  async function fetchClients(q) {
    const params = new URLSearchParams({ kind: 'work' });
    if (q?.trim()) params.set('q', q.trim());
    params.set('limit', '20');
    const res = await fetch(`/api/clients?${params}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.clients || [];
  }

  function scheduleSearch() {
    clearTimeout(workClientSearchTimer);
    workClientSearchTimer = setTimeout(async () => {
      try {
        const clients = await fetchClients(searchInput.value);
        renderDropdown(clients, searchInput.value);
      } catch (e) {
        dropdown.innerHTML = `<div class="de-empty">${escHtml(e.message)}</div>`;
        dropdown.style.display = 'block';
      }
    }, 250);
  }

  changeBtn.addEventListener('click', () => {
    if (readOnly) return;
    showingNew = false;
    changing = true;
    syncView();
    searchInput.focus();
    scheduleSearch();
  });

  searchInput.addEventListener('focus', () => scheduleSearch());
  searchInput.addEventListener('input', () => scheduleSearch());
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!wrap.contains(document.activeElement) && changing && !showingNew) exitChangeMode();
    }, 0);
  });
  shell.attachAutosuggestKeyboardNav(searchInput, dropdown, {
    optionSelector: '.wk-client-option',
    onClose: () => {
      dropdown.style.display = 'none';
      if (changing && !showingNew) exitChangeMode();
    },
  });

  newCancel.addEventListener('click', () => {
    showingNew = false;
    changing = !selected?.uid;
    syncView();
    if (changing) searchInput.focus();
  });

  newSave.addEventListener('click', async () => {
    const name = newName.value.trim();
    if (!name) { alert('Enter a client name.'); return; }
    newSave.disabled = true;
    try {
      const resolved = await resolveClientMatches(name);
      if (resolved?.match === 'likely' && resolved.contact?.uid) {
        const label = resolved.contact.company
          ? `${resolved.contact.name} (${resolved.contact.company})`
          : resolved.contact.name;
        if (confirm(`"${label}" already exists. Use this client instead of creating a new one?`)) {
          pick(resolved.contact);
          return;
        }
      }
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: newEmail.value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      pick({ uid: data.uid, name: data.name });
    } catch (e) {
      alert(`Failed to create client: ${e.message}`);
    } finally {
      newSave.disabled = false;
    }
  });

  document.addEventListener('click', (ev) => {
    if (!wrap.contains(ev.target)) {
      dropdown.style.display = 'none';
      if (changing && !showingNew) exitChangeMode();
    }
  });

  syncView();

  if (readOnly && selected?.uid) {
    const uid = selected.uid;
    fetch(`/api/clients/${encodeURIComponent(uid)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.ok || selected?.uid !== uid) return;
        selected.email = data.email || '';
        selected.phone = data.phone || '';
        syncReadOnlyClientLink();
      })
      .catch(() => {});
  }

  return {
    getPayload() {
      if (!selected?.uid) return null;
      return { contact_uid: selected.uid, contact_name: selected.name };
    },
    isValid: () => !!selected?.uid,
    getSelectedUid: () => selected?.uid || '',
    searchWithHint(hint) {
      if (readOnly || selected?.uid) return;
      const q = String(hint || '').trim();
      if (!q) return;
      changing = true;
      showingNew = false;
      searchInput.value = q;
      syncView();
      scheduleSearch();
    },
  };
}

const WORK_BODY_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const WORK_BODY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function showWorkEditorToast(message) {
  if (typeof shell.showChatToast === 'function') {
    shell.showChatToast(message);
    return;
  }
  console.warn('[work]', message);
}

function workMarkdownToHtml(markdown) {
  if (!markdown) return '';
  const parts = [];
  const imgRe = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
  for (const line of String(markdown).split('\n')) {
    const trimmed = line.trim();
    const m = trimmed.match(imgRe);
    if (m) {
      const src = m[2].trim();
      const safeSrc =
        /^https?:\/\//i.test(src) || (src.startsWith('/') && !src.startsWith('//'));
      if (!safeSrc) {
        parts.push(`<div class="wk-md-line">${escHtml(trimmed)}</div>`);
        continue;
      }
      parts.push(
        `<figure class="wk-md-figure" contenteditable="false">` +
          `<img class="wk-md-img" src="${escHtml(src)}" alt="${escHtml(m[1])}" loading="lazy" />` +
          `</figure>`,
      );
    } else if (trimmed === '') {
      parts.push('<div class="wk-md-line"><br></div>');
    } else {
      parts.push(`<div class="wk-md-line">${linkifyPlainText(trimmed)}</div>`);
    }
  }
  return parts.join('');
}

function workHtmlToMarkdown(root) {
  const lines = [];
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.replace(/\u00a0/g, ' ').trimEnd();
      if (t) lines.push(t);
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.classList.contains('wk-md-figure') || node.tagName === 'FIGURE') {
      const img = node.querySelector('img');
      if (img?.getAttribute('src')) {
        const alt = img.getAttribute('alt') || '';
        lines.push(`![${alt}](${img.getAttribute('src')})`);
      }
      continue;
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src');
      if (src) lines.push(`![](${src})`);
      continue;
    }
    if (node.tagName === 'BR') {
      lines.push('');
      continue;
    }
    const text = node.innerText.replace(/\u00a0/g, ' ').replace(/\n+$/, '');
    lines.push(text);
  }
  return lines.join('\n');
}

function insertWorkBodyImage(surface, url, alt) {
  const img = document.createElement('img');
  img.className = 'wk-md-img';
  img.src = url;
  img.alt = alt || 'Image';
  img.loading = 'lazy';
  const figure = document.createElement('figure');
  figure.className = 'wk-md-figure';
  figure.contentEditable = 'false';
  figure.appendChild(img);

  surface.focus();
  const sel = window.getSelection();
  if (!sel?.rangeCount || !surface.contains(sel.anchorNode)) {
    surface.appendChild(figure);
    surface.appendChild(document.createElement('br'));
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(figure);
  const spacer = document.createElement('br');
  figure.after(spacer);
  range.setStartAfter(spacer);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

async function uploadWorkBodyImage(slug, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/work/${encodeURIComponent(slug)}/files`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.file;
}

/**
 * Notes-style body editor: contenteditable surface synced to markdown (with ![](url) images).
 */
function createWorkBodyEditor(opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'wk-md-editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'wk-md-toolbar';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp';
  fileInput.multiple = true;
  fileInput.className = 'wk-md-file-input';
  fileInput.hidden = true;

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'de-btn de-btn-secondary de-btn-with-icon';
  setDeBtnLabel(uploadBtn, 'Upload', 'share');
  uploadBtn.addEventListener('click', () => fileInput.click());

  const libraryBtn = document.createElement('button');
  libraryBtn.type = 'button';
  libraryBtn.className = 'de-btn de-btn-secondary';
  libraryBtn.textContent = 'Library';

  toolbar.appendChild(fileInput);
  toolbar.appendChild(uploadBtn);
  toolbar.appendChild(libraryBtn);

  const surface = document.createElement('div');
  surface.className = 'wk-md-surface de-textarea';
  surface.contentEditable = 'true';
  surface.spellcheck = false;
  surface.setAttribute('role', 'textbox');
  surface.setAttribute('aria-multiline', 'true');
  if (opts.placeholder) surface.dataset.placeholder = opts.placeholder;

  const ta = document.createElement('textarea');
  ta.className = 'wk-md-source';
  ta.hidden = true;
  ta.tabIndex = -1;
  ta.value = opts.value || '';
  surface.innerHTML = workMarkdownToHtml(ta.value);

  let uploading = 0;

  function syncMarkdown() {
    ta.value = workHtmlToMarkdown(surface);
    opts.onInput?.();
  }

  async function ingestImageFile(file) {
    if (!file?.type?.startsWith('image/')) return;
    if (!WORK_BODY_IMAGE_TYPES.has(file.type)) {
      showWorkEditorToast('Use JPEG, PNG, GIF, or WebP images.');
      return;
    }
    if (file.size > WORK_BODY_IMAGE_MAX_BYTES) {
      showWorkEditorToast('Image too large (max 10 MB).');
      return;
    }

    let slug = opts.slug || null;
    if (!slug && opts.ensureSlug) slug = await opts.ensureSlug();
    if (!slug) {
      showWorkEditorToast('Add a title and client before adding images.');
      return;
    }

    uploading += 1;
    surface.classList.add('wk-md-uploading');
    try {
      const uploaded = await uploadWorkBodyImage(slug, file);
      insertWorkBodyImage(surface, uploaded.url, uploaded.filename || 'Image');
      syncMarkdown();
      opts.onImageUploaded?.(uploaded);
    } catch (e) {
      showWorkEditorToast(e.message || 'Image upload failed');
      throw e;
    } finally {
      uploading -= 1;
      if (uploading <= 0) {
        uploading = 0;
        surface.classList.remove('wk-md-uploading');
      }
    }
  }

  fileInput.addEventListener('change', () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    if (!files.length) return;
    void (async () => {
      for (const file of files) {
        try {
          await ingestImageFile(file);
        } catch {
          /* toast already shown */
        }
      }
    })();
  });

  libraryBtn.addEventListener('click', () => {
    void openMediaPicker({
      title: 'Insert from library',
      hint: 'Choose an image to copy into this project and insert in the notes. JPEG, PNG, GIF, or WebP — max 10 MB.',
      filter: imageMediaFilter,
      onPick: async (item) => {
        const file = await fetchMediaAsFile(item);
        await ingestImageFile(file);
      },
    });
  });

  surface.addEventListener('input', syncMarkdown);

  surface.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (!imageFiles.length) return;
    e.preventDefault();
    void (async () => {
      for (const file of imageFiles) {
        try {
          await ingestImageFile(file);
        } catch {
          /* toast already shown */
        }
      }
    })();
  });

  surface.addEventListener('dragover', (e) => {
    if ([...e.dataTransfer?.types || []].includes('Files')) {
      e.preventDefault();
      surface.classList.add('wk-md-dragover');
    }
  });
  surface.addEventListener('dragleave', () => surface.classList.remove('wk-md-dragover'));
  surface.addEventListener('drop', (e) => {
    surface.classList.remove('wk-md-dragover');
    const files = [...e.dataTransfer?.files || []].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    void (async () => {
      for (const file of files) {
        try {
          await ingestImageFile(file);
        } catch {
          /* toast already shown */
        }
      }
    })();
  });

  wrap.appendChild(toolbar);
  wrap.appendChild(surface);
  wrap.appendChild(ta);

  return {
    wrap,
    el: surface,
    ta,
    getValue: () => {
      ta.value = workHtmlToMarkdown(surface);
      return ta.value;
    },
    setValue: (markdown) => {
      ta.value = markdown || '';
      surface.innerHTML = workMarkdownToHtml(ta.value);
    },
    focus: () => surface.focus(),
  };
}

function createWorkFormScroll(pane) {
  return createDetailFormScroll(pane, 'wk-form-scroll');
}

function renderNewWorkForm(pane) {
  pane.innerHTML = '';
  const inDrawer = shell.isCreateDrawerOpen('work');
  const returnTodoId = workState.returnToTodoId;
  const { header, titleInput } = createPaneSubheader({
    back: inDrawer
      ? null
      : {
          label: returnTodoId ? 'Back to to‑do' : `Back to ${postLower(2)}`,
          onClick: async () => {
            await flushWorkAutosave();
            if (returnTodoId) {
              workState.returnToTodoId = null;
              workState.activeSlug = null;
              workState.draft = null;
              syncWorkDeepLinkUrl(null);
              getWorkEditor()?.classList.remove('de-pane-active');
              shell.navigateToTodo(returnTodoId);
              return;
            }
            workState.activeSlug = null;
            workState.draft = null;
            syncWorkDeepLinkUrl(null);
            getWorkEditor()?.classList.remove('de-pane-active');
            syncWorkSidebarActiveState();
            renderWorkPane();
          },
        },
    editableTitle: {
      value: workState.draft?.title || '',
      placeholder: postNew(),
      ariaLabel: postTitleLabel(),
    },
  });
  header.classList.add('pane-header');
  const chrome = createWorkDetailChrome(pane);
  chrome.appendChild(header);
  requestTitleFocus('work', titleInput);

  mountWorkDetailTabs(chrome, workState.detailTab, (tabId) => {
    workState.detailTab = tabId;
    showWorkDetailPanel(pane, tabId);
  }, { isNew: true });

  const scroll = createWorkFormScroll(pane);
  const activeTab = workState.detailTab;

  const projectPanel = createWorkDetailPanel('project', activeTab);
  const fields = document.createElement('div');
  fields.className = 'de-fields';

  let bodyEditor;
  let clientPicker;
  let metaFields;
  let statusPill;
  let workActiveEl = titleInput;
  const markDirty = () => {
    const client = clientPicker.getPayload();
    const meta = metaFields.getPayload();
    workState.dirty =
      titleInput.value !== (workState.draft?.title || '') ||
      (client?.contact_uid || '') !== (workState.draft?.contact_uid || '') ||
      statusPill.getValue() !== (workState.draft?.status || 'inquiry') ||
      meta.priority !== (workState.draft?.priority || 'normal') ||
      (meta.due_date || '') !== (workState.draft?.due_date || '') ||
      String(meta.value ?? '') !== String(workState.draft?.value ?? '') ||
      meta.tags.join(', ') !== (Array.isArray(workState.draft?.tags) ? workState.draft.tags.join(', ') : (workState.draft?.tags || '')) ||
      meta.source !== (workState.draft?.source || '') ||
      bodyEditor.getValue() !== (workState.draft?.body || '');
  };
  const getWorkPayload = () => {
    const client = clientPicker.getPayload();
    if (!client) return null;
    return {
      title: titleInput.value.trim(),
      ...client,
      status: statusPill.getValue(),
      ...metaFields.getPayload(),
      body: bodyEditor.getValue(),
    };
  };
  const queueWorkAutosave = (el) => {
    if (el) workActiveEl = el;
    markDirty();
    const payloadFn = () => getWorkPayload() || { title: '', contact_uid: '', body: '' };
    workAutosaveFlush = () => autosaveWorkQuiet(payloadFn, workActiveEl);
    // In the create drawer the Add button is the save; autosaving as the user
    // types would leave a project behind after Cancel.
    if (inDrawer) return;
    scheduleWorkAutosave(payloadFn, workActiveEl);
  };
  const flushWorkField = () => {
    const payloadFn = () => getWorkPayload() || { title: '', contact_uid: '', body: '' };
    workAutosaveFlush = () => autosaveWorkQuiet(payloadFn, workActiveEl);
    return autosaveWorkQuiet(payloadFn, workActiveEl);
  };

  bodyEditor = createWorkBodyEditor({
    value: workState.draft?.body || '',
    placeholder: 'Scope, notes, links…\n\nPaste or drop images here.',
    ensureSlug: async () => {
      await flushWorkField();
      return workState.activeSlug !== '__new__' ? workState.activeSlug : null;
    },
    onInput: () => queueWorkAutosave(bodyEditor.el),
  });
  bodyEditor.el.addEventListener('blur', () => {
    workActiveEl = bodyEditor.el;
    if (!inDrawer) void flushWorkField();
  });

  clientPicker = mountWorkClientPicker(fields, workState.draft, () => queueWorkAutosave(workActiveEl));

  let titleHintTimer = null;
  titleInput.addEventListener('input', () => {
    queueWorkAutosave(titleInput);
    clearTimeout(titleHintTimer);
    titleHintTimer = setTimeout(() => {
      const hint = extractClientHintFromTitle(titleInput.value);
      if (hint) clientPicker.searchWithHint(hint);
    }, 400);
  });
  titleInput.addEventListener('blur', () => {
    workActiveEl = titleInput;
    if (!inDrawer) void flushWorkField();
  });
  const initialHint = extractClientHintFromTitle(workState.draft?.title || titleInput.value);
  if (initialHint) clientPicker.searchWithHint(initialHint);

  statusPill = createSlidingPillSelect({
    label: 'Status',
    value: workState.draft?.status || 'inquiry',
    options: workStatusPillOptions(),
    ariaLabel: 'Status',
    onChange: () => queueWorkAutosave(statusPill.el),
  });
  fields.appendChild(statusPill.el);

  metaFields = appendWorkMetaFields(fields, workState.draft, queueWorkAutosave);

  for (const el of fields.querySelectorAll('.de-input')) {
    el.addEventListener('blur', () => {
      workActiveEl = el;
      if (!inDrawer) void flushWorkField();
    });
  }

  projectPanel.appendChild(fields);
  scroll.appendChild(projectPanel);

  const markupPanel = createWorkDetailPanel('markup', activeTab);
  markupPanel.appendChild(bodyEditor.wrap);
  scroll.appendChild(markupPanel);

  shell.clearEditorFooterSave();
  if (!inDrawer) getWorkEditor()?.classList.add('de-pane-active');
}

const WK_COMMENT_AVATAR_PLACEHOLDER =
  '<span class="wk-comment-avatar-fallback" aria-hidden="true">' +
  iosIcon('user', 15) +
  '</span>';

function workCommentAvatarHtml(author, clientIconUrl) {
  const url = author === 'staff' ? (window.__companyStaffAvatarUrl || '') : (clientIconUrl || '');
  if (url) {
    return `<div class="wk-comment-avatar" aria-hidden="true"><img src="${escHtml(url)}" alt="" loading="lazy" /></div>`;
  }
  return `<div class="wk-comment-avatar wk-comment-avatar--placeholder" aria-hidden="true">${WK_COMMENT_AVATAR_PLACEHOLDER}</div>`;
}

function mountWorkCommentsSection(pane, slug, contactUid) {
  const wrap = document.createElement('div');
  wrap.className = 'wk-comments-section';
  wrap.innerHTML = skeletonHtml('list', 'Loading comments…');
  pane.appendChild(wrap);

  const clientIconPromise = contactUid
    ? fetch(`/api/clients/${encodeURIComponent(contactUid)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => (c && c.ok ? c.iconUrl || c.logoUrl || '' : ''))
        .catch(() => '')
    : Promise.resolve('');

  Promise.all([
    fetch(`/api/work/${encodeURIComponent(slug)}/comments`, { cache: 'no-store' }).then((r) => r.json()),
    clientIconPromise,
  ])
    .then(([data, clientIconUrl]) => {
      void fetch(`/api/work/${encodeURIComponent(slug)}/comments/ack`, { method: 'POST' })
        .then(() => {
          if (shell.reviewsPendingCount > 0) void shell.loadAdminDashboard();
        })
        .catch(() => undefined);
      wrap.innerHTML = '';
      const label = document.createElement('div');
      label.className = 'de-label';
      label.textContent = 'Client comments';
      wrap.appendChild(label);

      const list = document.createElement('div');
      list.className = 'wk-comment-list';
      const comments = data.comments || [];

      if (comments.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'de-empty';
        empty.style.padding = '0.5rem 0';
        empty.textContent = 'No comments yet.';
        list.appendChild(empty);
      } else {
        for (const c of comments) {
          const row = document.createElement('div');
          row.className = `wk-comment wk-comment-${c.author}`;
          const when = c.createdAt ? new Date(c.createdAt).toLocaleString() : '';
          row.innerHTML =
            `<div class="wk-comment-inner">` +
            workCommentAvatarHtml(c.author, clientIconUrl) +
            `<div class="wk-comment-main">` +
            `<div class="wk-comment-head">` +
            `<span class="wk-comment-author">${escHtml(c.authorName || (c.author === 'staff' ? 'Team' : 'Client'))}</span>` +
            `<span class="wk-comment-time">${escHtml(when)}</span>` +
            `</div>` +
            `<div class="wk-comment-text">${escHtml(c.text)}</div>` +
            `</div>` +
            `</div>`;
          list.appendChild(row);
        }
      }
      wrap.appendChild(list);

      const replyLabel = document.createElement('label');
      replyLabel.className = 'de-label';
      replyLabel.textContent = 'Reply (visible on client portal)';
      const replyTa = document.createElement('textarea');
      replyTa.className = 'de-textarea wk-comment-reply';
      replyTa.rows = 3;
      replyTa.maxLength = 4000;
      replyTa.placeholder = 'Write a reply to the client…';
      replyLabel.appendChild(replyTa);
      wrap.appendChild(replyLabel);

      const replyActions = document.createElement('div');
      replyActions.className = 'wk-reply-actions';
      const replyBtn = document.createElement('button');
      replyBtn.type = 'button';
      replyBtn.className = 'de-btn de-btn-primary de-btn-with-icon';
      setDeBtnLabel(replyBtn, 'Post reply', 'send');
      replyBtn.addEventListener('click', async () => {
        const text = replyTa.value.trim();
        if (!text) { replyTa.focus(); return; }
        replyBtn.disabled = true;
        updateDeBtnLabel(replyBtn, 'Posting…');
        try {
          const res = await fetch(`/api/work/${encodeURIComponent(slug)}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          const payload = await res.json();
          if (!res.ok || !payload.ok) throw new Error(payload.error || `HTTP ${res.status}`);
          replyTa.value = '';
          const parent = wrap.parentElement;
          wrap.remove();
          if (parent) mountWorkCommentsSection(parent, slug, contactUid);
        } catch (e) {
          alert(`Failed to post reply: ${e.message}`);
        } finally {
          replyBtn.disabled = false;
          updateDeBtnLabel(replyBtn, 'Post reply');
        }
      });
      replyActions.appendChild(replyBtn);
      wrap.appendChild(replyActions);
    })
    .catch(() => {
      wrap.innerHTML = '';
    });
}

function workEditBackHandler(slug) {
  return async () => {
    await flushWorkAutosave();
    const returnEmailId = workState.returnToEmailId;
    const returnTodoId = workState.returnToTodoId;
    if (returnEmailId) {
      workState.returnToEmailId = null;
      workState.activeSlug = null;
      workState.draft = null;
      syncWorkDeepLinkUrl(null);
      shell.navigateToEmail(returnEmailId);
      return;
    }
    if (returnTodoId) {
      workState.returnToTodoId = null;
      workState.activeSlug = null;
      workState.draft = null;
      syncWorkDeepLinkUrl(null);
      getWorkEditor()?.classList.remove('de-pane-active');
      shell.navigateToTodo(returnTodoId, { fromWorkSlug: slug });
      return;
    }
    closeWorkDetailPane();
    syncWorkSidebarActiveState();
    renderWorkPane();
  };
}

function renderEditWorkForm(pane) {
  const slug = workState.activeSlug;
  const listJob = workState.jobs.find((j) => j.slug === slug);
  const returnEmailId = workState.returnToEmailId;
  const returnTodoId = workState.returnToTodoId;
  pane.innerHTML = '';

  // Mount chrome actions immediately so refresh doesn't land on an empty
  // actions rail then shove the agent circle into the truncated title.
  const linkTrackEl = document.createElement('div');
  linkTrackEl.className = 'wk-link-track';
  linkTrackEl.hidden = true;

  const shareLogEl = document.createElement('div');
  shareLogEl.className = 'wk-share-log';

  const { header, titleInput } = createPaneSubheader({
    back: {
      label: returnEmailId ? 'Back to email' : returnTodoId ? 'Back to to‑do' : `Back to ${postLower(2)}`,
      onClick: workEditBackHandler(slug),
    },
    editableTitle: {
      value: workState.draft?.title || listJob?.title || '',
      placeholder: postTitleLabel(),
      ariaLabel: postTitleLabel(),
    },
  });
  header.classList.add('pane-header');

  const agentBtn = createAgentBtn({
    label: 'Agent',
    title: 'Send to Agent',
    onClick: () => {
      const draft = workState.draft;
      askAgentAboutWork({
        slug,
        title: draft?.title || listJob?.title || titleInput.value || '',
        ...(draft || listJob || {}),
      });
    },
  });

  const archiveBtn = createIosIconBtn({
    iconKey: 'archive',
    label:
      (workState.draft?.status || listJob?.status) === 'archived'
        ? `Unarchive ${postLower(1)}`
        : `Archive ${postLower(1)}`,
    className: 'ios-icon-btn wk-archive-btn',
    onClick: () => void archiveWork(slug),
  });

  const deleteBtn = paneDeleteIcon({
    label: `Delete ${postLower(1)}`,
    onClick: () => deleteWork(slug),
  });

  const headerActions = document.createElement('div');
  headerActions.className = 'de-header-actions';
  headerActions.append(agentBtn, archiveBtn, deleteBtn);
  header.appendChild(headerActions);
  const chrome = createWorkDetailChrome(pane);
  chrome.appendChild(header);

  mountWorkDetailTabs(chrome, workState.detailTab, (tabId) => {
    workState.detailTab = tabId;
    showWorkDetailPanel(pane, tabId);
  });

  const scroll = createWorkFormScroll(pane);
  setWorkDetailScrollLoading(scroll, skeletonHtml('list', 'Loading…'));
  activateWorkPaneOnMobile();

  if (workDetailFetchCtrl) workDetailFetchCtrl.abort();
  workDetailFetchCtrl = new AbortController();
  const fetchSlug = slug;
  const { signal } = workDetailFetchCtrl;
  let detailFetchTimedOut = false;
  const detailFetchTimeoutId = setTimeout(() => {
    detailFetchTimedOut = true;
    workDetailFetchCtrl?.abort();
  }, WORK_DETAIL_FETCH_MS);

  adminFetch(`/api/work/${encodeURIComponent(fetchSlug)}`, { signal })
    .then((r) => readApiJson(r))
    .then((data) => {
      if (workState.activeSlug !== fetchSlug || !scroll.isConnected) return;
      try {
      workState.draft = {
        title: data.title,
        status: data.status || 'inquiry',
        priority: data.priority || 'normal',
        due_date: data.due_date || '',
        value: data.value ?? '',
        tags: data.tags || [],
        source: data.source || '',
        body: data.body || '',
        contact_uid: data.contact_uid,
        contact_name: data.contact_name || data.client,
        contact_email: data.contact_email || '',
        contact_phone: data.contact_phone || '',
      };
      workState.dirty = false;
      titleInput.value = workState.draft.title;

      archiveBtn.setAttribute(
        'aria-label',
        data.status === 'archived' ? `Unarchive ${postLower(1)}` : `Archive ${postLower(1)}`,
      );
      archiveBtn.title =
        data.status === 'archived' ? `Unarchive ${postLower(1)}` : `Archive ${postLower(1)}`;

      // Share depends on contact_uid — splice in after Agent without rebuilding the row.
      headerActions?.querySelectorAll('.de-share-btn').forEach((el) => el.remove());
      const shareBtn = data.contact_uid
        ? shell.createPortalShareBtn(data.contact_uid, {
            tab: isAuditWorkJob(data) ? 'audit' : 'work',
            jobSlug: slug,
            trackEl: linkTrackEl,
            shareLogEl,
            title: `${data.contact_name || data.client || 'Client'} — ${
              isAuditWorkJob(data) ? 'Audit' : postTitle(2)
            }`,
            recipient: {
              contactUid: data.contact_uid,
              name: data.contact_name || data.client || 'Client',
              email: data.contact_email,
              phone: data.contact_phone,
            },
          })
        : null;
      if (shareBtn && headerActions) {
        headerActions.insertBefore(shareBtn, archiveBtn);
      }

      clearWorkDetailScrollBody(scroll);
      const activeTab = workState.detailTab;

      const projectPanel = createWorkDetailPanel('project', activeTab);
      const fields = document.createElement('div');
      fields.className = 'de-fields';

      let bodyEditor;
      let clientPicker;
      let metaFields;
      let statusPill;
      let workActiveEl = titleInput;
      const markDirty = () => {
        const client = clientPicker.getPayload();
        const meta = metaFields.getPayload();
        workState.dirty =
          titleInput.value !== workState.draft.title ||
          (client?.contact_uid || '') !== (workState.draft.contact_uid || '') ||
          statusPill.getValue() !== workState.draft.status ||
          meta.priority !== (workState.draft.priority || 'normal') ||
          (meta.due_date || '') !== (workState.draft.due_date || '') ||
          String(meta.value ?? '') !== String(workState.draft.value ?? '') ||
          meta.tags.join(', ') !== (Array.isArray(workState.draft.tags) ? workState.draft.tags.join(', ') : '') ||
          meta.source !== (workState.draft.source || '') ||
          bodyEditor.getValue() !== workState.draft.body;
      };
      const getWorkPayload = () => {
        const client = clientPicker.getPayload();
        if (!client) return null;
        return {
          title: titleInput.value.trim(),
          ...client,
          status: statusPill.getValue(),
          ...metaFields.getPayload(),
          body: bodyEditor.getValue(),
        };
      };
      const queueWorkAutosave = (el) => {
        if (el) workActiveEl = el;
        markDirty();
        const payloadFn = () => getWorkPayload() || { title: '', contact_uid: '', body: '' };
        workAutosaveFlush = () => autosaveWorkQuiet(payloadFn, workActiveEl);
        scheduleWorkAutosave(payloadFn, workActiveEl);
      };
      const flushWorkField = () => {
        const payloadFn = () => getWorkPayload() || { title: '', contact_uid: '', body: '' };
        workAutosaveFlush = () => autosaveWorkQuiet(payloadFn, workActiveEl);
        return autosaveWorkQuiet(payloadFn, workActiveEl);
      };
      clientPicker = mountWorkClientPicker(projectPanel, workState.draft, () => queueWorkAutosave(workActiveEl), { readOnly: true });
      fields.insertBefore(linkTrackEl, fields.firstChild);
      renderWorkLinkTrackStatus(linkTrackEl, data.tracked_links, slug);

      statusPill = createSlidingPillSelect({
        label: 'Status',
        value: workState.draft.status,
        options: workStatusPillOptions(),
        ariaLabel: 'Status',
        onChange: () => queueWorkAutosave(statusPill.el),
      });
      fields.appendChild(statusPill.el);

      metaFields = appendWorkMetaFields(fields, workState.draft, queueWorkAutosave);

      const checklistMount = document.createElement('div');
      checklistMount.className = 'wk-checklist-mount';
      const checklistOpts = {
        slug,
        get title() { return titleInput.value.trim() || workState.draft.title; },
        get clientName() { return clientPicker.getPayload()?.contact_name || workState.draft.contact_name; },
        getBody: () => bodyEditor.getValue(),
        setBody: (v) => {
          bodyEditor.setValue(v);
          workState.draft.body = v;
          queueWorkAutosave(bodyEditor.el);
        },
      };
      bodyEditor = createWorkBodyEditor({
        value: workState.draft.body,
        slug,
        placeholder: 'Scope, notes, links…\n\nPaste or drop images here.',
        onInput: () => {
          queueWorkAutosave(bodyEditor.el);
          renderWorkChecklistPanel(checklistMount, checklistOpts);
        },
      });

      titleInput.addEventListener('input', () => queueWorkAutosave(titleInput));
      titleInput.addEventListener('blur', () => { workActiveEl = titleInput; void flushWorkField(); });
      bodyEditor.el.addEventListener('blur', () => { workActiveEl = bodyEditor.el; void flushWorkField(); });

      for (const el of fields.querySelectorAll('.de-input')) {
        el.addEventListener('blur', () => { workActiveEl = el; void flushWorkField(); });
      }

      projectPanel.appendChild(fields);
      mountWorkRelatedSection(projectPanel, data.related, data.source_chat_id);
      mountWorkShareLogSection(projectPanel, shareLogEl, data.tracked_links, slug);
      scroll.appendChild(projectPanel);

      const markupPanel = createWorkDetailPanel('markup', activeTab);
      markupPanel.appendChild(bodyEditor.wrap);
      scroll.appendChild(markupPanel);

      const actionPanel = createWorkDetailPanel('action-items', activeTab);
      actionPanel.appendChild(checklistMount);
      scroll.appendChild(actionPanel);
      renderWorkChecklistPanel(checklistMount, checklistOpts);

      if (hasInstallFeature('time_tracking')) {
        const timePanel = createWorkDetailPanel('time', activeTab);
        mountWorkTimeSection(timePanel, slug, {
          title: workState.draft.title,
          clientName: workState.draft.contact_name,
        });
        scroll.appendChild(timePanel);
      }

      const filesPanel = createWorkDetailPanel('files', activeTab);
      mountWorkFilesSection(filesPanel, slug, data.files);
      scroll.appendChild(filesPanel);

      const todoPanel = createWorkDetailPanel('todo', activeTab);
      mountWorkTodosSection(todoPanel, slug);
      scroll.appendChild(todoPanel);

      const commentsPanel = createWorkDetailPanel('comments', activeTab);
      mountWorkCommentsSection(commentsPanel, slug, data.contact_uid);
      scroll.appendChild(commentsPanel);

      shell.clearEditorFooterSave();
      getWorkEditor()?.classList.add('de-pane-active');
      } catch (err) {
        setWorkDetailScrollLoading(
          scroll,
          `<div class="de-loading de-error">${escHtml(err.message || `Failed to render ${postLower(1)}`)}</div>`,
        );
      }
    })
    .catch((e) => {
      if (workState.activeSlug !== fetchSlug || !scroll.isConnected) return;
      if (e.name === 'AbortError') {
        if (detailFetchTimedOut) {
          setWorkDetailScrollLoading(scroll, `<div class="de-loading de-error">Request timed out — try again.</div>`);
        }
        return;
      }
      if (e.message === 'Session expired') {
        setWorkDetailScrollLoading(scroll, `<div class="de-loading de-error">Session expired — sign in again to continue.</div>`);
        return;
      }
      if (e.message === 'Not found') {
        closeWorkDetailPane();
        renderWorkEditor();
        return;
      }
      setWorkDetailScrollLoading(scroll, `<div class="de-loading de-error">${escHtml(e.message)}</div>`);
    })
    .finally(() => clearTimeout(detailFetchTimeoutId));
}

function activateWorkPaneOnMobile() {
  if (workState.activeSlug && shell.isMobileTabs?.()) {
    getWorkEditor()?.classList.add('de-pane-active');
  }
}

async function openWork(slug) {
  if (slug === workState.activeSlug) {
    syncWorkDeepLinkUrl(slug);
    syncWorkSidebarActiveState({ scroll: true });
    activateWorkPaneOnMobile();
    return;
  }
  await flushWorkAutosave();
  workState.returnToEmailId = null;
  workState.returnToTodoId = null;
  workState.detailTab = 'project';
  workState.activeSlug = slug;
  workState.dirty = false;
  // Stamp for Recently Viewed, but do not rebuild the sidebar here — that
  // used to reshuffle the list under the cursor on every click.
  recordWorkView(slug);
  syncWorkDeepLinkUrl(slug);
  syncWorkSidebarActiveState({ scroll: true });
  renderWorkPane();
  activateWorkPaneOnMobile();
}

async function createWork(slug, payload) {
  if (!payload.title) { alert('Enter a title.'); return; }
  if (!payload.contact_uid) { alert('Select a client.'); return; }
  if (!slug) { alert('Could not derive a slug from the title.'); return; }
  const returnTodoId = workState.returnToTodoId;
  try {
    const res = await fetch('/api/work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, ...payload }),
    });
    const data = await res.json();
    if (res.status === 409) { alert(`A ${postLower(1)} with that slug already exists.`); return; }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await loadWorkTab();
    if (returnTodoId) {
      try {
        const linkRes = await fetch(`/api/todos/${encodeURIComponent(returnTodoId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_slug: slug }),
        });
        const linkData = await readApiJson(linkRes);
        if (!linkRes.ok) throw new Error(linkData.error || `HTTP ${linkRes.status}`);
      } catch (e) {
        alert(`${postTitle(1)} created, but could not link to-do: ${e.message}`);
      }
      workState.returnToTodoId = null;
      workState.activeSlug = null;
      workState.draft = null;
      syncWorkDeepLinkUrl(null);
      getWorkEditor()?.classList.remove('de-pane-active');
      shell.navigateToTodo(returnTodoId, { fromWorkSlug: slug });
      return;
    }
    workState.activeSlug = slug;
    recordWorkView(slug);
    syncWorkDeepLinkUrl(slug);
    renderWorkEditor();
  } catch (e) {
    alert(`Failed to create: ${e.message}`);
  }
}

async function saveWork(slug, payload) {
  if (!payload.title) { alert('Title is required.'); return; }
  if (!payload.contact_uid) { alert('Select a client.'); return; }
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    workState.dirty = false;
    await loadWorkTab();
    workState.activeSlug = slug;
    syncWorkDeepLinkUrl(slug);
    renderWorkEditor();
  } catch (e) {
    alert(`Failed to save: ${e.message}`);
  }
}

async function bulkDeleteWork(slugs) {
  if (!slugs.length) return;
  closeOpenSwipeRow();
  const slugSet = new Set(slugs);
  for (const slug of slugs) {
    try {
      const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) continue;
    } catch {
      /* continue */
    }
  }
  if (workState.activeSlug && slugSet.has(workState.activeSlug)) {
    closeWorkDetailPane();
  }
  await loadWorkTab();
}

async function bulkArchiveWork(slugs) {
  if (!slugs.length) return;
  closeOpenSwipeRow();
  await flushWorkAutosave();
  for (const slug of slugs) {
    const job = workState.jobs.find((j) => j.slug === slug);
    if (!job || job.status === 'archived') continue;
    try {
      const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const data = await readApiJson(res);
      if (!res.ok) continue;
      const payload = {
        title: data.title,
        contact_uid: data.contact_uid,
        contact_name: data.contact_name || data.client,
        status: 'archived',
        priority: data.priority || 'normal',
        due_date: data.due_date || '',
        value: data.value ?? '',
        tags: data.tags || [],
        source: data.source || '',
        body: data.body || '',
      };
      const putRes = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const putData = await readApiJson(putRes);
      if (!putRes.ok) continue;
      const idx = workState.jobs.findIndex((j) => j.slug === slug);
      if (idx !== -1) {
        workState.jobs[idx] = {
          ...workState.jobs[idx],
          status: 'archived',
          title: putData.title || payload.title,
          updated: putData.updated || new Date().toISOString(),
        };
      }
      if (workState.activeSlug === slug) {
        workState.activeSlug = null;
        workState.draft = null;
        workState.dirty = false;
        syncWorkDeepLinkUrl(null);
        getWorkEditor()?.classList.remove('de-pane-active');
      }
    } catch {
      /* continue */
    }
  }
  workState.jobs = sortWorkJobsForDisplay(workState.jobs);
  renderWorkEditor();
}

async function deleteWork(slug) {
  closeOpenSwipeRow();
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    closeWorkDetailPane();
    await loadWorkTab();
  } catch (e) {
    alert(`Failed to delete: ${e.message}`);
  }
}

async function archiveWork(jobOrSlug) {
  closeOpenSwipeRow();
  const slug = typeof jobOrSlug === 'string' ? jobOrSlug : jobOrSlug?.slug;
  if (!slug) return;

  const listJob = workState.jobs.find((j) => j.slug === slug);
  const currentStatus =
    workState.activeSlug === slug ? workState.draft?.status : listJob?.status;
  const unarchive = currentStatus === 'archived';
  const newStatus = unarchive ? 'inquiry' : 'archived';

  try {
    await flushWorkAutosave();

    let payload;
    if (workState.activeSlug === slug && workState.draft) {
      payload = {
        title: workState.draft.title,
        contact_uid: workState.draft.contact_uid,
        contact_name: workState.draft.contact_name,
        status: newStatus,
        priority: workState.draft.priority || 'normal',
        due_date: workState.draft.due_date || '',
        value: workState.draft.value ?? '',
        tags: workState.draft.tags || [],
        source: workState.draft.source || '',
        body: workState.draft.body || '',
      };
    } else {
      const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      payload = {
        title: data.title,
        contact_uid: data.contact_uid,
        contact_name: data.contact_name || data.client,
        status: newStatus,
        priority: data.priority || 'normal',
        due_date: data.due_date || '',
        value: data.value ?? '',
        tags: data.tags || [],
        source: data.source || '',
        body: data.body || '',
      };
    }

    const res = await fetch(`/api/work/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const idx = workState.jobs.findIndex((j) => j.slug === slug);
    if (idx !== -1) {
      workState.jobs[idx] = {
        ...workState.jobs[idx],
        status: newStatus,
        title: data.title || payload.title,
        contact_name: data.contact_name || payload.contact_name,
        client: data.client,
        updated: data.updated || new Date().toISOString(),
      };
      workState.jobs = sortWorkJobsForDisplay(workState.jobs);
    }

    if (workState.activeSlug === slug) {
      if (newStatus === 'archived') {
        workState.activeSlug = null;
        workState.draft = null;
        workState.dirty = false;
        syncWorkDeepLinkUrl(null);
        getWorkEditor()?.classList.remove('de-pane-active');
      } else {
        Object.assign(workState.draft, {
          status: newStatus,
          title: payload.title,
          contact_uid: payload.contact_uid,
          contact_name: payload.contact_name,
          priority: payload.priority,
          due_date: payload.due_date,
          value: payload.value,
          tags: payload.tags,
          source: payload.source,
          body: payload.body,
        });
        workState.dirty = false;
      }
    }

    renderWorkEditor();
  } catch (e) {
    shell.osAlert({
      title: unarchive ? `Could not restore ${postLower(1)}` : `Could not archive ${postLower(1)}`,
      bodyHtml: escHtml(e.message),
    });
  }
}

// ---- extracted from os-map-loader.js:17363-17376 ----
function renderWorkLinkTrackStatus(container, links, jobSlug) {
  shell.renderLinkTrackStatus(container, links, { jobSlug });
}

function renderWorkShareSendLog(container, links, jobSlug) {
  shell.renderShareSendLog(container, links, { jobSlug });
}

function mountWorkShareLogSection(container, logEl, links, slug) {
  const section = document.createElement('div');
  section.className = 'wk-share-log-section';
  section.hidden = true;

  const title = document.createElement('div');
  title.className = 'wk-share-log-title';
  title.textContent = 'Sent to client';
  section.appendChild(title);
  section.appendChild(logEl);

  renderWorkShareSendLog(logEl, links, slug);
  container.appendChild(section);
  return section;
}

async function refreshWorkLinkTrackStatus(container, jobSlug, shareLogEl) {
  if (!jobSlug) return;
  try {
    const res = await fetch(`/api/work/${encodeURIComponent(jobSlug)}/link`, { cache: 'no-store' });
    const data = await res.json();
    if (res.ok && data.ok) {
      if (container) renderWorkLinkTrackStatus(container, data.links, jobSlug);
      if (shareLogEl) renderWorkShareSendLog(shareLogEl, data.links, jobSlug);
    }
  } catch {
    /* ignore */
  }
}

// ---- work deep links & navigation ----
let pendingWorkDeepLinkSlug = null;

export function queueWorkDeepLink(slug) {
  pendingWorkDeepLinkSlug = slug;
}

function parseWorkDeepLinkFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('slug')?.trim() || null;
  } catch {
    return null;
  }
}

function readWorkLastActiveSlug() {
  try {
    return localStorage.getItem(WORK_LAST_ACTIVE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function rememberWorkActiveSlug(slug) {
  if (!slug || slug === '__new__') return;
  try {
    localStorage.setItem(WORK_LAST_ACTIVE_KEY, slug);
  } catch {
    /* ignore */
  }
}

function clearWorkLastActiveSlug() {
  try {
    localStorage.removeItem(WORK_LAST_ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

function syncWorkDeepLinkUrl(slug) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'work');
    if (slug && slug !== '__new__') {
      url.searchParams.set('slug', slug);
      rememberWorkActiveSlug(slug);
    } else {
      url.searchParams.delete('slug');
      if (!slug) clearWorkLastActiveSlug();
    }
    history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

function closeWorkDetailPane() {
  workState.activeSlug = null;
  workState.draft = null;
  workState.dirty = false;
  syncWorkDeepLinkUrl(null);
  getWorkEditor()?.classList.remove('de-pane-active');
}

function navigateToWork(slug, opts = {}) {
  if (!slug) return;
  if (opts.fromEmailId) {
    workState.returnToEmailId = opts.fromEmailId;
    workState.returnToTodoId = null;
  } else if (opts.fromTodoId) {
    workState.returnToEmailId = null;
    workState.returnToTodoId = opts.fromTodoId;
    shell.todoState.returnToWorkSlug = slug;
  } else {
    workState.returnToEmailId = null;
    workState.returnToTodoId = null;
  }
  pendingWorkDeepLinkSlug = slug;
  shell.setActiveMap('work', { force: true, workSlug: slug });
}

async function navigateToNewWorkFromTodo(opts = {}) {
  shell.armTitleFocus('work');
  await shell.flushTodoAutosave();
  let todoId = typeof shell.todoState.activeId === 'number' ? shell.todoState.activeId : null;
  if (!todoId) {
    if (!shell.todoState.draft?.title?.trim()) {
      shell.cancelTitleFocus();
      await shell.osAlert({
        title: 'Enter a to‑do title',
        bodyHtml: `Save the to‑do title before creating a ${postLower(1)}.`,
      });
      return;
    }
    const saved = await shell.saveActiveTodoDraft(true);
    if (!saved || typeof shell.todoState.activeId !== 'number') {
      shell.cancelTitleFocus();
      await shell.osAlert({
        title: 'Could not save to‑do',
        bodyHtml: `Save the to‑do before creating a ${postLower(1)}.`,
      });
      return;
    }
    todoId = shell.todoState.activeId;
  }
  beginNewProjectDrawer();
  workState.returnToEmailId = null;
  workState.returnToTodoId = todoId;
  workState.detailTab = 'project';
  workState.activeSlug = '__new__';
  workState.dirty = false;
  workState.draft = {
    title: opts.suggestedTitle?.trim() || '',
    contact_uid: '',
    contact_name: '',
    status: 'inquiry',
    priority: 'normal',
    due_date: '',
    value: '',
    tags: '',
    source: '',
    body: '',
  };
  pendingWorkDeepLinkSlug = '__new__';
  shell.setActiveMap('work', { force: true, workSlug: '__new__' });
}

// ---- extracted from os-map-loader.js:19056-19479 ----
function workRelatedChats(related, sourceChatId) {
  const chats = [...(related?.chats || [])];
  const sourceId = sourceChatId?.trim?.() || '';
  if (sourceId && !chats.some((c) => c.id === sourceId)) {
    chats.unshift({ id: sourceId, title: 'Session deleted', updatedAt: '', deleted: true });
  }
  return chats;
}

function mountWorkFilesSection(container, slug, initialFiles) {
  const section = document.createElement('div');
  section.className = 'wk-files-section';

  const title = document.createElement('div');
  title.className = 'wk-files-title';
  title.textContent = 'File repository';
  section.appendChild(title);

  const hint = document.createElement('div');
  hint.className = 'wk-files-hint';
  hint.textContent = 'Images from matching emails and linked chats are saved here automatically.';
  section.appendChild(hint);

  const grid = document.createElement('div');
  grid.className = 'wk-files-grid';
  section.appendChild(grid);

  const uploadRow = document.createElement('div');
  uploadRow.className = 'wk-files-upload';
  const uploadInput = document.createElement('input');
  uploadInput.type = 'file';
  uploadInput.accept = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';
  uploadInput.multiple = true;
  uploadInput.className = 'wk-files-input';
  const downloadAllBtn = document.createElement('button');
  downloadAllBtn.type = 'button';
  downloadAllBtn.className = 'de-btn de-btn-secondary de-btn-with-icon';
  setDeBtnLabel(downloadAllBtn, 'Download all', 'download');
  downloadAllBtn.disabled = !(initialFiles?.length);
  downloadAllBtn.addEventListener('click', async () => {
    if (!currentFiles.length) return;
    downloadAllBtn.disabled = true;
    const label = getDeBtnLabel(downloadAllBtn);
    updateDeBtnLabel(downloadAllBtn, 'Preparing…');
    try {
      const res = await fetch(`/api/work/${encodeURIComponent(slug)}/files/download-all`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data.error) msg = data.error;
        } catch {
          /* binary or empty */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${slug}-files.zip`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      alert(`Download failed: ${e.message}`);
    } finally {
      updateDeBtnLabel(downloadAllBtn, label);
      downloadAllBtn.disabled = !currentFiles.length;
    }
  });
  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'de-btn de-btn-secondary de-btn-with-icon';
  setDeBtnLabel(uploadBtn, 'Upload files', 'share');
  uploadBtn.addEventListener('click', () => uploadInput.click());
  const libraryBtn = document.createElement('button');
  libraryBtn.type = 'button';
  libraryBtn.className = 'de-btn de-btn-secondary';
  libraryBtn.textContent = 'Library';
  uploadRow.appendChild(downloadAllBtn);
  uploadRow.appendChild(uploadInput);
  uploadRow.appendChild(uploadBtn);
  uploadRow.appendChild(libraryBtn);
  section.appendChild(uploadRow);

  let currentFiles = initialFiles || [];

  function formatFileSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function projectFileAbsoluteUrl(file) {
    return new URL(file.url, window.location.origin).href;
  }

  async function shareProjectFile(file) {
    const url = projectFileAbsoluteUrl(file);
    await shell.sharePortalLink(url, file.filename || `${postTitle(1)} file`);
  }

  function renderFiles(files) {
    currentFiles = files || [];
    downloadAllBtn.disabled = !currentFiles.length;
    grid.innerHTML = '';
    if (!files?.length) {
      const empty = document.createElement('div');
      empty.className = 'de-empty';
      empty.style.padding = '0.5rem 0';
      empty.textContent = 'No files yet.';
      grid.appendChild(empty);
      return;
    }
    for (const file of files) {
      const card = document.createElement('div');
      card.className = 'wk-file-card';

      const isImage = String(file.mediaType || '').startsWith('image/');
      if (isImage) {
        const img = document.createElement('img');
        img.className = 'wk-file-thumb';
        img.src = file.url;
        img.alt = file.filename || `${postTitle(1)} file`;
        img.loading = 'lazy';
        card.appendChild(img);
      } else {
        const icon = document.createElement('div');
        icon.className = 'wk-file-doc';
        icon.textContent = '📄';
        card.appendChild(icon);
      }

      const meta = document.createElement('div');
      meta.className = 'wk-file-meta';
      meta.innerHTML =
        `<span class="wk-file-name">${escHtml(file.filename || 'file')}</span>` +
        `<span class="wk-file-size">${escHtml(formatFileSize(file.sizeBytes))}</span>`;
      card.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'wk-file-actions';

      actions.appendChild(
        paneShareIcon({
          label: `Share ${file.filename || 'file'}`,
          onClick: () => shareProjectFile(file),
        }),
      );
      actions.appendChild(
        paneDeleteIcon({
          label: `Delete ${file.filename || 'file'}`,
          onClick: async () => {
            try {
              const res = await fetch(file.url, { method: 'DELETE' });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
              const listRes = await fetch(`/api/work/${encodeURIComponent(slug)}/files`, {
                cache: 'no-store',
              });
              const listData = await listRes.json();
              renderFiles(listData.files || []);
            } catch (e) {
              alert(`Failed to delete: ${e.message}`);
            }
          },
        }),
      );
      card.appendChild(actions);
      grid.appendChild(card);
    }
  }

  async function uploadFilesToProject(files) {
    if (!files?.length) return;
    uploadBtn.disabled = true;
    libraryBtn.disabled = true;
    updateDeBtnLabel(uploadBtn, 'Uploading…');
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`/api/work/${encodeURIComponent(slug)}/files`, {
          method: 'POST',
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      }
      const listRes = await fetch(`/api/work/${encodeURIComponent(slug)}/files`, { cache: 'no-store' });
      const listData = await listRes.json();
      renderFiles(listData.files || []);
    } catch (e) {
      alert(`Upload failed: ${e.message}`);
      throw e;
    } finally {
      uploadBtn.disabled = false;
      libraryBtn.disabled = false;
      updateDeBtnLabel(uploadBtn, 'Upload files');
    }
  }

  uploadInput.addEventListener('change', () => {
    const files = [...uploadInput.files];
    uploadInput.value = '';
    void uploadFilesToProject(files).catch(() => {});
  });

  libraryBtn.addEventListener('click', () => {
    void openMediaPicker({
      title: 'Add from library',
      hint: 'Choose an image or PDF to copy into this project’s file repository. Max 10 MB.',
      filter: projectFileMediaFilter,
      onPick: async (item) => {
        const file = await fetchMediaAsFile(item);
        await uploadFilesToProject([file]);
      },
    });
  });

  renderFiles(initialFiles || []);
  container.appendChild(section);
}

function mountWorkTodosSection(container, jobSlug) {
  const section = document.createElement('div');
  section.className = 'wk-todos-section';

  const head = document.createElement('div');
  head.className = 'wk-todos-head';
  const title = document.createElement('div');
  title.className = 'wk-todos-title';
  title.textContent = 'To‑dos';
  head.appendChild(title);
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'de-btn de-btn-ghost';
  newBtn.textContent = 'New';
  newBtn.addEventListener('click', () => shell.navigateToNewTodoForProject(jobSlug));
  head.appendChild(newBtn);
  section.appendChild(head);

  const list = document.createElement('div');
  list.className = 'wk-todos-list';
  list.innerHTML = skeletonHtml('list', 'Loading…');
  section.appendChild(list);

  const linkWrap = document.createElement('div');
  linkWrap.className = 'wk-todos-link-wrap';
  section.appendChild(linkWrap);

  container.appendChild(section);
  void refreshWorkTodosSection(section, list, linkWrap, jobSlug);
}

async function refreshWorkTodosSection(section, listEl, linkWrap, jobSlug) {
  listEl.innerHTML = skeletonHtml('list', 'Loading…');
  try {
    const res = await fetch(`/api/todos?job_slug=${encodeURIComponent(jobSlug)}`, { cache: 'no-store' });
    const data = await readApiJson(res);
    const todos = data.todos || [];
    listEl.innerHTML = '';
    if (todos.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'de-empty';
      empty.textContent = 'No linked to‑dos yet.';
      listEl.appendChild(empty);
    } else {
      for (const todo of todos) {
        listEl.appendChild(createWorkTodoRow(todo, jobSlug));
      }
    }
    mountWorkTodoLinkPicker(linkWrap, jobSlug, () => refreshWorkTodosSection(section, listEl, linkWrap, jobSlug));
  } catch (e) {
    listEl.innerHTML = `<div class="de-empty de-error">${escHtml(e.message)}</div>`;
  }
}

function createWorkTodoRow(todo, jobSlug) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'wk-related-item wk-todo-item' + (todo.status === 'done' ? ' wk-todo-item--done' : '');
  const metaBits = [];
  if (todo.priority && todo.priority !== 'normal') {
    metaBits.push(TODO_PRIORITY_LABELS[todo.priority] || todo.priority);
  }
  if (todo.due_date) metaBits.push(shell.formatTodoDueDate(todo.due_date));
  else if (todo.status === 'done') metaBits.push('Done');
  row.innerHTML =
    `<span class="wk-related-kind">${todo.status === 'done' ? 'Done' : 'To‑do'}</span>` +
    `<span class="wk-related-label">${escHtml(todo.title)}</span>` +
    `<span class="wk-related-meta">${escHtml(metaBits.join(' · ') || 'Open')}</span>`;
  row.addEventListener('click', () => shell.navigateToTodo(todo.id, { fromWorkSlug: jobSlug }));
  return row;
}

function mountWorkTodoLinkPicker(parent, jobSlug, onLinked) {
  parent.innerHTML = '';
  const label = document.createElement('span');
  label.className = 'de-label';
  label.textContent = 'Link existing to‑do';
  parent.appendChild(label);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'wk-client-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.className = 'de-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search Unlinked To‑Dos…';
  searchInput.autocomplete = 'off';
  const dropdown = document.createElement('div');
  dropdown.className = 'wk-client-dropdown';
  dropdown.style.display = 'none';
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(dropdown);
  parent.appendChild(searchWrap);

  let unlinkedTodos = [];

  async function loadUnlinked() {
    const res = await fetch('/api/todos?status=open&unlinked=1', { cache: 'no-store' });
    const data = await readApiJson(res);
    unlinkedTodos = data.todos || [];
  }

  function renderDropdown(query) {
    const q = query.trim().toLowerCase();
    dropdown.innerHTML = '';
    if (q.length < 1) {
      dropdown.style.display = 'none';
      return;
    }
    const matches = unlinkedTodos
      .filter((todo) => matchesListSearch(q, todo.title, todo.section, todo.assignee))
      .slice(0, 8);
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'de-empty';
      empty.style.padding = '0.45rem 0.6rem';
      empty.textContent = 'No matches.';
      dropdown.appendChild(empty);
      dropdown.style.display = 'block';
      return;
    }
    for (const todo of matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-client-option';
      btn.innerHTML =
        `${escHtml(todo.title)}` +
        `<span class="sub">${escHtml(shell.todoSubline(todo) || 'Unlinked')}</span>`;
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => void linkTodoToProject(todo.id, jobSlug));
      dropdown.appendChild(btn);
    }
    dropdown.style.display = 'block';
  }

  async function linkTodoToProject(todoId, slug) {
    try {
      const res = await fetch(`/api/todos/${encodeURIComponent(todoId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_slug: slug }),
      });
      const data = await readApiJson(res);
      const idx = shell.todoState.todos.findIndex((t) => t.id === todoId);
      if (idx !== -1) shell.todoState.todos[idx] = shell.normalizeTodoItemDates(data);
      else shell.todoState.todos.unshift(data);
      searchInput.value = '';
      dropdown.style.display = 'none';
      unlinkedTodos = unlinkedTodos.filter((t) => t.id !== todoId);
      onLinked?.();
    } catch (e) {
      shell.osAlert({ title: 'Link failed', bodyHtml: escHtml(e.message) });
    }
  }

  async function scheduleSearch() {
    const q = searchInput.value.trim();
    if (q.length < 1) {
      dropdown.style.display = 'none';
      return;
    }
    if (!unlinkedTodos.length) await loadUnlinked();
    renderDropdown(q);
  }

  searchInput.addEventListener('input', () => void scheduleSearch());
  searchInput.addEventListener('focus', () => void scheduleSearch());
  shell.attachAutosuggestKeyboardNav(searchInput, dropdown, {
    optionSelector: '.wk-client-option',
    onClose: () => {
      dropdown.style.display = 'none';
    },
  });
}

function mountWorkRelatedSection(container, related, sourceChatId) {
  const emails = related?.emails || [];
  const chats = workRelatedChats(related, sourceChatId);
  if (!emails.length && !chats.length) return;

  const section = document.createElement('div');
  section.className = 'wk-related-section';

  const title = document.createElement('div');
  title.className = 'wk-related-title';
  title.textContent = 'Related';
  section.appendChild(title);

  const list = document.createElement('div');
  list.className = 'wk-related-list';

  for (const email of emails) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'wk-related-item';
    row.innerHTML =
      `<span class="wk-related-kind">Email</span>` +
      `<span class="wk-related-label">${escHtml(email.subject || '(no subject)')}</span>` +
      `<span class="wk-related-meta">${escHtml(new Date(email.receivedAt).toLocaleDateString())}</span>`;
    row.addEventListener('click', () => shell.navigateToEmail(email.id));
    list.appendChild(row);
  }

  for (const chat of chats) {
    const deleted = !!chat.deleted;
    const row = document.createElement(deleted ? 'div' : 'button');
    if (!deleted) row.type = 'button';
    row.className = deleted ? 'wk-related-item wk-related-item--deleted' : 'wk-related-item';
    row.innerHTML =
      `<span class="wk-related-kind">Session</span>` +
      `<span class="wk-related-label">${escHtml(deleted ? 'Session deleted' : (chat.title || 'Session'))}</span>` +
      `<span class="wk-related-meta">${deleted ? '' : escHtml(shell.formatChatDate(chat.updatedAt))}</span>`;
    if (!deleted) row.addEventListener('click', () => shell.navigateToChat(chat.id));
    list.appendChild(row);
  }

  section.appendChild(list);
  container.appendChild(section);
}

// ---- extracted from os-map-loader.js:20094-20109 ----
async function askAgentAboutWork(job) {
  try {
    const lines = [
      `Title: ${job.title}`,
      `Slug: ${job.slug}`,
    ];
    if (job.contact_name || job.client) lines.push(`Client: ${job.contact_name || job.client}`);
    if (job.status) lines.push(`Status: ${workStatusLabel(job.status, job)}`);
    lines.push('', `Please wait for instructions on how to work on this ${postLower(1)}.`);
    await shell.askAgentWithPrompt(lines.join('\n'), { sourceJobSlug: job.slug });
  } catch (e) {
    shell.osAlert({ title: 'Could not open agent', bodyHtml: escHtml(e.message) });
  }
}

// ---- extracted from os-map-loader.js:20162-20193 ----
function applyWorkAuditingIndicators() {
  const root = getWorkEditor();
  const list = root?.querySelector('.ch-sidebar .ch-list');
  if (!list) return;
  list.querySelectorAll('.ch-list-item[data-slug]').forEach((el) => {
    const slug = el.dataset.slug;
    const isAuditing = workState.auditingSlugs.has(slug);
    el.classList.toggle('ch-list-item--running', isAuditing);
    const statusEl = el.querySelector('.wk-status-auditing');
    const defaultStatusEl = el.querySelector('.wk-meta-row .wk-status');
    if (statusEl) statusEl.hidden = !isAuditing;
    if (defaultStatusEl) defaultStatusEl.hidden = isAuditing;
  });
}

async function refreshWorkAuditingIndicatorsQuiet() {
  try {
    const res = await adminFetch('/api/work/auditing');
    if (!res.ok) return;
    const data = await readAdminJson(res, `Auditing ${postLower(2)}`);
    const nextSlugs = new Set(
      (Array.isArray(data.auditing) ? data.auditing : []).map((row) => row.slug).filter(Boolean),
    );
    let justFinished = false;
    workState.auditingSlugs.forEach((slug) => {
      if (!nextSlugs.has(slug)) justFinished = true;
    });
    workState.auditingSlugs = nextSlugs;
    workState.auditingProgress = new Map(
      (Array.isArray(data.auditing) ? data.auditing : []).map((row) => [row.slug, row.progress || null]),
    );
    applyWorkAuditingIndicators();
    if (justFinished) void loadWorkTab({ workSlug: workState.activeSlug || undefined });
  } catch {
    /* ignore transient poll errors */
  }
}

function stopWorkAuditingPoll() {
  if (workAuditingPollTimer) {
    clearInterval(workAuditingPollTimer);
    workAuditingPollTimer = null;
  }
}

function syncWorkAuditingPoll() {
  stopWorkAuditingPoll();
  if (shell.MAP?.type === 'work' && !document.hidden) {
    void refreshWorkAuditingIndicatorsQuiet();
    workAuditingPollTimer = setInterval(refreshWorkAuditingIndicatorsQuiet, 3000);
  }
}

function createWorkListItem(job) {
  const isAuditing = workState.auditingSlugs.has(job.slug);
  const progress = workState.auditingProgress.get(job.slug);
  const isActive = job.slug === workState.activeSlug;
  const item = document.createElement('button');
  item.type = 'button';
  item.className =
    'ch-list-item' +
    (isActive ? ' active' : '') +
    (isWorkArchivedStatus(job.status) ? ' ch-list-item--archived' : '') +
    (isAuditing ? ' ch-list-item--running' : '');
  item.dataset.slug = job.slug;
  if (isActive) item.setAttribute('aria-current', 'page');
  const statusIndicator =
    `<span class="ch-item-status" aria-hidden="true">` +
    `<span class="ch-item-status-spinner">${WK_SPINNER_SVG}</span>` +
    `<span class="ch-item-status-dot"></span>` +
    `</span>`;
  const auditingStatus = `<span class="wk-status wk-status-auditing" hidden>Auditing</span>`;
  const defaultStatus = `<span class="${workStatusClass(job.status)}">${escHtml(workStatusLabel(job.status, job))}</span>`;
  const progressHint =
    isAuditing && progress?.toolLabel
      ? `<span class="wk-audit-progress">${escHtml(progress.toolLabel)}</span>`
      : '';
  item.innerHTML =
    sidebarAuthorIconHtml({ contactUid: job.contact_uid }) +
    statusIndicator +
    `<span class="ch-list-content">` +
    `<span class="ch-item-row"><span class="ch-item-title">${escHtml(job.title)}</span>` +
    `<span class="ch-item-date">${escHtml(shell.formatChatDate(workJobLastEdited(job)))}</span></span>` +
    `<span class="wk-meta-row">` +
    `<span class="wk-contact wk-list-client-name">${escHtml(job.contact_name || job.client || '—')}</span>` +
    auditingStatus +
    defaultStatus +
    progressHint +
    `</span></span>`;
  if (isAuditing) {
    const auditingEl = item.querySelector('.wk-status-auditing');
    const defaultEl = item.querySelector('.wk-meta-row .wk-status:not(.wk-status-auditing)');
    if (auditingEl) auditingEl.hidden = false;
    if (defaultEl) defaultEl.hidden = true;
  }
  item.addEventListener('click', () => openWork(job.slug));
  return item;
}

function createWorkSwipeRow(job) {
  return createSwipeRow(createWorkListItem(job), [
    swipeAgentAction(() => askAgentAboutWork(job)),
    swipeArchiveAction({
      label: isWorkArchivedStatus(job.status) ? 'Unarchive' : 'Archive',
      onClick: () => archiveWork(job),
    }),
    swipeDeleteAction({
      onClick: () => deleteWork(job.slug),
    }),
  ]);
}
export {
  workState,
  loadWorkTab,
  renderWorkEditor,
  openWork,
  navigateToWork,
  navigateToNewWorkFromTodo,
  beginNewProjectDrawer,
  startNewProject,
  flushWorkAutosave,
  createWorkListItem,
  createWorkSwipeRow,
  createClientWorkCard,
  mountClientWorkSection,
  renderClientWorkSection,
  askAgentAboutWork,
  refreshWorkLinkTrackStatus,
  getWorkEditor,
  workStatusLabel,
  workStatusClass,
  isWorkArchivedStatus,
  workClientSubline,
  mountClientDetailTabs,
  contactShowsClientBusinessTabs,
  showClientDetailPanel,
  createClientDetailPanel,
  mountClientVaultSection,
  mountClientAnalyticsSection,
  flushClientVaultSave,
  syncWorkAuditingPoll,
  stopWorkAuditingPoll,
};
