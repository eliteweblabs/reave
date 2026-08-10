/**
 * Online reviews inbox — fetch reviews + to-do response workflow.
 */
import {
  createSlidingPillSelect,
  initSidebarLayout,
  syncAdminSplitView,
  attachIosPullToRefresh,
} from './admin-ui.js?v=20260809b';
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton } from './shared.js?v=20260808k';
import { osAlert, openOsDialogBackdrop, closeOsDialogBackdrop } from './os-dialog.js?v=20260803a';

let state = {
  filter: 'inbox',
  reviews: [],
  summary: {},
  config: {},
  activeId: null,
  googlePlacesConfigured: false,
  suggestedPlaceId: null,
  companyReviewLinks: {},
  showSettings: false,
};

const PLATFORM_LABELS = {
  google: 'Google',
  yelp: 'Yelp',
  facebook: 'Facebook',
  tripadvisor: 'TripAdvisor',
  other: 'Other',
};

const STATUS_LABELS = {
  new: 'New',
  todo: 'To-do',
  responded: 'Responded',
  dismissed: 'Dismissed',
};

export function initOnlineReviewsPanel(_deps) {
  /* reserved for shared shell refs */
}

function rootEl() {
  return document.getElementById('online-reviews-panel');
}

function starsHtml(rating) {
  const n = Math.round(Number(rating) || 0);
  const full = '★'.repeat(Math.min(5, Math.max(0, n)));
  const empty = '☆'.repeat(5 - full.length);
  return `<span class="or-stars" aria-label="${n} stars">${full}${empty}</span>`;
}

function platformBadge(platform) {
  return `<span class="or-platform or-platform--${escHtml(platform)}">${escHtml(PLATFORM_LABELS[platform] || platform)}</span>`;
}

function statusBadge(status) {
  return `<span class="or-status or-status--${escHtml(status)}">${escHtml(STATUS_LABELS[status] || status)}</span>`;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function activeReview() {
  return state.reviews.find((r) => r.id === state.activeId) || null;
}

function reviewSnippet(text, max = 90) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function renderSettingsBlock() {
  const cfg = state.config || {};
  const syncHint = state.googlePlacesConfigured
    ? `<p class="prof-hint prof-hint--block">Google Places API is configured. Sync pulls up to five recent reviews.</p>`
    : `<p class="prof-hint prof-hint--block">Set <code>GOOGLE_MAPS_API_KEY</code> on the server to enable Google sync.</p>`;

  const lastSync = cfg.lastSyncAt
    ? `Last sync: ${formatDate(cfg.lastSyncAt)}${cfg.lastSyncError ? ` — ${escHtml(cfg.lastSyncError)}` : ''}`
    : 'Not synced yet.';

  return (
    `<section class="or-settings prof-card">` +
    `<h3 class="or-settings-title">Sync settings</h3>` +
    syncHint +
    `<label class="prof-field">` +
    `<span class="prof-label">Google Place ID</span>` +
    `<input type="text" id="or-google-place-id" class="prof-input" placeholder="ChIJ… or paste Maps URL" value="${escHtml(cfg.googlePlaceId || state.suggestedPlaceId || '')}" />` +
    `</label>` +
    `<label class="prof-check-row">` +
    `<input type="checkbox" id="or-sync-enabled"${cfg.syncEnabled !== false ? ' checked' : ''} />` +
    `<span>Enable Google sync</span>` +
    `</label>` +
    `<p class="prof-hint">${escHtml(lastSync)}</p>` +
    `<div class="or-settings-actions">` +
    `<button type="button" class="de-btn de-btn--secondary" id="or-save-config">Save settings</button>` +
    `<button type="button" class="de-btn" id="or-sync-now">Sync Google now</button>` +
    `</div>` +
    `</section>`
  );
}

function renderReviewRow(review) {
  const active = review.id === state.activeId ? ' or-row--active' : '';
  return (
    `<button type="button" class="or-row${active}" data-review-id="${escHtml(review.id)}">` +
    `<span class="or-row-top">` +
    `${platformBadge(review.platform)}` +
    `${starsHtml(review.rating)}` +
    `${statusBadge(review.status)}` +
    `</span>` +
    `<span class="or-row-author">${escHtml(review.authorName || 'Anonymous')}</span>` +
    `<span class="or-row-snippet">${escHtml(reviewSnippet(review.reviewText))}</span>` +
    `<span class="or-row-date">${escHtml(formatDate(review.reviewedAt))}</span>` +
    `</button>`
  );
}

function renderDetail(review) {
  if (!review) {
    return (
      `<div class="or-detail-empty">` +
      `<p>Select a review to draft a response.</p>` +
      `<p class="prof-hint">Use <strong>Sync Google</strong> or <strong>Add review</strong> to populate the inbox.</p>` +
      `</div>`
    );
  }

  const links = state.companyReviewLinks || {};
  const platformLink =
    review.reviewUrl ||
    (review.platform === 'google' ? links.google : review.platform === 'yelp' ? links.yelp : null);

  return (
    `<div class="or-detail">` +
    `<header class="or-detail-header">` +
    `<div class="or-detail-meta">` +
    `${platformBadge(review.platform)}` +
    `${starsHtml(review.rating)}` +
    `${statusBadge(review.status)}` +
    `</div>` +
    `<h2 class="or-detail-author">${escHtml(review.authorName || 'Anonymous')}</h2>` +
    `<p class="or-detail-date">${escHtml(formatDate(review.reviewedAt))}</p>` +
    (platformLink
      ? `<a class="or-detail-link" href="${escHtml(platformLink)}" target="_blank" rel="noopener">Open on ${escHtml(PLATFORM_LABELS[review.platform] || 'platform')} ↗</a>`
      : '') +
    `</header>` +
    `<div class="or-detail-body">${escHtml(review.reviewText || '(No review text)')}</div>` +
    `<div class="or-detail-actions">` +
    `<button type="button" class="de-btn de-btn--secondary or-status-btn" data-status="todo"${review.status === 'todo' ? ' disabled' : ''}>Queue to-do</button>` +
    `<button type="button" class="de-btn de-btn--secondary or-status-btn" data-status="dismissed"${review.status === 'dismissed' ? ' disabled' : ''}>Dismiss</button>` +
    `<button type="button" class="de-btn or-status-btn" data-status="responded"${review.status === 'responded' ? ' disabled' : ''}>Mark responded</button>` +
    `</div>` +
    `<label class="prof-field or-draft-field">` +
    `<span class="prof-label">Response draft <span class="prof-hint">(copy to the platform — not posted automatically)</span></span>` +
    `<textarea id="or-response-draft" class="prof-input or-draft" rows="5" placeholder="Thank you for the kind words…">${escHtml(review.responseDraft || '')}</textarea>` +
    `</label>` +
    `<label class="prof-field">` +
    `<span class="prof-label">Posted response</span>` +
    `<textarea id="or-response-text" class="prof-input" rows="3" placeholder="Paste what you posted on Google/Yelp…">${escHtml(review.responseText || '')}</textarea>` +
    `</label>` +
    `<label class="prof-field">` +
    `<span class="prof-label">Internal notes</span>` +
    `<input type="text" id="or-notes" class="prof-input" value="${escHtml(review.notes || '')}" />` +
    `</label>` +
    `<div class="or-detail-save">` +
    `<button type="button" class="de-btn" id="or-save-review">Save</button>` +
    `</div>` +
    `</div>`
  );
}

function renderPanel() {
  const root = rootEl();
  if (!root) return;

  const summary = state.summary || {};
  const inboxCount = summary.inbox ?? 0;

  const filterPills = [
    { id: 'inbox', label: `Inbox${inboxCount ? ` (${inboxCount})` : ''}` },
    { id: 'todo', label: 'To-do' },
    { id: 'all', label: 'All' },
    { id: 'responded', label: 'Responded' },
  ];

  root.innerHTML =
    `<div class="or-panel ch-split">` +
    `<aside class="ch-sidebar or-sidebar">` +
    `<div class="or-toolbar">` +
    `<h1 class="or-title">Reviews</h1>` +
    `<div class="or-toolbar-btns">` +
    `<button type="button" class="ios-icon-btn" id="or-add-review" title="Add review manually" aria-label="Add review">+</button>` +
    `<button type="button" class="ios-icon-btn" id="or-toggle-settings" title="Sync settings" aria-label="Settings">⚙</button>` +
    `</div>` +
    `</div>` +
    (state.showSettings ? renderSettingsBlock() : '') +
    `<div class="or-filters" id="or-filters"></div>` +
    `<div class="or-list" id="or-list">` +
    (state.reviews.length
      ? state.reviews.map((r) => renderReviewRow(r)).join('')
      : `<p class="or-empty">No reviews in this view.</p>`) +
    `</div>` +
    `</aside>` +
    `<main class="ch-main or-main" id="or-detail-pane">${renderDetail(activeReview())}</main>` +
    `</div>`;

  const filtersEl = root.querySelector('#or-filters');
  if (filtersEl) {
    createSlidingPillSelect({
      container: filtersEl,
      options: filterPills,
      value: state.filter,
      onChange: (val) => {
        state.filter = val;
        void loadOnlineReviewsTab({ keepSelection: false });
      },
    });
  }

  initSidebarLayout(root);
  syncAdminSplitView(root);

  bindPanelEvents(root);
}

async function apiGet(query = '') {
  const res = await adminFetch(`/api/admin/online-reviews${query}`, { cache: 'no-store' });
  return readAdminJson(res);
}

async function apiPost(body) {
  const res = await adminFetch('/api/admin/online-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readAdminJson(res);
}

function bindPanelEvents(root) {
  root.querySelector('#or-add-review')?.addEventListener('click', () => void openAddReviewDialog());
  root.querySelector('#or-toggle-settings')?.addEventListener('click', () => {
    state.showSettings = !state.showSettings;
    renderPanel();
  });

  root.querySelector('#or-save-config')?.addEventListener('click', async () => {
    try {
      const placeInput = root.querySelector('#or-google-place-id');
      const syncCheck = root.querySelector('#or-sync-enabled');
      const data = await apiPost({
        action: 'save_config',
        googlePlaceId: placeInput?.value ?? '',
        syncEnabled: !!syncCheck?.checked,
      });
      if (!data.ok) throw new Error(data.error || 'Save failed');
      state.config = data.config;
      osAlert('Settings saved.', 'success');
    } catch (e) {
      osAlert(e.message || 'Save failed', 'error');
    }
  });

  root.querySelector('#or-sync-now')?.addEventListener('click', async () => {
    const btn = root.querySelector('#or-sync-now');
    if (btn) btn.disabled = true;
    try {
      const placeInput = root.querySelector('#or-google-place-id');
      const data = await apiPost({
        action: 'sync',
        googlePlaceId: placeInput?.value ?? '',
      });
      if (!data.ok) throw new Error(data.error || 'Sync failed');
      state.reviews = data.reviews || [];
      state.summary = data.summary || {};
      state.config = data.config || state.config;
      if (data.syncResult?.errors?.length) {
        osAlert(data.syncResult.errors.join(' '), 'warning');
      } else {
        osAlert(`Synced ${data.syncResult?.upserted ?? 0} review(s).`, 'success');
      }
      renderPanel();
    } catch (e) {
      osAlert(e.message || 'Sync failed', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  root.querySelectorAll('.or-row').forEach((row) => {
    row.addEventListener('click', () => {
      state.activeId = row.getAttribute('data-review-id');
      const detailPane = root.querySelector('#or-detail-pane');
      if (detailPane) {
        detailPane.innerHTML = renderDetail(activeReview());
        bindDetailEvents(root);
      }
      root.querySelectorAll('.or-row').forEach((r) => r.classList.remove('or-row--active'));
      row.classList.add('or-row--active');
    });
  });

  bindDetailEvents(root);

  const reviewsList = root.querySelector('#or-list, .or-list');
  if (reviewsList instanceof HTMLElement) {
    attachIosPullToRefresh(reviewsList, () => loadOnlineReviewsTab({ keepSelection: true }));
  }
}

function bindDetailEvents(root) {
  root.querySelector('#or-save-review')?.addEventListener('click', async () => {
    const review = activeReview();
    if (!review) return;
    try {
      const data = await apiPost({
        action: 'update',
        id: review.id,
        responseDraft: root.querySelector('#or-response-draft')?.value ?? '',
        responseText: root.querySelector('#or-response-text')?.value ?? '',
        notes: root.querySelector('#or-notes')?.value ?? '',
      });
      if (!data.ok) throw new Error(data.error || 'Save failed');
      state.summary = data.summary || state.summary;
      const idx = state.reviews.findIndex((r) => r.id === review.id);
      if (idx >= 0) state.reviews[idx] = data.review;
      osAlert('Saved.', 'success');
    } catch (e) {
      osAlert(e.message || 'Save failed', 'error');
    }
  });

  root.querySelectorAll('.or-status-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const review = activeReview();
      const status = btn.getAttribute('data-status');
      if (!review || !status) return;
      try {
        const data = await apiPost({
          action: 'update',
          id: review.id,
          status,
          responseDraft: root.querySelector('#or-response-draft')?.value ?? '',
          responseText: root.querySelector('#or-response-text')?.value ?? '',
          notes: root.querySelector('#or-notes')?.value ?? '',
        });
        if (!data.ok) throw new Error(data.error || 'Update failed');
        state.summary = data.summary || state.summary;
        const idx = state.reviews.findIndex((r) => r.id === review.id);
        if (idx >= 0) state.reviews[idx] = data.review;
        if (state.filter === 'inbox' && (status === 'responded' || status === 'dismissed')) {
          state.reviews.splice(idx, 1);
          state.activeId = state.reviews[0]?.id ?? null;
          renderPanel();
        } else {
          const detailPane = root.querySelector('#or-detail-pane');
          if (detailPane) detailPane.innerHTML = renderDetail(data.review);
          bindDetailEvents(root);
          const row = root.querySelector(`.or-row[data-review-id="${review.id}"]`);
          if (row) row.outerHTML = renderReviewRow(data.review);
        }
        osAlert(`Marked ${STATUS_LABELS[status] || status}.`, 'success');
      } catch (e) {
        osAlert(e.message || 'Update failed', 'error');
      }
    });
  });
}

async function openAddReviewDialog() {
  const backdrop = openOsDialogBackdrop();
  backdrop.innerHTML =
    `<div class="os-dialog or-add-dialog" role="dialog" aria-labelledby="or-add-title">` +
    `<h2 id="or-add-title">Add review manually</h2>` +
    `<label class="prof-field"><span class="prof-label">Platform</span>` +
    `<select id="or-add-platform" class="prof-input">` +
    Object.entries(PLATFORM_LABELS)
      .map(([k, v]) => `<option value="${k}">${escHtml(v)}</option>`)
      .join('') +
    `</select></label>` +
    `<label class="prof-field"><span class="prof-label">Author</span>` +
    `<input type="text" id="or-add-author" class="prof-input" /></label>` +
    `<label class="prof-field"><span class="prof-label">Rating (1–5)</span>` +
    `<input type="number" id="or-add-rating" class="prof-input" min="1" max="5" step="1" /></label>` +
    `<label class="prof-field"><span class="prof-label">Review text</span>` +
    `<textarea id="or-add-text" class="prof-input" rows="4"></textarea></label>` +
    `<label class="prof-field"><span class="prof-label">Link (optional)</span>` +
    `<input type="url" id="or-add-url" class="prof-input" placeholder="https://…" /></label>` +
    `<div class="os-dialog-actions">` +
    `<button type="button" class="de-btn de-btn--secondary" id="or-add-cancel">Cancel</button>` +
    `<button type="button" class="de-btn" id="or-add-save">Add to inbox</button>` +
    `</div></div>`;

  backdrop.querySelector('#or-add-cancel')?.addEventListener('click', () => closeOsDialogBackdrop());
  backdrop.querySelector('#or-add-save')?.addEventListener('click', async () => {
    try {
      const data = await apiPost({
        action: 'create',
        platform: backdrop.querySelector('#or-add-platform')?.value,
        authorName: backdrop.querySelector('#or-add-author')?.value,
        rating: backdrop.querySelector('#or-add-rating')?.value,
        reviewText: backdrop.querySelector('#or-add-text')?.value,
        reviewUrl: backdrop.querySelector('#or-add-url')?.value,
      });
      if (!data.ok) throw new Error(data.error || 'Create failed');
      closeOsDialogBackdrop();
      state.summary = data.summary || state.summary;
      state.filter = 'inbox';
      state.activeId = data.review?.id ?? null;
      await loadOnlineReviewsTab({ keepSelection: true });
      osAlert('Review added.', 'success');
    } catch (e) {
      osAlert(e.message || 'Create failed', 'error');
    }
  });
}

export async function loadOnlineReviewsTab(opts = {}) {
  if (!hasInstallFeature('online_reviews')) return;

  const root = rootEl();
  if (!root) return;

  if (!opts.keepSelection) {
    mountPanelSkeleton(root, 'list', 'Loading reviews…', { contentSelector: '.or-sidebar' });
  }

  try {
    const statusQuery =
      state.filter === 'all'
        ? '?status=all'
        : state.filter === 'inbox'
          ? '?status=inbox'
          : `?status=${encodeURIComponent(state.filter)}`;

    const data = await apiGet(statusQuery);
    if (!data.ok) throw new Error(data.error || 'Load failed');

    state.reviews = data.reviews || [];
    state.summary = data.summary || {};
    state.config = data.config || {};
    state.googlePlacesConfigured = !!data.googlePlacesConfigured;
    state.suggestedPlaceId = data.suggestedPlaceId ?? null;
    state.companyReviewLinks = data.companyReviewLinks || {};

    if (!opts.keepSelection || !state.activeId) {
      state.activeId = state.reviews[0]?.id ?? null;
    } else if (!state.reviews.some((r) => r.id === state.activeId)) {
      state.activeId = state.reviews[0]?.id ?? null;
    }

    renderPanel();
  } catch (e) {
    root.innerHTML = `<div class="de-loading de-error">Failed to load reviews: ${escHtml(e.message)}</div>`;
  }
}

function hasInstallFeature(id) {
  const features = window.__installConfig?.features;
  return Array.isArray(features) && features.includes(id);
}
