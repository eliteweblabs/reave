/**
 * Admin media library — upload, browse, and delete shared assets.
 */
import { paneDeleteIcon } from './admin-ui.js?v=20260807e';
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton } from './shared.js?v=20260805j';
import { osAlert } from './os-dialog.js?v=20260804c';

const MEDIA_API = '/api/admin/media';

let state = {
  items: [],
  search: '',
  loading: false,
};

export function initMediaPanel(_deps) {
  /* reserved */
}

function rootEl() {
  return document.getElementById('media-panel');
}

function formatBytes(n) {
  const size = Number(n) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function filteredItems() {
  const q = state.search.trim().toLowerCase();
  if (!q) return state.items;
  return state.items.filter((item) => {
    const hay = `${item.filename || ''} ${item.altText || ''} ${item.mediaType || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function isImageItem(item) {
  return String(item.mediaType || '').startsWith('image/');
}

function renderGridItem(item) {
  const preview = isImageItem(item)
    ? `<img class="ml-grid-thumb" src="${escHtml(item.thumbnailUrl || item.url)}" alt="" loading="lazy" />`
    : `<div class="ml-grid-file">${escHtml((item.filename || 'file').split('.').pop() || 'PDF')}</div>`;
  return (
    `<article class="ml-grid-item" data-media-id="${escHtml(item.id)}">` +
    `<div class="ml-grid-preview">${preview}</div>` +
    `<div class="ml-grid-meta">` +
    `<span class="ml-grid-name" title="${escHtml(item.filename || '')}">${escHtml(item.filename || 'Untitled')}</span>` +
    `<span class="ml-grid-sub">${escHtml(formatBytes(item.sizeBytes))} · ${escHtml(formatDate(item.createdAt))}</span>` +
    `</div>` +
    `<div class="ml-grid-actions">` +
    `<button type="button" class="de-btn de-btn-secondary ml-copy-url" data-url="${escHtml(item.url)}">Copy URL</button>` +
    `<span class="ml-delete-slot" data-media-id="${escHtml(item.id)}"></span>` +
    `</div>` +
    `</article>`
  );
}

function renderPanel() {
  const items = filteredItems();
  const empty = !state.loading && items.length === 0;
  return (
    `<div class="ml-panel-scroll">` +
    `<div class="ml-header prof-card">` +
    `<div class="ml-header-row">` +
    `<div>` +
    `<h1 class="prof-title">Media library</h1>` +
    `<p class="prof-subtitle">Upload once, reuse for company branding, client logos, and more.</p>` +
    `</div>` +
    `<label class="de-btn ml-upload-btn">` +
    `<input type="file" id="ml-upload-input" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf" hidden />` +
    `Upload` +
    `</label>` +
    `</div>` +
    `<input type="search" id="ml-search" class="ml-search prof-input" placeholder="Search files…" value="${escHtml(state.search)}" />` +
    `<p class="prof-hint prof-hint--block">PNG, JPEG, WebP, GIF, SVG, or PDF — max 10 MB each. Branding picks require PNG/JPEG/WebP under 2 MB.</p>` +
    `</div>` +
    (state.loading
      ? `<div class="ml-grid ml-grid--loading"><p class="prof-hint">Loading…</p></div>`
      : empty
        ? `<div class="ml-empty prof-card"><p>No media yet. Upload an image or PDF to get started.</p></div>`
        : `<div class="ml-grid">${items.map(renderGridItem).join('')}</div>`) +
    `</div>`
  );
}

async function fetchItems() {
  state.loading = true;
  renderAndBind();
  try {
    const res = await adminFetch(MEDIA_API);
    const json = await readAdminJson(res);
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    state.items = Array.isArray(json.items) ? json.items : [];
  } catch (e) {
    await osAlert({ title: 'Could not load media', bodyHtml: `<p>${escHtml(e.message || 'Please try again.')}</p>` });
    state.items = [];
  } finally {
    state.loading = false;
    renderAndBind();
  }
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await adminFetch(MEDIA_API, { method: 'POST', body: fd });
  const json = await readAdminJson(res);
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  if (json.item) {
    state.items = [json.item, ...state.items.filter((i) => i.id !== json.item.id)];
  } else {
    await fetchItems();
  }
}

async function deleteItem(id) {
  const res = await adminFetch(`${MEDIA_API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const json = await readAdminJson(res);
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  state.items = state.items.filter((i) => i.id !== id);
}

function bindPanelEvents(root) {
  const search = root.querySelector('#ml-search');
  search?.addEventListener('input', () => {
    if (!(search instanceof HTMLInputElement)) return;
    state.search = search.value;
    renderAndBind();
  });

  const uploadInput = root.querySelector('#ml-upload-input');
  uploadInput?.addEventListener('change', async () => {
    if (!(uploadInput instanceof HTMLInputElement) || !uploadInput.files?.length) return;
    const file = uploadInput.files[0];
    uploadInput.disabled = true;
    try {
      await uploadFile(file);
    } catch (e) {
      await osAlert({ title: 'Upload failed', bodyHtml: `<p>${escHtml(e.message || 'Please try again.')}</p>` });
    } finally {
      uploadInput.value = '';
      uploadInput.disabled = false;
    }
  });

  root.querySelectorAll('.ml-copy-url').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-url') || '';
      if (!url) return;
      const absolute = url.startsWith('http') ? url : `${location.origin}${url}`;
      try {
        await navigator.clipboard.writeText(absolute);
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = prev;
        }, 1200);
      } catch {
        await osAlert({ title: 'Copy failed', bodyHtml: `<p>${escHtml(absolute)}</p>` });
      }
    });
  });

  root.querySelectorAll('.ml-delete-slot').forEach((slot) => {
    const id = slot.getAttribute('data-media-id') || '';
    if (!id) return;
    const item = state.items.find((i) => i.id === id);
    const name = item?.filename || 'file';
    slot.replaceWith(
      paneDeleteIcon({
        label: `Delete ${name}`,
        className: 'ml-delete',
        onClick: async () => {
          try {
            await deleteItem(id);
            renderAndBind();
          } catch (e) {
            await osAlert({ title: 'Delete failed', bodyHtml: `<p>${escHtml(e.message || 'Please try again.')}</p>` });
          }
        },
      }),
    );
  });
}

function renderAndBind() {
  const root = rootEl();
  if (!root) return;
  root.innerHTML = renderPanel();
  bindPanelEvents(root);
}

export async function loadMediaTab() {
  const root = rootEl();
  if (!root) return;
  if (!state.items.length && !state.loading) {
    mountPanelSkeleton(root, 'list', 'Loading media library…');
  }
  await fetchItems();
}
