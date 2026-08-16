/**
 * Admin modules monitor — live deployment status for optional feature modules.
 */
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton } from './shared.js?v=20260810a';
import { osAlert } from './os-dialog.js?v=20260815a';

const API = '/api/admin/deploy-status';
const DEFAULT_POLL_MS = 30_000;

let pollTimer = null;
let pollMs = DEFAULT_POLL_MS;
let filter = 'all';
let lastPayload = null;
let shell = {};

const STATUS_LABELS = {
  deployed: 'Deployed',
  development: 'Development',
  request: 'Requested',
  rejected: 'Rejected',
};

const STATUS_CLASS = {
  deployed: 'mod-status--deployed',
  development: 'mod-status--development',
  request: 'mod-status--request',
  rejected: 'mod-status--rejected',
};

export function initModulesPanel(deps = {}) {
  shell = deps;
}

function rootEl() {
  return document.getElementById('modules-panel');
}

function isActiveTab() {
  const map = typeof shell.getMap === 'function' ? shell.getMap() : shell.MAP;
  return map?.type === 'modules';
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPoll() {
  stopPoll();
  if (!isActiveTab()) return;
  pollTimer = setInterval(() => {
    if (isActiveTab()) void loadModulesTab({ quiet: true });
    else stopPoll();
  }, pollMs);
}

function formatCheckedAt(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function filterModules(modules) {
  if (filter === 'enabled') return modules.filter((m) => m.enabled);
  if (filter === 'attention') return modules.filter((m) => m.needsAttention);
  return modules;
}

function renderFlag(on, label) {
  const cls = on ? 'mod-flag mod-flag--yes' : 'mod-flag mod-flag--no';
  return `<span class="${cls}" title="${escHtml(label)}">${on ? '✓' : '—'}</span>`;
}

function renderRow(m) {
  const statusCls = STATUS_CLASS[m.status] || 'mod-status--development';
  const nav =
    m.footerNavLabels?.length ?
      m.footerNavLabels.map((l) => `<span class="mod-nav-pill">${escHtml(l)}</span>`).join('')
    : '<span class="mod-muted">—</span>';

  return (
    `<tr class="mod-row${m.needsAttention ? ' mod-row--attention' : ''}" data-feature="${escHtml(m.feature)}">` +
    `<td class="mod-cell-id"><code>${escHtml(m.moduleId || '—')}</code></td>` +
    `<td class="mod-cell-label">` +
    `<span class="mod-label">${escHtml(m.label)}</span>` +
    `<span class="mod-feature">${escHtml(m.feature)}</span>` +
    `</td>` +
    `<td><span class="mod-status ${statusCls}">${escHtml(STATUS_LABELS[m.status] || m.status)}</span></td>` +
    `<td class="mod-cell-flags">` +
    renderFlag(m.enabled, 'Enabled on install') +
    renderFlag(m.inFooterNav, 'Linked tab in footer nav') +
    renderFlag(m.configured, 'Plugin / env configured') +
    renderFlag(m.runtimeAllowed, 'Runtime allowed') +
    renderFlag(m.active, 'Active') +
    (m.inDemoSuite != null ? renderFlag(m.inDemoSuite, 'In active demo suite') : '') +
    `</td>` +
    `<td class="mod-cell-nav">${nav}</td>` +
    `<td class="mod-cell-playbook">${m.playbook ? `<code class="mod-playbook">${escHtml(m.playbook)}</code>` : '<span class="mod-muted">—</span>'}</td>` +
    `</tr>`
  );
}

function renderPanel(data) {
  const modules = filterModules(data.modules || []);
  const summary = data.summary || {};
  const demoSuite = data.demoSuite;
  const checked = formatCheckedAt(data.checkedAt);

  return (
    `<div class="modules-panel-scroll">` +
    `<div class="mod-header prof-card">` +
    `<div class="mod-header-row">` +
    `<div>` +
    `<h1 class="prof-title">Modules</h1>` +
    `<p class="prof-subtitle">Optional features, deploy status, and admin navigation links. Refreshes every ${Math.round((data.pollMs || pollMs) / 1000)}s.</p>` +
    `</div>` +
    `<div class="mod-header-actions">` +
    (window.__installConfig?.showDeployWizard
      ? `<a class="de-btn de-btn-secondary" href="/deploy">Deploy wizard</a>`
      : '') +
    `<button type="button" class="de-btn de-btn-secondary" id="mod-refresh-btn">Refresh</button>` +
    `<span class="mod-checked" id="mod-checked-at">Updated ${escHtml(checked)}</span>` +
    `</div>` +
    `</div>` +
    (demoSuite ?
      `<div class="mod-suite-banner">` +
      `<strong>Demo suite</strong> — ${escHtml(demoSuite.summary || '')}` +
      `</div>`
    : '') +
    `<div class="mod-summary">` +
    `<span class="mod-summary-pill">${summary.enabled ?? 0} enabled</span>` +
    `<span class="mod-summary-pill">${summary.deployed ?? 0} deployed</span>` +
    `<span class="mod-summary-pill mod-summary-pill--warn">${summary.needsAttention ?? 0} need attention</span>` +
    `</div>` +
    `<div class="mod-filters sliding-pill" role="tablist" aria-label="Filter modules">` +
    `<button type="button" class="mod-filter${filter === 'all' ? ' active' : ''}" data-filter="all">All</button>` +
    `<button type="button" class="mod-filter${filter === 'enabled' ? ' active' : ''}" data-filter="enabled">Enabled</button>` +
    `<button type="button" class="mod-filter${filter === 'attention' ? ' active' : ''}" data-filter="attention">Needs attention</button>` +
    `</div>` +
    `<div class="mod-table-wrap prof-card">` +
    `<table class="mod-table">` +
    `<thead><tr>` +
    `<th>ID</th><th>Module</th><th>Status</th>` +
    `<th title="Enabled · In nav · Configured · Runtime · Active · Demo suite">Flags</th>` +
    `<th>Admin tabs</th><th>Playbook</th>` +
    `</tr></thead>` +
    `<tbody>${modules.length ? modules.map(renderRow).join('') : `<tr><td colspan="6" class="mod-empty">No modules match this filter.</td></tr>`}</tbody>` +
    `</table>` +
    `</div>` +
    `<p class="mod-footnote prof-hint">Core platform (Sessions, Inbox, Projects, Knowledge, To-do, Contacts, Clerk sign-in) is always on and not listed here. Numeric IDs are for demo URLs: <code>?modules=[001,004]</code></p>` +
    `</div>`
  );
}

function bindPanelEvents(root) {
  root.querySelector('#mod-refresh-btn')?.addEventListener('click', () => {
    void loadModulesTab({ force: true });
  });

  root.querySelectorAll('.mod-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.getAttribute('data-filter') || 'all';
      if (lastPayload) {
        root.innerHTML = renderPanel(lastPayload);
        bindPanelEvents(root);
      }
    });
  });
}

async function fetchStatus() {
  const res = await adminFetch(API, { cache: 'no-store' });
  const data = await readAdminJson(res, 'deploy-status');
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function renderSignedOutGate(title) {
  return (
    `<div class="modules-panel-scroll">` +
    `<div class="mod-auth-gate prof-card">` +
    `<h1 class="prof-title">${escHtml(title)}</h1>` +
    `<p class="prof-subtitle">Sign in to view module status and deployment health for this install.</p>` +
    `<button type="button" class="de-btn de-btn-primary mod-auth-sign-in">Sign in</button>` +
    `</div>` +
    `</div>`
  );
}

function bindSignedOutGate(root) {
  root.querySelector('.mod-auth-sign-in')?.addEventListener('click', () => {
    if (window.IosSheet?.open) window.IosSheet.open('sign-in-sheet');
    else window.location.assign('/admin/?auth=sign-in');
  });
}

export async function loadModulesTab(opts = {}) {
  const root = rootEl();
  if (!root) return;

  if (!document.body?.dataset?.userId?.trim()) {
    root.innerHTML = renderSignedOutGate('Modules');
    bindSignedOutGate(root);
    stopPoll();
    return;
  }

  const quiet = opts.quiet === true;

  if (!quiet && !root.querySelector('.mod-table')) {
    mountPanelSkeleton(root, 'dashboard', 'Loading modules…', {
      contentSelector: '.modules-panel-scroll',
    });
  }

  try {
    const data = await fetchStatus();
    lastPayload = data;
    if (data.pollMs) pollMs = data.pollMs;
    root.innerHTML = renderPanel(data);
    bindPanelEvents(root);
    startPoll();
  } catch (e) {
    if (e.message === 'Session expired') return;
    if (quiet && lastPayload) return;
    root.innerHTML =
      `<div class="modules-panel-scroll"><p class="mod-empty mod-empty--error">Could not load modules: ${escHtml(e.message)}</p></div>`;
    if (!quiet) {
      void osAlert({ title: 'Modules', bodyHtml: escHtml(e.message) });
    }
  }
}

export function teardownModulesPanel() {
  stopPoll();
}
