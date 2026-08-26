/**
 * Simple raster editor for the media library — rotate, crop, scale.
 * JPEG / PNG / WebP only. SVG, GIF, and PDF pass through unchanged.
 */
import { escHtml } from './shared.js?v=20260810a';
import { iosIcon, createIosIconBtn } from './admin-ui.js?v=20260826a';

const EDITABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIN_CROP = 32;
const MIN_SCALE = 10;
const MAX_SCALE = 100;
const HANDLE_KEYS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function isEditableRasterType(mediaType) {
  return EDITABLE_TYPES.has(String(mediaType || '').trim().toLowerCase());
}

export function isEditableRasterFile(file) {
  if (!file) return false;
  const type = String(file.type || '').trim().toLowerCase();
  if (EDITABLE_TYPES.has(type)) return true;
  const name = String(file.name || '').toLowerCase();
  return /\.(jpe?g|png|webp)$/.test(name) && !/\.gif$/.test(name) && !/\.svg$/.test(name);
}

function inferType(file, fallback) {
  const type = String(file?.type || fallback || '').trim().toLowerCase();
  if (EDITABLE_TYPES.has(type)) return type;
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function filenameForType(name, type) {
  const base = String(name || 'image').replace(/\.[a-z0-9]+$/i, '') || 'image';
  if (type === 'image/png') return `${base}.png`;
  if (type === 'image/webp') return `${base}.webp`;
  return `${base}.jpg`;
}

function rotatedSize(w, h, rotation) {
  return rotation % 180 === 0 ? { w, h } : { w: h, h: w };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function fullCrop(w, h) {
  return { x: 0, y: 0, w, h };
}

function isFullCrop(crop, w, h) {
  return crop.x <= 0 && crop.y <= 0 && crop.w >= w && crop.h >= h;
}

function constrainCrop(crop, w, h) {
  const next = { ...crop };
  next.w = clamp(next.w, MIN_CROP, w);
  next.h = clamp(next.h, MIN_CROP, h);
  next.x = clamp(next.x, 0, Math.max(0, w - next.w));
  next.y = clamp(next.y, 0, Math.max(0, h - next.h));
  return next;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/**
 * @param {Blob | string} source
 * @returns {Promise<{ draw: CanvasImageSource, w: number, h: number, close?: () => void }>}
 */
async function loadSource(source) {
  if (typeof source !== 'string' && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(source, { imageOrientation: 'from-image' });
      return {
        draw: bmp,
        w: bmp.width,
        h: bmp.height,
        close: () => {
          try {
            bmp.close();
          } catch {
            /* ignore */
          }
        },
      };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  const img = await loadImageElement(url);
  return {
    draw: img,
    w: img.naturalWidth || img.width,
    h: img.naturalHeight || img.height,
    close: () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
    },
  };
}

function canvasToFile(canvas, type, filename, quality) {
  return new Promise((resolve, reject) => {
    const finish = (blob, usedType) => {
      if (!blob || !blob.size) {
        reject(new Error('Could not encode image'));
        return;
      }
      resolve(new File([blob], filenameForType(filename, usedType), { type: usedType }));
    };
    canvas.toBlob(
      (blob) => {
        if (blob || type !== 'image/webp') {
          finish(blob, type);
          return;
        }
        canvas.toBlob((png) => finish(png, 'image/png'), 'image/png');
      },
      type,
      quality,
    );
  });
}

function exportEdited(source, rotation, crop, scalePct, type, filename) {
  const src = { w: source.w, h: source.h };
  const rot = rotatedSize(src.w, src.h, rotation);
  const outW = Math.max(1, Math.round(crop.w * (scalePct / 100)));
  const outH = Math.max(1, Math.round(crop.h * (scalePct / 100)));

  const rotated = document.createElement('canvas');
  rotated.width = rot.w;
  rotated.height = rot.h;
  const rctx = rotated.getContext('2d');
  if (!rctx) return Promise.reject(new Error('Canvas unavailable'));
  if (type === 'image/jpeg') {
    rctx.fillStyle = '#ffffff';
    rctx.fillRect(0, 0, rot.w, rot.h);
  }
  rctx.translate(rot.w / 2, rot.h / 2);
  rctx.rotate((rotation * Math.PI) / 180);
  rctx.drawImage(source.draw, -src.w / 2, -src.h / 2);

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d');
  if (!octx) return Promise.reject(new Error('Canvas unavailable'));
  if (type === 'image/jpeg') {
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, outW, outH);
  }
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(rotated, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);

  const quality = type === 'image/jpeg' ? 0.92 : type === 'image/webp' ? 0.92 : undefined;
  return canvasToFile(out, type, filename, quality);
}

/**
 * @param {{
 *   file?: File,
 *   src?: string,
 *   filename?: string,
 *   mediaType?: string,
 *   title?: string,
 *   confirmLabel?: string,
 * }} opts
 * @returns {Promise<File | null>} edited file, or null if cancelled
 */
export function openImageEditor(opts) {
  const file = opts.file instanceof File ? opts.file : null;
  const src = file || opts.src;
  if (!src) return Promise.resolve(null);

  const filename = opts.filename || file?.name || 'image';
  const mediaType = inferType(file, opts.mediaType);
  const title = opts.title || 'Edit image';
  const confirmLabel = opts.confirmLabel || 'Use image';

  return new Promise((resolve) => {
    let settled = false;
    let source = null;
    let rotation = 0;
    let scalePct = 100;
    let crop = { x: 0, y: 0, w: 1, h: 1 };
    let drag = null;

    const backdrop = document.createElement('div');
    backdrop.className = 'ml-editor-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'ml-editor-title');
    backdrop.innerHTML =
      `<div class="ml-editor-frame">` +
      `<header class="ml-editor-header">` +
      `<h2 class="ml-editor-title" id="ml-editor-title">${escHtml(title)}</h2>` +
      `<button type="button" class="ml-detail-close" data-ml-editor-cancel aria-label="Cancel">${iosIcon('x', 18)}</button>` +
      `</header>` +
      `<div class="ml-editor-stage" data-ml-editor-stage>` +
      `<div class="ml-editor-board" data-ml-editor-board hidden>` +
      `<canvas class="ml-editor-canvas" data-ml-editor-canvas></canvas>` +
      `<div class="ml-editor-crop" data-ml-editor-crop>` +
      HANDLE_KEYS.map((key) => `<span class="ml-editor-handle" data-handle="${key}"></span>`).join('') +
      `</div>` +
      `</div>` +
      `<p class="ml-editor-loading" data-ml-editor-loading>Loading image…</p>` +
      `</div>` +
      `<div class="ml-editor-tools">` +
      `<div class="ml-editor-rotates" data-ml-editor-rotates></div>` +
      `<label class="ml-editor-scale">` +
      `<span>Scale</span>` +
      `<input type="range" min="${MIN_SCALE}" max="${MAX_SCALE}" value="100" data-ml-editor-scale />` +
      `<span class="ml-editor-scale-val" data-ml-editor-scale-val>100%</span>` +
      `</label>` +
      `<span class="ml-editor-dims" data-ml-editor-dims></span>` +
      `</div>` +
      `<div class="ml-editor-actions">` +
      `<button type="button" class="de-btn de-btn-secondary" data-ml-editor-reset>Reset</button>` +
      `<button type="button" class="de-btn de-btn-primary" data-ml-editor-confirm>${escHtml(confirmLabel)}</button>` +
      `</div>` +
      `</div>`;

    const stage = backdrop.querySelector('[data-ml-editor-stage]');
    const board = backdrop.querySelector('[data-ml-editor-board]');
    const canvas = backdrop.querySelector('[data-ml-editor-canvas]');
    const cropEl = backdrop.querySelector('[data-ml-editor-crop]');
    const loadingEl = backdrop.querySelector('[data-ml-editor-loading]');
    const scaleInput = backdrop.querySelector('[data-ml-editor-scale]');
    const scaleVal = backdrop.querySelector('[data-ml-editor-scale-val]');
    const dimsEl = backdrop.querySelector('[data-ml-editor-dims]');
    const confirmBtn = backdrop.querySelector('[data-ml-editor-confirm]');
    const resetBtn = backdrop.querySelector('[data-ml-editor-reset]');
    const rotates = backdrop.querySelector('[data-ml-editor-rotates]');

    function rotSize() {
      return source ? rotatedSize(source.w, source.h, rotation) : { w: 1, h: 1 };
    }

    function outputSize() {
      return {
        w: Math.max(1, Math.round(crop.w * (scalePct / 100))),
        h: Math.max(1, Math.round(crop.h * (scalePct / 100))),
      };
    }

    function paintPreview() {
      if (!source || !(canvas instanceof HTMLCanvasElement) || !(stage instanceof HTMLElement)) return;
      const rot = rotSize();
      const pad = 16;
      const maxW = Math.max(80, stage.clientWidth - pad);
      const maxH = Math.max(80, stage.clientHeight - pad);
      const fit = Math.min(maxW / rot.w, maxH / rot.h, 1);
      const dw = Math.max(1, Math.round(rot.w * fit));
      const dh = Math.max(1, Math.round(rot.h * fit));
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (mediaType === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dw, dh);
      } else {
        ctx.clearRect(0, 0, dw, dh);
      }
      ctx.translate(dw / 2, dh / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(source.draw, -source.w * fit / 2, -source.h * fit / 2, source.w * fit, source.h * fit);
      if (board instanceof HTMLElement) {
        board.hidden = false;
        board.style.width = `${dw}px`;
        board.style.height = `${dh}px`;
      }
    }

    function layoutCrop() {
      if (!(cropEl instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement) || !source) return;
      const rot = rotSize();
      const dw = canvas.clientWidth || canvas.width;
      const dh = canvas.clientHeight || canvas.height;
      const sx = dw / rot.w;
      const sy = dh / rot.h;
      cropEl.style.left = `${crop.x * sx}px`;
      cropEl.style.top = `${crop.y * sy}px`;
      cropEl.style.width = `${crop.w * sx}px`;
      cropEl.style.height = `${crop.h * sy}px`;
    }

    function updateMeta() {
      const out = outputSize();
      if (scaleVal) scaleVal.textContent = `${Math.round(scalePct)}%`;
      if (dimsEl) dimsEl.textContent = `${out.w} × ${out.h}`;
    }

    function refresh() {
      paintPreview();
      layoutCrop();
      updateMeta();
    }

    function dirty() {
      if (!source) return false;
      const rot = rotSize();
      return rotation !== 0 || scalePct !== 100 || !isFullCrop(crop, rot.w, rot.h);
    }

    function finish(value) {
      if (settled) return;
      settled = true;
      window.removeEventListener('resize', refresh);
      document.removeEventListener('keydown', onKey, true);
      source?.close?.();
      backdrop.remove();
      resolve(value);
    }

    function onKey(ev) {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      finish(null);
    }

    function applyRotate(delta) {
      const prev = rotSize();
      rotation = (rotation + delta + 360) % 360;
      const next = rotSize();
      if (isFullCrop(crop, prev.w, prev.h)) {
        crop = fullCrop(next.w, next.h);
      } else {
        const cx = (crop.x + crop.w / 2) / prev.w;
        const cy = (crop.y + crop.h / 2) / prev.h;
        const nw = clamp(crop.w, MIN_CROP, next.w);
        const nh = clamp(crop.h, MIN_CROP, next.h);
        crop = constrainCrop(
          { x: cx * next.w - nw / 2, y: cy * next.h - nh / 2, w: nw, h: nh },
          next.w,
          next.h,
        );
      }
      refresh();
    }

    function reset() {
      rotation = 0;
      scalePct = 100;
      if (scaleInput instanceof HTMLInputElement) scaleInput.value = '100';
      if (source) crop = fullCrop(source.w, source.h);
      refresh();
    }

    function srcPerPx() {
      const rot = rotSize();
      const dw = canvas instanceof HTMLCanvasElement ? canvas.clientWidth || canvas.width : rot.w;
      const dh = canvas instanceof HTMLCanvasElement ? canvas.clientHeight || canvas.height : rot.h;
      return { x: rot.w / Math.max(1, dw), y: rot.h / Math.max(1, dh) };
    }

    function onPointerDown(ev) {
      if (!(ev.target instanceof HTMLElement) || !source) return;
      const handle = ev.target.getAttribute('data-handle');
      const onCrop = ev.target === cropEl || ev.target.closest?.('[data-ml-editor-crop]');
      if (!handle && !onCrop) return;
      ev.preventDefault();
      ev.stopPropagation();
      cropEl.setPointerCapture?.(ev.pointerId);
      drag = {
        pointerId: ev.pointerId,
        handle: handle || 'move',
        startX: ev.clientX,
        startY: ev.clientY,
        crop: { ...crop },
      };
    }

    function onPointerMove(ev) {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      const rot = rotSize();
      const unit = srcPerPx();
      const dx = (ev.clientX - drag.startX) * unit.x;
      const dy = (ev.clientY - drag.startY) * unit.y;
      const next = { ...drag.crop };
      const h = drag.handle;
      if (h === 'move') {
        next.x += dx;
        next.y += dy;
      } else {
        if (h.includes('w')) {
          next.x += dx;
          next.w -= dx;
        }
        if (h.includes('e')) next.w += dx;
        if (h.includes('n')) {
          next.y += dy;
          next.h -= dy;
        }
        if (h.includes('s')) next.h += dy;
      }
      crop = constrainCrop(next, rot.w, rot.h);
      layoutCrop();
      updateMeta();
    }

    function onPointerUp(ev) {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      drag = null;
    }

    async function confirm() {
      if (!source || !(confirmBtn instanceof HTMLButtonElement)) return;
      confirmBtn.disabled = true;
      try {
        if (!dirty()) {
          finish(file || null);
          return;
        }
        const edited = await exportEdited(source, rotation, crop, scalePct, mediaType, filename);
        finish(edited);
      } catch (e) {
        confirmBtn.disabled = false;
        if (loadingEl instanceof HTMLElement) {
          loadingEl.hidden = false;
          loadingEl.textContent = e?.message || 'Could not save image';
        }
      }
    }

    if (rotates) {
      rotates.append(
        createIosIconBtn({
          iconKey: 'rotate-ccw',
          label: 'Rotate left',
          size: 'sm',
          onClick: () => applyRotate(-90),
        }),
        createIosIconBtn({
          iconKey: 'rotate-cw',
          label: 'Rotate right',
          size: 'sm',
          onClick: () => applyRotate(90),
        }),
      );
    }

    backdrop.querySelector('[data-ml-editor-cancel]')?.addEventListener('click', () => finish(null));
    backdrop.addEventListener('click', (ev) => {
      if (ev.target === backdrop) finish(null);
    });
    resetBtn?.addEventListener('click', () => reset());
    confirmBtn?.addEventListener('click', () => {
      void confirm();
    });
    scaleInput?.addEventListener('input', () => {
      if (!(scaleInput instanceof HTMLInputElement)) return;
      scalePct = clamp(Number(scaleInput.value) || 100, MIN_SCALE, MAX_SCALE);
      updateMeta();
    });
    cropEl?.addEventListener('pointerdown', onPointerDown);
    cropEl?.addEventListener('pointermove', onPointerMove);
    cropEl?.addEventListener('pointerup', onPointerUp);
    cropEl?.addEventListener('pointercancel', onPointerUp);

    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', refresh);

    void (async () => {
      try {
        source = await loadSource(src);
        crop = fullCrop(source.w, source.h);
        if (loadingEl instanceof HTMLElement) loadingEl.hidden = true;
        refresh();
      } catch (e) {
        if (loadingEl instanceof HTMLElement) {
          loadingEl.textContent = e?.message || 'Could not load image';
        }
      }
    })();
  });
}

/**
 * Open the editor for each raster image in a file list. Non-raster files pass through.
 * Cancelling an image skips that file only.
 * @param {File[]} files
 * @returns {Promise<File[]>}
 */
export async function editRasterUploads(files) {
  const list = Array.from(files || []).filter((f) => f && f.size);
  const editableCount = list.filter(isEditableRasterFile).length;
  let seen = 0;
  const out = [];
  for (const file of list) {
    if (!isEditableRasterFile(file)) {
      out.push(file);
      continue;
    }
    seen += 1;
    const edited = await openImageEditor({
      file,
      title: editableCount > 1 ? `Edit image ${seen} of ${editableCount}` : 'Edit image',
      confirmLabel: 'Upload',
    });
    if (edited) out.push(edited);
  }
  return out;
}
