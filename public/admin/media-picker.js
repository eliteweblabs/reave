/**
 * Reusable media library picker — choose an image for branding fields.
 */
import { escHtml, adminFetch, readAdminJson } from './shared.js?v=20260804c';
import { closeOsDialogBackdrop, openOsDialogBackdrop } from './os-dialog.js?v=20260804c';

const MEDIA_API = '/api/admin/media';

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.hint]
 * @param {(item: object) => void|Promise<void>} opts.onPick
 * @param {(item: object) => boolean} [opts.filter] — return false to hide item
 */
export function openMediaPicker(opts) {
  const title = opts.title || 'Choose from library';
  const hint =
    opts.hint || 'Only PNG, JPEG, or WebP images under 2 MB can be used for branding.';
  const filter = typeof opts.filter === 'function' ? opts.filter : () => true;

  const backdrop = document.getElementById('os-dialog-backdrop');
  const titleEl = document.getElementById('os-dialog-title');
  const bodyEl = document.getElementById('os-dialog-body');
  const actionsEl = document.getElementById('os-dialog-actions');
  if (!backdrop || !titleEl || !bodyEl || !actionsEl) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeOsDialogBackdrop();
      resolve(value);
    };

    titleEl.textContent = title;
    actionsEl.innerHTML = '';
    bodyEl.innerHTML =
      `<p class="prof-hint prof-hint--block">${escHtml(hint)}</p>` +
      `<div class="ml-picker-grid" id="ml-picker-grid"><p class="prof-hint">Loading…</p></div>`;

    openOsDialogBackdrop();
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
        const items = (Array.isArray(json.items) ? json.items : []).filter(filter);
        const grid = bodyEl.querySelector('#ml-picker-grid');
        if (!(grid instanceof HTMLElement)) return;
        if (!items.length) {
          grid.innerHTML = '<p class="prof-hint">No suitable images in the library yet. Upload one from the Media tab first.</p>';
          return;
        }
        grid.innerHTML = items
          .map((item) => {
            const preview = String(item.mediaType || '').startsWith('image/')
              ? `<img src="${escHtml(item.thumbnailUrl || item.url)}" alt="" loading="lazy" />`
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

/** Branding-only filter — raster images suitable for logo/icon slots. */
export function brandingMediaFilter(item) {
  const type = String(item.mediaType || '').trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) return false;
  const size = Number(item.sizeBytes) || 0;
  return size > 0 && size <= 2 * 1024 * 1024;
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
