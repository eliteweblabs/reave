/**
 * Admin Work Day reconcile — weekly hours per client/property, approve → Work time.
 */
import { escHtml, adminFetch, readApiJson } from './shared.js?v=20260810a';
import { createBrandBtn } from './brand-button.js?v=20260810a';
import { osAlert, osConfirm } from './os-dialog.js?v=20260826a';

let weekStart = '';
let summaryLines = [];
let approved = false;

function mondayIso(d = new Date()) {
  const x = new Date(d);
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().slice(0, 10);
}

function shiftWeek(delta) {
  const d = new Date(`${weekStart}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  weekStart = mondayIso(d);
}

function rootEl() {
  return document.getElementById('work-day-panel');
}

function render() {
  const root = rootEl();
  if (!root) return;

  const rows =
    summaryLines.length > 0
      ? summaryLines
          .map(
            (line) =>
              `<tr data-contact="${escHtml(line.contactUid)}" data-property="${escHtml(line.propertyId || '')}">` +
              `<td>${escHtml(line.projectTitle || line.jobSlug)}</td>` +
              `<td>${escHtml(line.siteAddress || line.siteLabel || '—')}</td>` +
              `<td>${escHtml(line.contactName || '—')}</td>` +
              `<td>${escHtml(line.clerkUserId?.slice(0, 10) || '')}…</td>` +
              `<td class="wd-hours">${escHtml(String(line.hours))}h</td>` +
              `<td>${line.sampleCount ?? 0}</td>` +
              `</tr>`,
          )
          .join('')
      : `<tr><td colspan="6" class="dash-empty">No field time this week.</td></tr>`;

  root.innerHTML =
    `<div class="wd-panel-scroll">` +
    `<header class="wd-head">` +
    `<h2 class="wd-title">Work Day</h2>` +
    `<p class="wd-sub">Reconcile on-site hours before invoicing. Field app: <a href="/field/" target="_blank" rel="noopener">/field</a></p>` +
    `</header>` +
    `<div class="wd-week-bar">` +
    `<button type="button" class="field-link-btn wd-week-btn" data-wd-prev aria-label="Previous week">‹</button>` +
    `<span class="wd-week-label">Week of ${escHtml(weekStart)}</span>` +
    `<button type="button" class="field-link-btn wd-week-btn" data-wd-next aria-label="Next week">›</button>` +
    `</div>` +
    (approved
      ? `<p class="wd-approved">Approved for this week.</p>`
      : `<div class="wd-actions"></div>`) +
    `<div class="wd-table-wrap">` +
    `<table class="wd-table"><thead><tr>` +
    `<th>Project</th><th>Site</th><th>Client</th><th>Worker</th><th>Hours</th><th>GPS</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `</div>` +
    `</div>`;

  if (!approved) {
    const actions = root.querySelector('.wd-actions');
    if (actions) {
      const approveBtn = createBrandBtn({
        variant: 'filled',
        label: 'Approve & post to Work',
        onClick: () => void approveWeek(),
      });
      approveBtn.disabled = !summaryLines.length;
      actions.appendChild(approveBtn);

      const csvBtn = createBrandBtn({
        variant: 'glass',
        label: 'Export CSV',
        onClick: () => exportCsv(),
      });
      csvBtn.style.marginLeft = '0.5rem';
      actions.appendChild(csvBtn);
    }
  }

  root.querySelector('[data-wd-prev]')?.addEventListener('click', () => {
    shiftWeek(-1);
    void loadSummary();
  });
  root.querySelector('[data-wd-next]')?.addEventListener('click', () => {
    shiftWeek(1);
    void loadSummary();
  });
}

async function loadSummary() {
  const root = rootEl();
  if (root) root.innerHTML = `<div class="dash-empty">Loading…</div>`;
  try {
    const data = await readApiJson(
      adminFetch(`/api/work-day/summary?week=${encodeURIComponent(weekStart)}`),
    );
    if (!data.ok) throw new Error(data.error || 'Failed to load');
    summaryLines = data.lines || [];
    approved = Boolean(data.approved);
    weekStart = data.weekStart || weekStart;
    render();
  } catch (e) {
    if (root) {
      root.innerHTML = `<div class="dash-empty">${escHtml(e.message || String(e))}</div>`;
    }
  }
}

async function approveWeek() {
  if (approved || !summaryLines.length) return;
  const ok = await osConfirm({
    title: 'Approve week?',
    bodyHtml:
      'Posts billable hours to Work → Time for each row (creates projects if needed).',
    confirmLabel: 'Approve',
    cancelLabel: 'Cancel',
  });
  if (!ok) return;

  try {
    const data = await readApiJson(
      adminFetch('/api/work-day/reconcile', {
        method: 'POST',
        body: JSON.stringify({
          action: 'approve',
          week: weekStart,
          lines: summaryLines.map((line) => ({
            jobSlug: line.jobSlug,
            hours: line.hours,
          })),
        }),
      }),
    );
    if (!data.ok) throw new Error(data.error || 'Approve failed');
    approved = true;
    render();
    await osAlert({ title: 'Posted', bodyHtml: 'Hours are on the matching Work projects.' });
  } catch (e) {
    await osAlert({ title: 'Error', bodyHtml: escHtml(e.message || String(e)) });
  }
}

function exportCsv() {
  const header = ['Project', 'Site', 'Client', 'Worker', 'Hours', 'GPS samples'];
  const rows = summaryLines.map((line) => [
    line.projectTitle || line.jobSlug,
    line.siteAddress || line.siteLabel || '',
    line.contactName || '',
    line.clerkUserId || '',
    String(line.hours),
    String(line.sampleCount ?? 0),
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `work-day-${weekStart}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function loadWorkDayTab() {
  if (!weekStart) weekStart = mondayIso();
  void loadSummary();
}
