/**
 * Reusable media library picker — choose an image/file for branding, editors, and uploads.
 */
import { escHtml, adminFetch, readAdminJson } from './shared.js?v=20260810a';
import { closeOsDialogBackdrop, openOsDialogBackdrop } from './os-dialog.js?v=20260826a';

const MEDIA_API = '/api/admin/media';
const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const DEFAULT_UPLOAD_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf';

/** POST a file into the media library. */
export async function uploadMediaLibraryFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await adminFetch(MEDIA_API, { method: 'POST', body: fd });
  const json = await readAdminJson(res);
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.item;
}

/** @returns {string|null} Error message, or null when the file is allowed. */
export function validateImageUploadFile(file) {
  const type = String(file?.type || '').trim().toLowerCase();
  const name = String(file?.name || '');
  const okType =
    ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type) ||
    /\.(jpe?g|png|gif|webp)$/i.test(name);
  if (!okType) return 'Use a JPEG, PNG, GIF, or WebP.';
  const size = Number(file?.size) || 0;
  if (size <= 0) return 'File is empty.';
  if (size > MEDIA_MAX_BYTES) return 'Max size is 10 MB.';
  return null;
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.hint]
 * @param {string} [opts.emptyHint] — shown when the library has no items at all
 * @param {string} [opts.emptyFilteredHint] — shown when items exist but none pass filter
 * @param {(item: object) => void|Promise<void>} opts.onPick
 * @param {(item: object) => boolean} [opts.filter] — return false to hide item
 * @param {boolean} [opts.allowUpload] — show upload drop zone in the picker
 * @param {string} [opts.uploadAccept] — input accept attribute when allowUpload
 * @param {string} [opts.uploadHint] — formats line under the upload zone
 * @param {(file: File) => string|null} [opts.validateUpload] — return error string or null
 */
export function openMediaPicker(opts) {
  const title = opts.title || 'Choose from library';
  const allowUpload = opts.allowUpload === true;
  const uploadAccept = opts.uploadAccept || DEFAULT_UPLOAD_ACCEPT;
  const uploadHint =
    opts.uploadHint || 'JPEG, PNG, GIF, WebP, SVG, or PDF — max 10 MB each';
  const validateUpload =
    typeof opts.validateUpload === 'function' ? opts.validateUpload : () => null;
  const hint =
    opts.hint ||
    (allowUpload
      ? 'Upload a new file or pick one from the library below.'
      : 'Pick a file from the media library.');
  const emptyHint =
    opts.emptyHint ||
    (allowUpload
      ? 'Nothing in the library matches yet. Upload a file above, or add files from the Media tab.'
      : 'No matching files in the library yet. Upload one from the Media tab, or close and use the file picker on this form.');
  const filter = typeof opts.filter === 'function' ? opts.filter : () => true;

  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const onBackdropClick = (ev) => {
      if (ev.target === backdrop) finish(null);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') finish(null);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      backdrop.dataset.sheetDismiss = 'false';
      backdrop.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKey);
      closeOsDialogBackdrop();
      resolve(value);
    };

    titleEl.textContent = title;
    actionsEl.innerHTML = '';
    bodyEl.innerHTML =
      (allowUpload
        ? `<div class="ml-picker-upload" id="ml-picker-upload">` +
          `<input type="file" id="ml-picker-upload-input" class="ml-upload-input" accept="${escHtml(uploadAccept)}" multiple hidden />` +
          `<div class="ml-picker-upload-zone" id="ml-picker-upload-zone" tabindex="0" role="button" aria-label="Upload files to the media library">` +
          `<p class="ml-picker-upload-title">Upload</p>` +
          `<p class="ml-picker-upload-sub">Drop files here or click to browse</p>` +
          `<span class="de-btn de-btn-with-icon ml-picker-upload-cta">Select files</span>` +
          `<p class="ml-picker-upload-hint">${escHtml(uploadHint)}</p>` +
          `</div></div>`
        : '') +
      `<p class="prof-hint prof-hint--block" id="ml-picker-hint">${escHtml(hint)}</p>` +
      `<div class="ml-picker-grid" id="ml-picker-grid"><p class="prof-hint">Loading…</p></div>`;

    openOsDialogBackdrop();
    // OS alerts stay non-dismissible; this picker should cancel on backdrop / Escape.
    backdrop.dataset.sheetDismiss = 'true';
    backdrop.addEventListener('click', onBackdropClick);
    backdrop.addEventListener('ios-sheet-close', () => finish(null), { once: true });
    document.addEventListener('keydown', onKey);
    const closeBtn = backdrop.querySelector('[data-os-dialog-close]');
    if (closeBtn instanceof HTMLButtonElement) {
      closeBtn.hidden = false;
      closeBtn.onclick = () => finish(null);
    }

    const grid = bodyEl.querySelector('#ml-picker-grid');
    const hintEl = bodyEl.querySelector('#ml-picker-hint');
    const uploadZone = bodyEl.querySelector('#ml-picker-upload-zone');
    const uploadInput = bodyEl.querySelector('#ml-picker-upload-input');
    let uploadBusy = false;

    const showPickerError = (message) => {
      const msg = String(message || 'Something went wrong').trim();
      const existing = bodyEl.querySelector('.ml-picker-alert');
      if (existing) existing.remove();
      bodyEl.insertAdjacentHTML(
        'afterbegin',
        `<p class="prof-alert prof-alert--error ml-picker-alert" role="alert">${escHtml(msg)}</p>`,
      );
    };

    const setUploadBusy = (busy) => {
      uploadBusy = busy;
      if (!(uploadZone instanceof HTMLElement)) return;
      uploadZone.classList.toggle('ml-picker-upload-zone--busy', busy);
      const title = uploadZone.querySelector('.ml-picker-upload-title');
      const sub = uploadZone.querySelector('.ml-picker-upload-sub');
      const cta = uploadZone.querySelector('.ml-picker-upload-cta');
      if (title) title.textContent = busy ? 'Uploading…' : 'Upload';
      if (sub) {
        sub.textContent = busy
          ? 'Adding to the library…'
          : 'Drop files here or click to browse';
      }
      if (cta) cta.textContent = busy ? 'Uploading…' : 'Select files';
    };

    /** @param {object[]} items */
    const bindGrid = (items, allItems) => {
      if (!(grid instanceof HTMLElement)) return;
      if (!items.length) {
        if (hintEl instanceof HTMLElement && !allowUpload) hintEl.remove();
        grid.classList.add('ml-picker-grid--empty');
        const msg = allItems.length
          ? opts.emptyFilteredHint ||
            (allowUpload
              ? 'None of the library files match. Upload a compatible file above.'
              : 'None of the library files match this picker. Try a different file type or upload a new one from the Media tab.')
          : emptyHint;
        grid.innerHTML = `<p class="ml-picker-empty">${escHtml(msg)}</p>`;
        return;
      }
      grid.classList.remove('ml-picker-grid--empty');
      grid.innerHTML = items
        .map((item) => {
          const isImage = String(item.mediaType || '').startsWith('image/');
          const isPdf = String(item.mediaType || '') === 'application/pdf';
          const preview =
            isImage || isPdf
              ? `<img class="${isPdf ? 'ml-picker-thumb--doc' : ''}" src="${escHtml(item.thumbnailUrl || item.url)}" alt="" loading="lazy" />`
              : `<span class="ml-picker-file">${escHtml(item.filename || 'file')}</span>`;
          return (
            `<button type="button" class="ml-picker-item" data-media-id="${escHtml(item.id)}">` +
            preview +
            `<span class="ml-picker-name">${escHtml(item.filename || 'Untitled')}</span>` +
            `</button>`
          );
        })
        .join('');

      grid.querySelectorAll('.ml-picker-item').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-media-id') || '';
          const item = items.find((i) => i.id === id);
          if (!item) return;
          btn.disabled = true;
          try {
            const applied = await opts.onPick(item);
            if (applied === false) {
              btn.disabled = false;
              return;
            }
            finish(item);
          } catch (e) {
            btn.disabled = false;
            showPickerError(e?.message || 'Could not apply selection');
          }
        });
      });
    };

    const ingestUploadFiles = async (fileList) => {
      if (uploadBusy) return;
      const picked = Array.from(fileList || []).filter((f) => f && f.size);
      if (!picked.length) return;

      setUploadBusy(true);
      const errors = [];
      let attached = 0;
      let lastAttached = null;
      try {
        for (const file of picked) {
          const validationError = validateUpload(file);
          if (validationError) {
            errors.push(`${file.name || 'file'}: ${validationError}`);
            continue;
          }
          try {
            const item = await uploadMediaLibraryFile(file);
            if (!item || !filter(item)) {
              errors.push(`${file.name || 'file'}: Not allowed for this picker.`);
              continue;
            }
            const applied = await opts.onPick(item);
            if (applied === false) continue;
            attached += 1;
            lastAttached = item;
          } catch (e) {
            errors.push(`${file.name || 'file'}: ${e?.message || 'Upload failed'}`);
          }
        }
        if (errors.length) showPickerError(errors.join('\n'));
        if (attached && lastAttached) finish(lastAttached);
        else if (!attached && !errors.length) {
          showPickerError('No files were uploaded.');
        }
      } finally {
        setUploadBusy(false);
      }
    };

    if (uploadZone instanceof HTMLElement && uploadInput instanceof HTMLInputElement) {
      const openFilePicker = () => {
        if (uploadBusy) return;
        uploadInput.click();
      };
      uploadZone.addEventListener('click', (e) => {
        if (e.target.closest('.ml-picker-upload-cta')) return;
        openFilePicker();
      });
      uploadZone.querySelector('.ml-picker-upload-cta')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFilePicker();
      });
      uploadZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openFilePicker();
        }
      });
      uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('ml-picker-upload-zone--drag');
      });
      uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('ml-picker-upload-zone--drag');
      });
      uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('ml-picker-upload-zone--drag');
        void ingestUploadFiles(e.dataTransfer?.files);
      });
      uploadInput.addEventListener('change', () => {
        void ingestUploadFiles(uploadInput.files);
        uploadInput.value = '';
      });
    }

    void (async () => {
      try {
        const res = await adminFetch(`${MEDIA_API}?limit=200&excludeCategory=brand-icon`);
        const json = await readAdminJson(res);
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        const allItems = Array.isArray(json.items) ? json.items : [];
        const items = allItems.filter(filter);
        bindGrid(items, allItems);
      } catch (e) {
        if (grid instanceof HTMLElement) {
          grid.innerHTML = '';
        }
        showPickerError(e.message || 'Could not load library');
      }
    })();
  });
}

const BRANDING_RASTER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const BRANDING_RASTER_MAX_BYTES = 2 * 1024 * 1024;
const BRANDING_SVG_MAX_BYTES = 200 * 1024;

/** Company branding — raster (max 2 MB) or SVG (max 200 KB). */
export function brandingMediaFilter(item) {
  const type = String(item.mediaType || '').trim().toLowerCase();
  const size = Number(item.sizeBytes) || 0;
  if (size <= 0) return false;
  if (type === 'image/svg+xml') return size <= BRANDING_SVG_MAX_BYTES;
  return BRANDING_RASTER_TYPES.includes(type) && size <= BRANDING_RASTER_MAX_BYTES;
}

/** Client / contact branding — raster only (no SVG slot). */
export function brandingRasterMediaFilter(item) {
  const type = String(item.mediaType || '').trim().toLowerCase();
  if (!BRANDING_RASTER_TYPES.includes(type)) return false;
  const size = Number(item.sizeBytes) || 0;
  return size > 0 && size <= BRANDING_RASTER_MAX_BYTES;
}

/** Project notes / markdown — JPEG, PNG, GIF, WebP up to 10 MB. */
export function imageMediaFilter(item) {
  const type = String(item.mediaType || '').trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) return false;
  const size = Number(item.sizeBytes) || 0;
  return size > 0 && size <= MEDIA_MAX_BYTES;
}

/** Project file repository — images + PDF up to 10 MB. */
export function projectFileMediaFilter(item) {
  const type = String(item.mediaType || '').trim().toLowerCase();
  if (
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'].includes(type)
  ) {
    return false;
  }
  const size = Number(item.sizeBytes) || 0;
  return size > 0 && size <= MEDIA_MAX_BYTES;
}

/** Download a library item as a File for re-upload into project files / editors. */
export async function fetchMediaAsFile(item) {
  const url = String(item?.url || '').trim();
  if (!url) throw new Error('Media URL missing');
  const res = await adminFetch(url);
  if (!res.ok) throw new Error(`Could not load media (HTTP ${res.status})`);
  const blob = await res.blob();
  const name = String(item.filename || 'file').trim() || 'file';
  const type = String(item.mediaType || blob.type || 'application/octet-stream').trim();
  return new File([blob], name, { type });
}

export async function applyMediaToTarget(mediaId, target, uid) {
  const body = { target };
  if (uid) body.uid = uid;
  const res = await adminFetch(`${MEDIA_API}/${encodeURIComponent(mediaId)}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await readAdminJson(res);
  if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
