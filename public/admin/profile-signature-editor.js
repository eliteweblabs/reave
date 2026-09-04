/**
 * Profile → Email signature — contenteditable editor with logo insert + preview.
 */
import { escHtml, adminFetch, readAdminJson } from './shared.js?v=20260811d';
import { openMediaPicker, imageMediaFilter } from './media-picker.js?v=20260813b';
import { setDeBtnLabel, createSlidingPillSelect, iosIcon } from './admin-ui.js?v=20260826a';

const SIG_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const SIG_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const SIG_IMG_MAX_WIDTH = 160;
const SIG_IMG_MAX_HEIGHT = 64;

function absoluteSiteUrl(path) {
  const v = (path || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v) || /^data:/i.test(v)) return v;
  return `${window.location.origin}${v.startsWith('/') ? v : `/${v}`}`;
}

function sanitizeSignatureHtmlClient(html) {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:iframe|object|embed|form|meta|link|base|svg|math)[\s>]/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*["']\s*(javascript|vbscript|data):[^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .trim();
}

function normalizeSignatureHtml(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/<[a-z][\s\S]*>/i.test(v)) return v;
  return v
    .split('\n')
    .map((line) => escHtml(line))
    .join('<br />');
}

function parsePx(value) {
  if (!value) return null;
  const n = parseInt(String(value).replace(/px$/i, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clampSignatureImageSize(width, height) {
  if (!width || !height) {
    return { width: SIG_IMG_MAX_WIDTH, height: Math.round(SIG_IMG_MAX_HEIGHT * 0.5) };
  }
  const scale = Math.min(SIG_IMG_MAX_WIDTH / width, SIG_IMG_MAX_HEIGHT / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function signatureImageEmailStyle(width) {
  return `display:block;margin:0 0 6px 0;width:${width}px;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none`;
}

/** Set width/height attrs so email clients match the editor preview size. */
function applySignatureImageEmailAttrs(img) {
  const attrW = parsePx(img.getAttribute('width'));
  const attrH = parsePx(img.getAttribute('height'));
  let width = attrW;
  let height = attrH;

  if (!width || !height) {
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    if (nw && nh) {
      ({ width, height } = clampSignatureImageSize(nw, nh));
    } else {
      const style = img.getAttribute('style') || '';
      const maxW = style.match(/(?:^|;\s*)max-width:\s*(\d+)px/i);
      width = parsePx(maxW?.[1]) || SIG_IMG_MAX_WIDTH;
      height = height || Math.round(width * 0.4);
      ({ width, height } = clampSignatureImageSize(width, height));
    }
  } else {
    ({ width, height } = clampSignatureImageSize(width, height));
  }

  img.setAttribute('width', String(width));
  img.setAttribute('height', String(height));
  img.style.cssText = signatureImageEmailStyle(width);
}

function finalizeSignatureImage(img) {
  const apply = () => {
    const { width, height } = clampSignatureImageSize(
      img.naturalWidth || parsePx(img.getAttribute('width')) || SIG_IMG_MAX_WIDTH,
      img.naturalHeight || parsePx(img.getAttribute('height')) || SIG_IMG_MAX_HEIGHT,
    );
    img.setAttribute('width', String(width));
    img.setAttribute('height', String(height));
    img.style.maxWidth = `${width}px`;
    img.style.width = `${width}px`;
    img.style.height = 'auto';
    img.style.display = 'block';
    img.className = 'prof-sig-img';
    img.draggable = false;
  };
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener('load', apply, { once: true });
}

function isEmptySignatureBlock(el) {
  if (el.querySelector('img')) return false;
  const text = (el.textContent || '').replace(/\u00a0/g, ' ').trim();
  if (text) return false;
  const inner = (el.innerHTML || '').replace(/\s/g, '').toLowerCase();
  return !inner || /^(<br\s*\/?>)+$/i.test(inner);
}

/** Undo email-normalized markup so contenteditable stays editable. */
function prepareSignatureHtmlForEditor(html) {
  const root = document.createElement('div');
  root.innerHTML = sanitizeSignatureHtmlClient(normalizeSignatureHtml(html));

  root.querySelectorAll('figure, .prof-sig-figure').forEach((node) => {
    const wrap = document.createElement('div');
    wrap.className = 'prof-sig-figure';
    wrap.removeAttribute('contenteditable');
    wrap.innerHTML = node.innerHTML;
    node.replaceWith(wrap);
  });

  root.querySelectorAll('div, p').forEach((el) => {
    const img = el.querySelector(':scope > img');
    const onlyImg =
      img &&
      el.children.length === 1 &&
      !(el.textContent || '').replace(/\u00a0/g, '').trim();
    if (onlyImg) {
      const wrap = document.createElement('div');
      wrap.className = 'prof-sig-figure';
      wrap.appendChild(img);
      el.replaceWith(wrap);
    } else if (!el.classList.contains('prof-sig-figure')) {
      el.removeAttribute('style');
      el.removeAttribute('contenteditable');
      el.removeAttribute('class');
    }
  });

  root.querySelectorAll('img').forEach((img) => {
    if (!img.closest('.prof-sig-figure')) {
      const wrap = document.createElement('div');
      wrap.className = 'prof-sig-figure';
      img.parentNode?.insertBefore(wrap, img);
      wrap.appendChild(img);
    }
    finalizeSignatureImage(img);
  });

  return root.innerHTML.trim();
}

/** Mirror server normalizeSignatureHtmlForEmail — tight spacing for email clients. */
function normalizeSignatureHtmlForEmail(html) {
  const root = document.createElement('div');
  root.innerHTML = sanitizeSignatureHtmlClient(html);

  root.querySelectorAll('figure, .prof-sig-figure').forEach((fig) => {
    const wrap = document.createElement('div');
    wrap.style.margin = '0';
    wrap.style.padding = '0';
    wrap.style.lineHeight = '0';
    wrap.innerHTML = fig.innerHTML;
    fig.replaceWith(wrap);
  });

  root.querySelectorAll('img').forEach((img) => {
    applySignatureImageEmailAttrs(img);
  });

  [...root.querySelectorAll('div, p')].forEach((el) => {
    if (isEmptySignatureBlock(el)) {
      el.remove();
      return;
    }
    el.removeAttribute('class');
    el.removeAttribute('contenteditable');
    const hasImg = el.querySelector('img');
    if (hasImg) {
      el.style.margin = '0';
      el.style.padding = '0';
      el.style.lineHeight = '0';
    } else {
      el.style.margin = '0';
      el.style.padding = '0';
      el.style.lineHeight = '1.45';
    }
  });

  let changed = true;
  while (changed) {
    changed = false;
    root.querySelectorAll('br').forEach((br) => {
      if (br.previousElementSibling?.tagName === 'BR') {
        br.remove();
        changed = true;
      }
    });
  }

  return root.innerHTML.trim();
}

function plainTextFromSignatureHtml(html) {
  const root = document.createElement('div');
  root.innerHTML = html;
  root.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  root.querySelectorAll('img').forEach((img) => {
    const alt = img.getAttribute('alt')?.trim();
    img.replaceWith(alt ? `[${alt}]` : '[Logo]');
  });
  return (root.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function insertNodeAtCursor(node, surface) {
  surface.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    surface.appendChild(node);
    return;
  }
  const range = sel.getRangeAt(0);
  if (!surface.contains(range.commonAncestorContainer)) {
    surface.appendChild(node);
    return;
  }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function wrapSignatureImage(img) {
  const wrap = document.createElement('div');
  wrap.className = 'prof-sig-figure';
  wrap.appendChild(img);
  finalizeSignatureImage(img);
  return wrap;
}

function ensureEditableLineAfter(node) {
  if (node.nextElementSibling) return;
  const line = document.createElement('div');
  line.appendChild(document.createElement('br'));
  node.after(line);
}

function insertSignatureImage(surface, url, alt = 'Logo') {
  const img = document.createElement('img');
  img.src = url;
  img.alt = alt;
  const wrap = wrapSignatureImage(img);
  insertNodeAtCursor(wrap, surface);
  ensureEditableLineAfter(wrap);
}

function resolveSignatureImageFile(file) {
  if (!file || !file.size) return null;
  const type = (file.type || '').trim().toLowerCase();
  if (!SIG_IMAGE_TYPES.includes(type)) return null;
  if (file.size > SIG_IMAGE_MAX_BYTES) return null;
  return file;
}

async function uploadSignatureImage(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await adminFetch('/api/admin/media', { method: 'POST', body: form });
  const json = await readAdminJson(res);
  if (!res.ok || !json.ok) throw new Error(json.error || 'Upload failed');
  return json.item;
}

/**
 * @param {HTMLElement} root — #settings-panel or .profile-panel-scroll scope containing #profile-form
 * @param {{ initialHtml?: string, companyLogoUrl?: string, onChange?: () => void }} opts
 */
export function bindProfileSignatureEditor(root, opts = {}) {
  const mount = root.querySelector('#profile-signature-editor');
  const hidden = root.querySelector('#profile-emailSignature');
  if (!(mount instanceof HTMLElement) || !(hidden instanceof HTMLTextAreaElement)) return;

  let mode = 'edit';
  mount.innerHTML = '';

  const modePill = createSlidingPillSelect({
    value: 'edit',
    options: [
      { value: 'edit', label: 'Edit' },
      { value: 'preview', label: 'Preview' },
    ],
    ariaLabel: 'Signature editor mode',
    scrollable: false,
    onChange: (value) => setMode(value),
  });
  modePill.el.classList.add('prof-sig-mode-tabs');

  const editorWrap = document.createElement('div');
  editorWrap.className = 'prof-sig-editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'prof-sig-toolbar';

  const formatGroup = document.createElement('div');
  formatGroup.className = 'prof-sig-fmt';

  function createFormatBtn(command, iconKey, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'de-btn de-btn-secondary de-btn-with-icon prof-sig-fmt-btn';
    btn.dataset.format = command;
    btn.setAttribute('aria-label', label);
    btn.title = `${label} (${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl+'}${command === 'bold' ? 'B' : 'I'})`;
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `<span class="de-btn-icon" aria-hidden="true">${iosIcon(iconKey, 16)}</span>`;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => applyFormat(command));
    return btn;
  }

  const boldBtn = createFormatBtn('bold', 'bold', 'Bold');
  const italicBtn = createFormatBtn('italic', 'italic', 'Italic');
  formatGroup.append(boldBtn, italicBtn);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = SIG_IMAGE_TYPES.join(',');
  fileInput.multiple = true;
  fileInput.hidden = true;

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'de-btn de-btn-secondary de-btn-with-icon';
  setDeBtnLabel(uploadBtn, 'Upload logo', 'share');

  const libraryBtn = document.createElement('button');
  libraryBtn.type = 'button';
  libraryBtn.className = 'de-btn de-btn-secondary';
  libraryBtn.textContent = 'Library';

  const companyLogoUrl = absoluteSiteUrl(opts.companyLogoUrl || '');
  let companyBtn = null;
  if (companyLogoUrl) {
    companyBtn = document.createElement('button');
    companyBtn.type = 'button';
    companyBtn.className = 'de-btn de-btn-secondary';
    companyBtn.textContent = 'Company logo';
  }

  toolbar.append(formatGroup, fileInput, uploadBtn, libraryBtn);
  if (companyBtn) toolbar.appendChild(companyBtn);

  const surface = document.createElement('div');
  surface.className = 'prof-sig-surface de-textarea';
  surface.contentEditable = 'true';
  surface.spellcheck = false;
  surface.setAttribute('role', 'textbox');
  surface.setAttribute('aria-multiline', 'true');
  surface.dataset.placeholder = 'Your name\nTitle\nPhone | email';
  surface.innerHTML = prepareSignatureHtmlForEditor(opts.initialHtml || hidden.value);

  const preview = document.createElement('div');
  preview.className = 'prof-sig-preview';
  preview.hidden = true;
  preview.innerHTML =
    `<div class="prof-sig-preview-card">` +
      `<div class="prof-sig-preview-body"></div>` +
    `</div>`;

  editorWrap.append(toolbar, surface, preview);
  mount.append(modePill.el, editorWrap);

  const previewBody = preview.querySelector('.prof-sig-preview-body');

  function syncHidden() {
    hidden.value = surface.innerHTML.trim();
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
    opts.onChange?.();
  }

  function refreshPreview() {
    if (!(previewBody instanceof HTMLElement)) return;
    const html = surface.innerHTML.trim();
    if (!html) {
      previewBody.innerHTML = '<p class="prof-hint">Nothing to preview yet.</p>';
      return;
    }
    previewBody.innerHTML = normalizeSignatureHtmlForEmail(html);
  }

  function applyFormat(command) {
    if (mode !== 'edit') return;
    surface.focus();
    try {
      document.execCommand('styleWithCSS', false, false);
    } catch {
      /* older engines */
    }
    document.execCommand(command, false, null);
    syncHidden();
    syncFormatState();
  }

  function syncFormatState() {
    const inSurface = (() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return document.activeElement === surface;
      return surface.contains(sel.anchorNode);
    })();
    for (const btn of [boldBtn, italicBtn]) {
      const on = inSurface && document.queryCommandState(btn.dataset.format);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function setMode(next) {
    mode = next;
    if (modePill.getValue() !== next) modePill.setValue(next);
    const editing = mode === 'edit';
    toolbar.hidden = !editing;
    surface.hidden = !editing;
    preview.hidden = editing;
    if (!editing) refreshPreview();
    else {
      syncFormatState();
      surface.focus();
    }
  }

  async function ingestImageFile(file) {
    const resolved = resolveSignatureImageFile(file);
    if (!resolved) return;
    const item = await uploadSignatureImage(resolved);
    insertSignatureImage(surface, absoluteSiteUrl(item.publicUrl || item.url), item.filename || 'Logo');
    syncHidden();
  }

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    void (async () => {
      for (const file of files) {
        try {
          await ingestImageFile(file);
        } catch (e) {
          window.alert(e.message || 'Logo upload failed');
        }
      }
    })();
  });

  libraryBtn.addEventListener('click', () => {
    void openMediaPicker({
      title: 'Insert logo',
      hint: 'Choose an image from the media library. JPEG, PNG, GIF, or WebP — max 2 MB.',
      filter: imageMediaFilter,
      onPick: async (item) => {
        insertSignatureImage(
          surface,
          absoluteSiteUrl(item.publicUrl || item.url),
          item.filename || 'Logo',
        );
        syncHidden();
      },
    });
  });

  companyBtn?.addEventListener('click', () => {
    insertSignatureImage(surface, companyLogoUrl, 'Company logo');
    syncHidden();
  });

  surface.addEventListener('mousedown', (e) => {
    if (e.target === surface) {
      e.preventDefault();
      surface.focus();
    }
  });

  surface.addEventListener('input', () => {
    syncHidden();
    syncFormatState();
  });
  surface.addEventListener('keyup', syncFormatState);
  surface.addEventListener('mouseup', syncFormatState);
  document.addEventListener('selectionchange', () => {
    if (mode !== 'edit') return;
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !surface.contains(sel.anchorNode)) return;
    syncFormatState();
  });

  surface.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])]
      .map((f) => resolveSignatureImageFile(f))
      .filter(Boolean);
    if (files.length) {
      e.preventDefault();
      void (async () => {
        for (const file of files) {
          try {
            await ingestImageFile(file);
          } catch (err) {
            window.alert(err.message || 'Logo upload failed');
          }
        }
      })();
    }
  });

  surface.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.types || [])].includes('Files')) {
      e.preventDefault();
      surface.classList.add('prof-sig-dragover');
    }
  });
  surface.addEventListener('dragleave', () => surface.classList.remove('prof-sig-dragover'));
  surface.addEventListener('drop', (e) => {
    surface.classList.remove('prof-sig-dragover');
    const files = [...(e.dataTransfer?.files || [])]
      .map((f) => resolveSignatureImageFile(f))
      .filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    void (async () => {
      for (const file of files) {
        try {
          await ingestImageFile(file);
        } catch (err) {
          window.alert(err.message || 'Logo upload failed');
        }
      }
    })();
  });

  syncHidden();
  refreshPreview();

  return {
    getHtml: () => hidden.value.trim(),
    getPlainText: () => plainTextFromSignatureHtml(hidden.value),
    flush: syncHidden,
  };
}
