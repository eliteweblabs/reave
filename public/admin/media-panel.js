/**
 * Admin media library — upload, browse, and delete shared assets.
 */
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton } from './shared.js?v=20260808k';
import { osAlert, osConfirm } from './os-dialog.js?v=20260804c';
import { iosIcon, deBtnIconSvg } from './admin-ui.js?v=20260810a';

const MEDIA_API = '/api/admin/media';
const ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf';

let state = {
  items: [],
  search: '',
  loading: false,
  uploading: false,
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

function uploadBtnHtml(label) {
  return (
    `<span class="de-btn-icon" aria-hidden="true">${deBtnIconSvg('share', 16)}</span>` +
    `<span class="de-btn-label">${escHtml(label)}</span>`
  );
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
    `<button type="button" class="de-btn de-btn-secondary ml-delete" data-media-id="${escHtml(item.id)}">Delete</button>` +
    `</div>` +
    `</article>`
  );
}

function renderEmptyState(isFiltered) {
  if (isFiltered) {
    return (
      `<div class="ml-empty">` +
      `<div class="list-empty-state-icon">${iosIcon('search', 36)}</div>` +
      `<div class="list-empty-state-body">No files match your search.</div>` +
      `</div>`
    );
  }
  return (
    `<div class="ml-dropzone ml-dropzone--empty${state.uploading ? ' ml-dropzone--busy' : ''}" id="ml-dropzone" tabindex="0" role="button" aria-label="Upload media files">` +
    `<input type="file" id="ml-upload-input" class="ml-upload-input" accept="${ACCEPT}" multiple hidden />` +
    `<div class="ml-dropzone-icon" aria-hidden="true">${iosIcon('image', 40)}</div>` +
    `<p class="ml-dropzone-title">${state.uploading ? 'Uploading…' : 'No media yet'}</p>` +
    `<p class="ml-dropzone-sub">${state.uploading ? 'Please wait while files are added to the library.' : 'Drop images or PDFs here, or choose files to upload.'}</p>` +
    `<span class="de-btn de-btn-with-icon ml-dropzone-cta">${uploadBtnHtml(state.uploading ? 'Uploading…' : 'Upload files')}</span>` +
    `<p class="ml-dropzone-hint">PNG, JPEG, WebP, GIF, SVG, or PDF — max 10 MB each</p>` +
    `</div>`
  );
}

function renderPanel() {
  const items = filteredItems();
  const empty = !state.loading && items.length === 0;
  const isFiltered = empty && state.search.trim() && state.items.length > 0;
  const uploadLabel = state.uploading ? 'Uploading…' : 'Upload files';

  return (
    `<div class="ml-panel-scroll">` +
    `<div class="ml-header">` +
    `<div class="ml-header-row">` +
    `<div class="ml-header-copy">` +
    `<h1 class="prof-title">Media library</h1>` +
    `<p class="prof-subtitle">Upload once, reuse for company branding, client logos, and more.</p>` +
    `</div>` +
    (!empty || isFiltered
      ? `<button type="button" class="de-btn de-btn-with-icon ml-upload-btn" id="ml-upload-trigger" ${state.uploading ? 'disabled' : ''}>` +
        uploadBtnHtml(uploadLabel) +
        `</button>` +
        `<input type="file" id="ml-upload-input" class="ml-upload-input" accept="${ACCEPT}" multiple hidden />`
      : '') +
    `</div>` +
    `<div class="ml-toolbar">` +
    `<input type="search" id="ml-search" class="ml-search prof-input" placeholder="Search files…" value="${escHtml(state.search)}" ${state.uploading ? 'disabled' : ''} />` +
    (!empty
      ? `<p class="prof-hint ml-hint">PNG, JPEG, WebP, GIF, SVG, or PDF — max 10 MB each. Branding picks require PNG/JPEG/WebP under 2 MB.</p>`
      : '') +
    `</div>` +
    `</div>` +
    (state.loading
      ? `<div class="ml-grid ml-grid--loading"><p class="prof-hint">Loading…</p></div>`
      : empty
        ? renderEmptyState(isFiltered)
        : `<div class="ml-dropzone ml-dropzone--grid" id="ml-dropzone">` +
          `<div class="ml-grid">${items.map(renderGridItem).join('')}</div>` +
          `</div>`) +
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
  }
  return json.item;
}

async function uploadFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f && f.size);
  if (!files.length) return;

  state.uploading = true;
  renderAndBind();

  const errors = [];
  let uploaded = 0;
  try {
    for (const file of files) {
      try {
        await uploadFile(file);
        uploaded += 1;
      } catch (e) {
        errors.push(`${file.name || 'file'}: ${e.message || 'failed'}`);
      }
    }
    if (!uploaded && errors.length) {
      await osAlert({
        title: 'Upload failed',
        bodyHtml: `<p>${escHtml(errors.join('\n'))}</p>`,
      });
    } else if (errors.length) {
      await osAlert({
        title: `Uploaded ${uploaded} of ${files.length}`,
        bodyHtml: `<p>${escHtml(errors.join('\n'))}</p>`,
      });
    }
  } finally {
    state.uploading = false;
    // Refresh from server so thumbs/urls stay consistent after batch upload.
    if (uploaded) {
      await fetchItems();
    } else {
      renderAndBind();
    }
  }
}

async function deleteItem(id) {
  const res = await adminFetch(`${MEDIA_API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const json = await readAdminJson(res);
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  state.items = state.items.filter((i) => i.id !== id);
}

function setDropActive(el, on) {
  el?.classList.toggle('ml-dropzone--active', Boolean(on));
}

function bindPanelEvents(root) {
  const search = root.querySelector('#ml-search');
  search?.addEventListener('input', () => {
    if (!(search instanceof HTMLInputElement)) return;
    state.search = search.value;
    renderAndBind();
  });

  const uploadInput = root.querySelector('#ml-upload-input');
  const triggerUpload = () => {
    if (state.uploading) return;
    if (uploadInput instanceof HTMLInputElement) uploadInput.click();
  };

  root.querySelector('#ml-upload-trigger')?.addEventListener('click', (e) => {
    e.preventDefault();
    triggerUpload();
  });

  root.querySelector('.ml-dropzone-cta')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerUpload();
  });

  const emptyDrop = root.querySelector('.ml-dropzone--empty');
  emptyDrop?.addEventListener('click', (e) => {
    if (e.target.closest('.ml-dropzone-cta')) return;
    triggerUpload();
  });
  emptyDrop?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerUpload();
    }
  });

  uploadInput?.addEventListener('change', async () => {
    if (!(uploadInput instanceof HTMLInputElement) || !uploadInput.files?.length) return;
    const files = Array.from(uploadInput.files);
    uploadInput.value = '';
    await uploadFiles(files);
  });

  const dropzone = root.querySelector('#ml-dropzone');
  if (dropzone) {
    let dragDepth = 0;
    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth += 1;
      setDropActive(dropzone, true);
    });
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDropActive(dropzone, false);
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth = 0;
      setDropActive(dropzone, false);
      if (state.uploading) return;
      const files = e.dataTransfer?.files;
      if (files?.length) await uploadFiles(files);
    });
  }

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

  root.querySelectorAll('.ml-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-media-id') || '';
      if (!id) return;
      const item = state.items.find((i) => i.id === id);
      const name = item?.filename || 'this file';
      const ok = await osConfirm({
        title: 'Delete from library?',
        bodyHtml: `<p>${escHtml(name)} will be removed. Branding already applied is not affected.</p>`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        await deleteItem(id);
        renderAndBind();
      } catch (e) {
        await osAlert({ title: 'Delete failed', bodyHtml: `<p>${escHtml(e.message || 'Please try again.')}</p>` });
        btn.disabled = false;
      }
    });
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
