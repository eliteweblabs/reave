/**
 * Agentic Social Lead Scanner — keyword config + matched-lead inbox.
 */
import {
  initSidebarLayout,
  syncAdminSplitView,
  attachIosPullToRefresh,
  createCenteredListEmpty,
} from './admin-ui.js?v=20260825h';
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton } from './shared.js?v=20260810a';
import { osAlert } from './os-dialog.js?v=20260826a';

const state = {
  filter: 'inbox',
  hits: [],
  summary: {},
  config: {},
  platformOptions: [],
  activeId: null,
  showSettings: false,
};

const STATUS_LABELS = {
  new: 'New',
  todo: 'To-do',
  responded: 'Responded',
  dismissed: 'Dismissed',
};

export function initSocialLeadScannerPanel(_deps) {
  /* reserved */
}

function rootEl() {
  return document.getElementById('social-leads-panel');
}

function activeHit() {
  return state.hits.find((h) => h.id === state.activeId) || null;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function platformLabel(id) {
  return state.platformOptions.find((p) => p.id === id)?.label || id;
}

function renderSettings() {
  const cfg = state.config || {};
  const keywords = Array.isArray(cfg.keywords) ? cfg.keywords.join('\n') : '';
  const selected = new Set(Array.isArray(cfg.platforms) ? cfg.platforms : []);
  const platformHtml = (state.platformOptions || [])
    .map((p) => {
      const hint = p.configured ? '' : ' (no profile link yet)';
      return (
        `<label class="prof-check-row">` +
        `<input type="checkbox" name="sls-platform" value="${escHtml(p.id)}"${selected.has(p.id) ? ' checked' : ''} />` +
        `<span>${escHtml(p.label)}${escHtml(hint)}</span>` +
        `</label>`
      );
    })
    .join('');

  const lastRun = cfg.lastRunAt
    ? `Last scan: ${formatDate(cfg.lastRunAt)}${cfg.lastRunError ? ` — ${escHtml(cfg.lastRunError)}` : cfg.lastRunNote ? ` — ${escHtml(cfg.lastRunNote)}` : ''}`
    : 'Not scanned yet.';

  return (
    `<section class="sls-settings prof-card">` +
    `<h3 class="sls-settings-title">Scanner settings</h3>` +
    `<p class="prof-hint prof-hint--block">Watch keywords on connected networks. Platform API adapters ship incrementally — config and the inbox are live now.</p>` +
    `<label class="prof-check-row">` +
    `<input type="checkbox" id="sls-enabled"${cfg.enabled ? ' checked' : ''} />` +
    `<span>Enable scheduled scans</span>` +
    `</label>` +
    `<label class="prof-field">` +
    `<span class="prof-label">Keywords (one per line)</span>` +
    `<textarea id="sls-keywords" class="prof-input prof-textarea" rows="5" placeholder="plumber&#10;need HVAC&#10;landscaping quote">${escHtml(keywords)}</textarea>` +
    `</label>` +
    `<fieldset class="prof-field"><legend class="prof-label">Platforms to watch</legend>${platformHtml || '<p class="prof-hint">No platforms configured.</p>'}</fieldset>` +
    `<label class="prof-check-row">` +
    `<input type="checkbox" id="sls-auto-draft"${cfg.autoDraft !== false ? ' checked' : ''} />` +
    `<span>Agent drafts replies for new matches (when adapters are live)</span>` +
    `</label>` +
    `<p class="prof-hint">${escHtml(lastRun)}</p>` +
    `<div class="sls-settings-actions">` +
    `<button type="button" class="de-btn de-btn--secondary" id="sls-save-config">Save settings</button>` +
    `<button type="button" class="de-btn" id="sls-scan-now">Scan now</button>` +
    `</div>` +
    `</section>`
  );
}

function renderHitRow(hit) {
  const active = hit.id === state.activeId ? ' sls-row--active' : '';
  const snippet = String(hit.text || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  return (
    `<button type="button" class="sls-row${active}" data-hit-id="${escHtml(hit.id)}">` +
    `<span class="sls-row-main">` +
    `<strong>${escHtml(hit.authorName || 'Unknown')}</strong>` +
    `<span class="sls-row-meta">${escHtml(platformLabel(hit.platform))} · matched “${escHtml(hit.keywordMatched)}”</span>` +
    `<span class="sls-row-snippet">${escHtml(snippet)}</span>` +
    `</span>` +
    `<span class="sls-row-date">${escHtml(formatDate(hit.detectedAt))}</span>` +
    `</button>`
  );
}

function renderDetail(hit) {
  if (!hit) {
    return `<div class="de-pane-empty-body"><p>Select a lead or open settings.</p></div>`;
  }
  return (
    `<div class="sls-detail">` +
    `<header class="sls-detail-head">` +
    `<h2>${escHtml(hit.authorName || 'Unknown')}</h2>` +
    `<p class="prof-hint">${escHtml(platformLabel(hit.platform))} · ${escHtml(formatDate(hit.detectedAt))} · keyword “${escHtml(hit.keywordMatched)}”</p>` +
    `</header>` +
    `<blockquote class="sls-quote">${escHtml(hit.text || '')}</blockquote>` +
    `<label class="prof-field">` +
    `<span class="prof-label">Reply draft</span>` +
    `<textarea id="sls-reply-draft" class="prof-input prof-textarea" rows="5">${escHtml(hit.replyDraft || '')}</textarea>` +
    `</label>` +
    `<div class="sls-detail-actions">` +
    `<button type="button" class="de-btn de-btn--secondary" id="sls-save-hit">Save draft</button>` +
    (hit.url
      ? `<button type="button" class="de-btn" id="sls-open-network">Open on ${escHtml(platformLabel(hit.platform))}</button>`
      : '') +
    `<button type="button" class="de-btn de-btn--secondary sls-status-btn" data-status="todo">To-do</button>` +
    `<button type="button" class="de-btn de-btn--secondary sls-status-btn" data-status="responded">Responded</button>` +
    `<button type="button" class="de-btn de-btn--secondary sls-status-btn" data-status="dismissed">Dismiss</button>` +
    `</div>` +
    `</div>`
  );
}

function renderPanel() {
  const root = rootEl();
  if (!root) return;

  const hitsHtml =
    state.hits.length === 0
      ? '<p class="prof-hint sls-empty">No matches yet. Save keywords and run a scan — live platform adapters will populate this inbox.</p>'
      : state.hits.map(renderHitRow).join('');

  root.innerHTML =
    `<div class="sls-layout ch-split">` +
    `<div class="ch-sidebar sls-sidebar">` +
    `<div class="sls-sidebar-head">` +
    `<h1 class="prof-title">Social Leads</h1>` +
    `<p class="prof-subtitle">Keyword matches from social networks — triage here, reply on the platform.</p>` +
    `<div class="sls-toolbar">` +
    `<span class="sls-summary">${Number(state.summary.inbox ?? 0)} open · ${Number(state.summary.total ?? 0)} total</span>` +
    `<button type="button" class="ios-icon-btn" id="sls-toggle-settings" title="Scanner settings" aria-label="Settings">⚙</button>` +
    `</div>` +
    (state.showSettings ? renderSettings() : '') +
    `<div class="sls-list" id="sls-list">${hitsHtml}</div>` +
    `</div>` +
    `<div class="ch-pane sls-pane" id="sls-detail-pane">${renderDetail(activeHit())}</div>` +
    `</div>`;

  bindEvents(root);
  initSidebarLayout();
  syncAdminSplitView('social-leads');
}

async function apiGet() {
  const res = await adminFetch('/api/admin/social-lead-scanner', { cache: 'no-store' });
  return readAdminJson(res);
}

async function apiPost(body) {
  const res = await adminFetch('/api/admin/social-lead-scanner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readAdminJson(res);
}

function bindEvents(root) {
  root.querySelector('#sls-toggle-settings')?.addEventListener('click', () => {
    state.showSettings = !state.showSettings;
    renderPanel();
  });

  root.querySelector('#sls-save-config')?.addEventListener('click', async () => {
    try {
      const platforms = [...root.querySelectorAll('input[name="sls-platform"]:checked')].map((el) => el.value);
      const data = await apiPost({
        action: 'save_config',
        enabled: !!root.querySelector('#sls-enabled')?.checked,
        keywords: root.querySelector('#sls-keywords')?.value ?? '',
        platforms,
        autoDraft: !!root.querySelector('#sls-auto-draft')?.checked,
      });
      if (!data.ok) throw new Error(data.error || 'Save failed');
      state.config = data.config;
      osAlert('Settings saved.', 'success');
    } catch (e) {
      osAlert(e.message || 'Save failed', 'error');
    }
  });

  root.querySelector('#sls-scan-now')?.addEventListener('click', async () => {
    const btn = root.querySelector('#sls-scan-now');
    if (btn) btn.disabled = true;
    try {
      const data = await apiPost({ action: 'scan' });
      if (!data.ok) throw new Error(data.error || 'Scan failed');
      state.hits = data.hits || [];
      state.summary = data.summary || state.summary;
      state.config = data.config || state.config;
      const note = data.result?.adaptersPending?.length
        ? `Adapters pending for ${data.result.adaptersPending.join(', ')}.`
        : data.config?.lastRunNote || 'Scan complete.';
      osAlert(note, data.result?.hitsFound ? 'success' : 'info');
      renderPanel();
    } catch (e) {
      osAlert(e.message || 'Scan failed', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  root.querySelectorAll('.sls-row').forEach((row) => {
    row.addEventListener('click', () => {
      state.activeId = row.getAttribute('data-hit-id');
      const pane = root.querySelector('#sls-detail-pane');
      if (pane) pane.innerHTML = renderDetail(activeHit());
      root.querySelectorAll('.sls-row').forEach((r) => r.classList.remove('sls-row--active'));
      row.classList.add('sls-row--active');
      bindDetailEvents(root);
    });
  });

  bindDetailEvents(root);

  const list = root.querySelector('#sls-list');
  if (list instanceof HTMLElement) {
    attachIosPullToRefresh(list, () => loadSocialLeadScannerTab({ keepSelection: true }));
  }
}

function bindDetailEvents(root) {
  const hit = activeHit();
  if (!hit) return;

  root.querySelector('#sls-save-hit')?.addEventListener('click', async () => {
    try {
      const data = await apiPost({
        action: 'update',
        id: hit.id,
        replyDraft: root.querySelector('#sls-reply-draft')?.value ?? '',
      });
      if (!data.ok) throw new Error(data.error || 'Save failed');
      const idx = state.hits.findIndex((h) => h.id === hit.id);
      if (idx >= 0) state.hits[idx] = data.hit;
      osAlert('Draft saved.', 'success');
    } catch (e) {
      osAlert(e.message || 'Save failed', 'error');
    }
  });

  root.querySelector('#sls-open-network')?.addEventListener('click', () => {
    if (hit.url) window.open(hit.url, '_blank', 'noopener,noreferrer');
  });

  root.querySelectorAll('.sls-status-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const status = btn.getAttribute('data-status');
      if (!status) return;
      try {
        const data = await apiPost({
          action: 'update',
          id: hit.id,
          status,
          replyDraft: root.querySelector('#sls-reply-draft')?.value ?? '',
        });
        if (!data.ok) throw new Error(data.error || 'Update failed');
        state.summary = data.summary || state.summary;
        const idx = state.hits.findIndex((h) => h.id === hit.id);
        if (idx >= 0) state.hits[idx] = data.hit;
        if (state.filter === 'inbox' && (status === 'responded' || status === 'dismissed')) {
          state.hits.splice(idx, 1);
          state.activeId = state.hits[0]?.id ?? null;
        }
        renderPanel();
        osAlert(`Marked ${STATUS_LABELS[status] || status}.`, 'success');
      } catch (e) {
        osAlert(e.message || 'Update failed', 'error');
      }
    });
  });
}

export async function loadSocialLeadScannerTab(opts = {}) {
  const root = rootEl();
  if (!root) return;
  if (!root.querySelector('.sls-layout')) {
    mountPanelSkeleton(root, 'list', 'Loading social leads…', {
      contentSelector: '.ch-list',
      wrapper: (sk) => `<div class="sls-layout ch-split"><div class="ch-sidebar">${sk}</div><div class="ch-pane"></div></div>`,
    });
  }
  try {
    const data = await apiGet();
    if (!data.ok) throw new Error(data.error || 'Failed to load');
    state.config = data.config || {};
    state.summary = data.summary || {};
    state.hits = data.hits || [];
    state.platformOptions = data.platformOptions || [];
    if (!opts.keepSelection) state.activeId = state.hits[0]?.id ?? null;
    else if (state.activeId && !state.hits.some((h) => h.id === state.activeId)) {
      state.activeId = state.hits[0]?.id ?? null;
    }
    renderPanel();
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll"><div class="prof-card">` +
      `<h1 class="prof-title">Social Leads</h1>` +
      `<p class="dash-empty">Could not load: ${escHtml(e.message)}</p></div></div>`;
  }
}
