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
  if (filter === 'shop') return modules.filter((m) => m.purchasable || m.entitlement);
  if (filter === 'attention') return modules.filter((m) => m.needsAttention);
  return modules;
}

function renderPurchaseCell(m) {
  if (m.enabled) {
    return m.price
      ? `<span class="mod-muted">Included</span>`
      : '<span class="mod-muted">—</span>';
  }
  const price = m.price?.label ? `<span class="mod-price">${escHtml(m.price.label)}</span>` : '';
  const ent = m.entitlement;
  if (ent?.status === 'paid') {
    return `${price}<span class="mod-buy-note">Paid — we turn it on</span>`;
  }
  if (ent?.status === 'invoiced' && ent.invoiceUrl) {
    return (
      `${price}` +
      `<a class="de-btn de-btn-primary mod-buy-link" href="${escHtml(ent.invoiceUrl)}" target="_blank" rel="noopener">Pay invoice</a>` +
      (lastPayload?.canMarkPaid
        ? `<button type="button" class="de-btn de-btn-secondary mod-mark-paid" data-feature="${escHtml(m.feature)}">Mark paid</button>`
        : '')
    );
  }
  if (ent?.status === 'requested' || ent?.status === 'invoiced') {
    return `${price}<span class="mod-buy-note">Requested — we will follow up</span>`;
  }
  if (!m.purchasable) return price || '<span class="mod-muted">—</span>';
  return (
    `${price}` +
    `<button type="button" class="de-btn de-btn-primary mod-buy-btn" data-feature="${escHtml(m.feature)}">Buy</button>`
  );
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
    `<td class="mod-cell-buy">${renderPurchaseCell(m)}</td>` +
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
    `<p class="prof-subtitle">${
      data.storefront
        ? 'Buy add-ons here. Paying does not turn a module on — we activate it after the card clears. You cannot flip modules yourself.'
        : 'Optional features, deploy status, and admin navigation links.'
    } Refreshes every ${Math.round((data.pollMs || pollMs) / 1000)}s.</p>` +
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
    (data.storefront
      ? `<button type="button" class="mod-filter${filter === 'shop' ? ' active' : ''}" data-filter="shop">Shop</button>`
      : '') +
    `<button type="button" class="mod-filter${filter === 'attention' ? ' active' : ''}" data-filter="attention">Needs attention</button>` +
    `</div>` +
    `<div class="mod-table-wrap prof-card">` +
    `<table class="mod-table">` +
    `<thead><tr>` +
    `<th>ID</th><th>Module</th><th>Status</th>` +
    `<th title="Enabled · In nav · Configured · Runtime · Active · Demo suite">Flags</th>` +
    `<th>Admin tabs</th><th>Add-on</th>` +
    `</tr></thead>` +
    `<tbody>${modules.length ? modules.map(renderRow).join('') : `<tr><td colspan="6" class="mod-empty">No modules match this filter.</td></tr>`}</tbody>` +
    `</table>` +
    `</div>` +
    `<p class="mod-footnote prof-hint">Core platform (Sessions, Inbox, Projects, Knowledge, To-do, Contacts, Clerk sign-in) is always on and not listed here. Add-ons are sold in this tab — a config flag on the client install is not a purchase.</p>` +
    `</div>`
  );
}

async function purchaseModule(feature, action) {
  const res = await adminFetch('/api/admin/modules/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, feature }),
  });
  return readAdminJson(res, 'module-purchase');
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

  root.querySelectorAll('.mod-buy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const feature = btn.getAttribute('data-feature');
      if (!feature) return;
      btn.disabled = true;
      try {
        const data = await purchaseModule(feature, 'purchase');
        if (!data.ok) throw new Error(data.error || 'Purchase failed');
        if (data.checkoutUrl) {
          window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer');
          void osAlert({
            title: 'Invoice ready',
            bodyHtml: 'Pay the invoice to purchase this module. We turn it on after the payment clears — you cannot enable it yourself.',
          });
        } else {
          void osAlert({
            title: 'Request sent',
            bodyHtml: data.invoiceError
              ? `We logged the request. Invoicing is not available here yet (${escHtml(data.invoiceError)}). We will call you for a card.`
              : 'We logged the request and will follow up for payment. Modules are not self-serve toggles.',
          });
        }
        void loadModulesTab({ force: true });
      } catch (e) {
        btn.disabled = false;
        void osAlert({ title: 'Purchase failed', bodyHtml: escHtml(e.message) });
      }
    });
  });

  root.querySelectorAll('.mod-mark-paid').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const feature = btn.getAttribute('data-feature');
      if (!feature) return;
      btn.disabled = true;
      try {
        const data = await purchaseModule(feature, 'mark_paid');
        if (!data.ok) throw new Error(data.error || 'Update failed');
        void osAlert({
          title: 'Marked paid',
          bodyHtml: 'Payment recorded. Enable the module in this install’s features[] on the next deploy.',
        });
        void loadModulesTab({ force: true });
      } catch (e) {
        btn.disabled = false;
        void osAlert({ title: 'Update failed', bodyHtml: escHtml(e.message) });
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
