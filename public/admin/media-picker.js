/**
 * Reusable media library picker — choose an image/file for branding, editors, and uploads.
 */
import { escHtml, adminFetch, readAdminJson } from './shared.js?v=20260810a';
import { closeOsDialogBackdrop, openOsDialogBackdrop } from './os-dialog.js?v=20260825a';

const MEDIA_API = '/api/admin/media';
const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.hint]
 * @param {string} [opts.emptyHint] — shown when the library has no items at all
 * @param {string} [opts.emptyFilteredHint] — shown when items exist but none pass filter
 * @param {(item: object) => void|Promise<void>} opts.onPick
 * @param {(item: object) => boolean} [opts.filter] — return false to hide item
 */
export function openMediaPicker(opts) {
  const title = opts.title || 'Choose from library';
  const hint = opts.hint || 'Pick a file from the media library.';
  const emptyHint =
    opts.emptyHint ||
    'No matching files in the library yet. Upload one from the Media tab, or close and use the file picker on this form.';
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

    void (async () => {
      try {
        const res = await adminFetch(`${MEDIA_API}?limit=200`);
        const json = await readAdminJson(res);
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        const allItems = Array.isArray(json.items) ? json.items : [];
        const items = allItems.filter(filter);
        const grid = bodyEl.querySelector('#ml-picker-grid');
        const hintEl = bodyEl.querySelector('#ml-picker-hint');
        if (!(grid instanceof HTMLElement)) return;
        if (!items.length) {
          // Empty copy replaces the hint so we don't stack the same instruction twice.
          if (hintEl instanceof HTMLElement) hintEl.remove();
          grid.classList.add('ml-picker-grid--empty');
          const msg = allItems.length
            ? opts.emptyFilteredHint ||
              'None of the library files match this picker. Try a different file type or upload a new one from the Media tab.'
            : emptyHint;
          grid.innerHTML = `<p class="ml-picker-empty">${escHtml(msg)}</p>`;
          return;
        }
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
              await opts.onPick(item);
              finish(item);
            } catch (e) {
              btn.disabled = false;
              const msg = e?.message || 'Could not apply selection';
              grid.insertAdjacentHTML(
                'beforebegin',
                `<p class="prof-alert prof-alert--error" role="alert">${escHtml(msg)}</p>`,
              );
            }
          });
        });
      } catch (e) {
        bodyEl.innerHTML = `<p class="prof-alert prof-alert--error" role="alert">${escHtml(e.message || 'Could not load library')}</p>`;
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
