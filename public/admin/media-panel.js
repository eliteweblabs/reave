/**
 * Admin media library — WordPress-style grid + attachment details.
 */
import { escHtml, adminFetch, readAdminJson, mountPanelSkeleton } from './shared.js?v=20260810a';
import { osAlert, osConfirm } from './os-dialog.js?v=20260804c';
import { iosIcon, deBtnIconSvg, createSlidingPillSelect } from './admin-ui.js?v=20260811a';

const MEDIA_API = '/api/admin/media';
const ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf';

/** @type {{ items: any[], search: string, filter: 'all'|'images'|'documents', loading: boolean, uploading: boolean, selectedId: string|null, detailOpen: boolean }} */
let state = {
  items: [],
  search: '',
  filter: 'all',
  loading: false,
  uploading: false,
  selectedId: null,
  detailOpen: false,
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

function isImageItem(item) {
  return String(item?.mediaType || '').startsWith('image/');
}

function isPdfItem(item) {
  return String(item?.mediaType || '') === 'application/pdf';
}

function fileExt(item) {
  const name = String(item?.filename || '');
  const m = name.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toUpperCase();
  if (isPdfItem(item)) return 'PDF';
  const type = String(item?.mediaType || '');
  if (type.includes('/')) return type.split('/')[1].toUpperCase();
  return 'FILE';
}

function absoluteUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${location.origin}${url}`;
}

function thumbSrc(item) {
  return item?.thumbnailUrl || item?.url || '';
}

function filteredItems() {
  const q = state.search.trim().toLowerCase();
  return state.items.filter((item) => {
    if (state.filter === 'images' && !isImageItem(item)) return false;
    if (state.filter === 'documents' && isImageItem(item)) return false;
    if (!q) return true;
    const hay = `${item.filename || ''} ${item.altText || ''} ${item.mediaType || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function selectedItem() {
  if (!state.selectedId) return null;
  return state.items.find((i) => i.id === state.selectedId) || null;
}

function selectedIndexInFiltered() {
  const items = filteredItems();
  return items.findIndex((i) => i.id === state.selectedId);
}

function uploadBtnHtml(label) {
  return (
    `<span class="de-btn-icon" aria-hidden="true">${deBtnIconSvg('share', 16)}</span>` +
    `<span class="de-btn-label">${escHtml(label)}</span>`
  );
}

function renderGridItem(item) {
  const selected = item.id === state.selectedId && state.detailOpen;
  const preview = isImageItem(item)
    ? `<img class="ml-attach-thumb" src="${escHtml(thumbSrc(item))}" alt="" loading="lazy" data-fallback="${escHtml(item.url || '')}" />`
    : `<div class="ml-attach-icon" aria-hidden="true">` +
      `<span class="ml-attach-icon-glyph">${iosIcon(isPdfItem(item) ? 'receipt' : 'paperclip', 28)}</span>` +
      `<span class="ml-attach-ext">${escHtml(fileExt(item))}</span>` +
      `</div>`;
  return (
    `<button type="button" class="ml-attach${selected ? ' is-selected' : ''}" data-media-id="${escHtml(item.id)}" aria-label="${escHtml(item.filename || 'Untitled')}" aria-pressed="${selected ? 'true' : 'false'}">` +
    `<span class="ml-attach-preview">${preview}</span>` +
    `<span class="ml-attach-caption">${escHtml(item.filename || 'Untitled')}</span>` +
    `<span class="ml-attach-check" aria-hidden="true">${iosIcon('check', 14)}</span>` +
    `</button>`
  );
}

function renderEmptyState(isFiltered) {
  if (isFiltered) {
    return (
      `<div class="ml-empty">` +
      `<div class="list-empty-state-icon">${iosIcon('search', 36)}</div>` +
      `<div class="list-empty-state-body">No media files found.</div>` +
      `</div>`
    );
  }
  return (
    `<div class="ml-dropzone ml-dropzone--empty${state.uploading ? ' ml-dropzone--busy' : ''}" id="ml-empty-drop" tabindex="0" role="button" aria-label="Upload media files">` +
    `<div class="ml-dropzone-icon" aria-hidden="true">${iosIcon('image', 40)}</div>` +
    `<p class="ml-dropzone-title">${state.uploading ? 'Uploading…' : 'Drop files to upload'}</p>` +
    `<p class="ml-dropzone-sub">${state.uploading ? 'Please wait while files are added to the library.' : 'or click to select images and PDFs'}</p>` +
    `<span class="de-btn de-btn-with-icon ml-dropzone-cta">${uploadBtnHtml(state.uploading ? 'Uploading…' : 'Select Files')}</span>` +
    `<p class="ml-dropzone-hint">PNG, JPEG, WebP, GIF, SVG, or PDF — max 10 MB each</p>` +
    `</div>`
  );
}

function renderDetailPreview(item) {
  if (isImageItem(item)) {
    return (
      `<div class="ml-detail-media ml-detail-media--image">` +
      `<img class="ml-detail-image" src="${escHtml(item.url)}" alt="${escHtml(item.altText || item.filename || '')}" />` +
      `</div>`
    );
  }
  if (isPdfItem(item)) {
    return (
      `<div class="ml-detail-media ml-detail-media--pdf">` +
      `<iframe class="ml-detail-pdf" src="${escHtml(item.url)}#toolbar=0" title="${escHtml(item.filename || 'PDF')}"></iframe>` +
      `</div>`
    );
  }
  return (
    `<div class="ml-detail-media ml-detail-media--file">` +
    `<div class="ml-attach-icon ml-attach-icon--lg" aria-hidden="true">` +
    `<span class="ml-attach-icon-glyph">${iosIcon('paperclip', 40)}</span>` +
    `<span class="ml-attach-ext">${escHtml(fileExt(item))}</span>` +
    `</div>` +
    `</div>`
  );
}

function renderAttachmentDetails(item) {
  if (!item) return '';
  const items = filteredItems();
  const idx = items.findIndex((i) => i.id === item.id);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < items.length - 1;
  const abs = absoluteUrl(item.url);

  return (
    `<div class="ml-detail-backdrop" id="ml-detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="ml-detail-title">` +
    `<div class="ml-detail-frame">` +
    `<header class="ml-detail-header">` +
    `<h2 class="ml-detail-title" id="ml-detail-title">Attachment details</h2>` +
    `<div class="ml-detail-nav">` +
    `<button type="button" class="ml-detail-nav-btn" id="ml-detail-prev" ${hasPrev ? '' : 'disabled'} aria-label="Previous media">${iosIcon('chevron-left', 20)}</button>` +
    `<button type="button" class="ml-detail-nav-btn" id="ml-detail-next" ${hasNext ? '' : 'disabled'} aria-label="Next media">${iosIcon('chevron-right', 20)}</button>` +
    `<button type="button" class="ml-detail-close" id="ml-detail-close" aria-label="Close">${iosIcon('x', 18)}</button>` +
    `</div>` +
    `</header>` +
    `<div class="ml-detail-body">` +
    `<div class="ml-detail-preview-col">${renderDetailPreview(item)}</div>` +
    `<aside class="ml-detail-sidebar">` +
    `<div class="ml-detail-filename" title="${escHtml(item.filename || '')}">${escHtml(item.filename || 'Untitled')}</div>` +
    `<dl class="ml-detail-meta">` +
    `<div><dt>Uploaded on</dt><dd>${escHtml(formatDate(item.createdAt))}</dd></div>` +
    `<div><dt>File type</dt><dd>${escHtml(item.mediaType || '—')}</dd></div>` +
    `<div><dt>File size</dt><dd>${escHtml(formatBytes(item.sizeBytes))}</dd></div>` +
    (isImageItem(item)
      ? `<div><dt>Dimensions</dt><dd id="ml-detail-dims">Loading…</dd></div>`
      : '') +
    `</dl>` +
    `<label class="ml-detail-field">` +
    `<span>File URL</span>` +
    `<div class="ml-detail-url-row">` +
    `<input type="text" class="ml-detail-url" id="ml-detail-url" readonly value="${escHtml(abs)}" />` +
    `<button type="button" class="de-btn de-btn-secondary" id="ml-detail-copy">Copy URL to clipboard</button>` +
    `</div>` +
    `</label>` +
    (item.altText
      ? `<label class="ml-detail-field"><span>Alt text</span><div class="ml-detail-alt">${escHtml(item.altText)}</div></label>`
      : '') +
    `<div class="ml-detail-actions">` +
    `<a class="ml-detail-link" href="${escHtml(item.url)}" download="${escHtml(item.filename || 'download')}" target="_blank" rel="noopener">Download file</a>` +
    `<button type="button" class="ml-detail-link ml-detail-link--danger" id="ml-detail-delete">Delete permanently</button>` +
    `</div>` +
    `</aside>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

function renderPanel() {
  const items = filteredItems();
  const empty = !state.loading && items.length === 0;
  const isFiltered =
    empty && (Boolean(state.search.trim()) || state.filter !== 'all') && state.items.length > 0;
  const uploadLabel = state.uploading ? 'Uploading…' : 'Add New';
  const selected = selectedItem();

  return (
    `<div class="ml-panel-scroll" id="ml-dropzone">` +
    `<div class="ml-header">` +
    `<div class="ml-header-row">` +
    `<div class="ml-header-copy">` +
    `<h1 class="prof-title">Media Library</h1>` +
    `</div>` +
    `<div class="ml-header-actions">` +
    `<button type="button" class="de-btn de-btn-with-icon ml-upload-btn" id="ml-upload-trigger" ${state.uploading ? 'disabled' : ''}>` +
    uploadBtnHtml(uploadLabel) +
    `</button>` +
    `<input type="file" id="ml-upload-input" class="ml-upload-input" accept="${ACCEPT}" multiple hidden />` +
    `</div>` +
    `</div>` +
    `<div class="ml-toolbar">` +
    `<div class="ml-toolbar-filters" id="ml-filter-host"></div>` +
    `<input type="search" id="ml-search" class="ml-search prof-input" placeholder="Search media…" value="${escHtml(state.search)}" ${state.uploading ? 'disabled' : ''} />` +
    `</div>` +
    `</div>` +
    (state.loading
      ? `<div class="ml-grid ml-grid--loading"><p class="prof-hint">Loading…</p></div>`
      : empty
        ? renderEmptyState(isFiltered)
        : `<div class="ml-attachments" role="list">${items.map(renderGridItem).join('')}</div>`) +
    (state.detailOpen && selected ? renderAttachmentDetails(selected) : '') +
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
  let lastItem = null;
  try {
    for (const file of files) {
      try {
        lastItem = await uploadFile(file);
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
    if (uploaded && lastItem) {
      state.selectedId = lastItem.id;
      state.detailOpen = true;
    }
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

function openDetails(id) {
  state.selectedId = id;
  state.detailOpen = true;
  renderAndBind();
}

function closeDetails() {
  state.detailOpen = false;
  renderAndBind();
}

function stepDetails(delta) {
  const items = filteredItems();
  const idx = selectedIndexInFiltered();
  if (idx < 0) return;
  const next = items[idx + delta];
  if (!next) return;
  state.selectedId = next.id;
  state.detailOpen = true;
  renderAndBind();
}

function bindThumbFallbacks(root) {
  root.querySelectorAll('img.ml-attach-thumb').forEach((img) => {
    img.addEventListener('error', () => {
      const fallback = img.getAttribute('data-fallback') || '';
      const current = img.currentSrc || img.src || '';
      const alreadyTried =
        !fallback ||
        current.includes(fallback) ||
        current.endsWith(fallback) ||
        absoluteUrl(fallback) === current;
      if (fallback && !alreadyTried && !img.dataset.mlFallbackTried) {
        img.dataset.mlFallbackTried = '1';
        img.src = fallback;
        return;
      }
      const placeholder = document.createElement('div');
      placeholder.className = 'ml-attach-icon';
      placeholder.innerHTML =
        `<span class="ml-attach-icon-glyph">${iosIcon('image', 28)}</span>` +
        `<span class="ml-attach-ext">IMG</span>`;
      img.replaceWith(placeholder);
    });
  });
}

function bindDetailDims(root) {
  const img = root.querySelector('.ml-detail-image');
  const dims = root.querySelector('#ml-detail-dims');
  if (!(img instanceof HTMLImageElement) || !(dims instanceof HTMLElement)) return;
  const apply = () => {
    if (img.naturalWidth && img.naturalHeight) {
      dims.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
    } else {
      dims.textContent = '—';
    }
  };
  if (img.complete) apply();
  else img.addEventListener('load', apply, { once: true });
  img.addEventListener('error', () => {
    dims.textContent = '—';
  }, { once: true });
}

function bindPanelEvents(root) {
  const filterHost = root.querySelector('#ml-filter-host');
  if (filterHost) {
    filterHost.innerHTML = '';
    const pill = createSlidingPillSelect({
      ariaLabel: 'Filter media type',
      value: state.filter,
      options: [
        { value: 'all', label: 'All' },
        { value: 'images', label: 'Images' },
        { value: 'documents', label: 'Documents' },
      ],
      onChange: (value) => {
        state.filter = value;
        renderAndBind();
      },
    });
    filterHost.appendChild(pill.el);
  }

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

  const dropzone = root.querySelector('#ml-dropzone') || root.querySelector('.ml-dropzone--empty');
  if (dropzone) {
    let dragDepth = 0;
    const activate = (on) => {
      setDropActive(root.querySelector('#ml-dropzone'), on);
      setDropActive(root.querySelector('.ml-dropzone--empty'), on);
    };
    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth += 1;
      activate(true);
    });
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) activate(false);
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
      activate(false);
      if (state.uploading) return;
      const files = e.dataTransfer?.files;
      if (files?.length) await uploadFiles(files);
    });
  }

  root.querySelectorAll('.ml-attach').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-media-id') || '';
      if (id) openDetails(id);
    });
  });

  bindThumbFallbacks(root);

  const backdrop = root.querySelector('#ml-detail-backdrop');
  if (backdrop) {
    root.querySelector('#ml-detail-close')?.addEventListener('click', () => closeDetails());
    root.querySelector('#ml-detail-prev')?.addEventListener('click', () => stepDetails(-1));
    root.querySelector('#ml-detail-next')?.addEventListener('click', () => stepDetails(1));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeDetails();
    });

    root.querySelector('#ml-detail-copy')?.addEventListener('click', async () => {
      const input = root.querySelector('#ml-detail-url');
      const url = input instanceof HTMLInputElement ? input.value : '';
      if (!url) return;
      const btn = root.querySelector('#ml-detail-copy');
      try {
        await navigator.clipboard.writeText(url);
        if (btn) {
          const prev = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = prev;
          }, 1200);
        }
      } catch {
        await osAlert({ title: 'Copy failed', bodyHtml: `<p>${escHtml(url)}</p>` });
      }
    });

    root.querySelector('#ml-detail-delete')?.addEventListener('click', async () => {
      const item = selectedItem();
      if (!item) return;
      const ok = await osConfirm({
        title: 'Delete permanently?',
        bodyHtml: `<p>${escHtml(item.filename || 'This file')} will be removed from the media library. Branding already applied is not affected.</p>`,
        confirmLabel: 'Delete permanently',
        danger: true,
      });
      if (!ok) return;
      try {
        const items = filteredItems();
        const idx = items.findIndex((i) => i.id === item.id);
        const neighbor = items[idx + 1] || items[idx - 1] || null;
        await deleteItem(item.id);
        if (neighbor) {
          state.selectedId = neighbor.id;
          state.detailOpen = true;
        } else {
          state.selectedId = null;
          state.detailOpen = false;
        }
        renderAndBind();
      } catch (e) {
        await osAlert({ title: 'Delete failed', bodyHtml: `<p>${escHtml(e.message || 'Please try again.')}</p>` });
      }
    });

    bindDetailDims(root);

    const onKey = (ev) => {
      if (!state.detailOpen) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeDetails();
      } else if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        stepDetails(-1);
      } else if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        stepDetails(1);
      }
    };
    document.addEventListener('keydown', onKey);
    // Clean prior listener by replacing — store on root for teardown via one-shot flag.
    root._mlKeyHandler?.();
    root._mlKeyHandler = () => document.removeEventListener('keydown', onKey);
  } else if (root._mlKeyHandler) {
    root._mlKeyHandler();
    root._mlKeyHandler = null;
  }
}

function renderAndBind() {
  const root = rootEl();
  if (!root) return;
  if (typeof root._mlKeyHandler === 'function') {
    root._mlKeyHandler();
    root._mlKeyHandler = null;
  }
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
