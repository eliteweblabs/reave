/**
 * Profile → Email signature — contenteditable editor with logo insert + preview.
 */
import { escHtml, adminFetch, readAdminJson } from './shared.js?v=20260811d';
import { openMediaPicker, imageMediaFilter } from './media-picker.js?v=20260813b';
import { setDeBtnLabel } from './admin-ui.js?v=20260825a';

const SIG_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const SIG_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

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
  const fig = document.createElement('figure');
  fig.className = 'prof-sig-figure';
  fig.contentEditable = 'false';
  img.className = 'prof-sig-img';
  img.style.maxWidth = '160px';
  img.style.height = 'auto';
  img.style.display = 'block';
  fig.appendChild(img);
  return fig;
}

function insertSignatureImage(surface, url, alt = 'Logo') {
  const img = document.createElement('img');
  img.src = url;
  img.alt = alt;
  insertNodeAtCursor(wrapSignatureImage(img), surface);
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

  const tabs = document.createElement('div');
  tabs.className = 'de-mode-tabs prof-sig-mode-tabs';
  const editTab = document.createElement('button');
  editTab.type = 'button';
  editTab.className = 'de-mode-tab active';
  editTab.textContent = 'Edit';
  const previewTab = document.createElement('button');
  previewTab.type = 'button';
  previewTab.className = 'de-mode-tab';
  previewTab.textContent = 'Preview';
  tabs.append(editTab, previewTab);

  const editorWrap = document.createElement('div');
  editorWrap.className = 'prof-sig-editor';

  const toolbar = document.createElement('div');
  toolbar.className = 'prof-sig-toolbar';

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

  toolbar.append(fileInput, uploadBtn, libraryBtn);
  if (companyBtn) toolbar.appendChild(companyBtn);

  const surface = document.createElement('div');
  surface.className = 'prof-sig-surface de-textarea';
  surface.contentEditable = 'true';
  surface.spellcheck = false;
  surface.setAttribute('role', 'textbox');
  surface.setAttribute('aria-multiline', 'true');
  surface.dataset.placeholder = 'Your name\nTitle\nPhone | email';
  surface.innerHTML = normalizeSignatureHtml(opts.initialHtml || hidden.value);

  const preview = document.createElement('div');
  preview.className = 'prof-sig-preview';
  preview.hidden = true;
  preview.innerHTML =
    `<div class="prof-sig-preview-card">` +
      `<div class="prof-sig-preview-body"></div>` +
    `</div>`;

  editorWrap.append(toolbar, surface, preview);
  mount.append(tabs, editorWrap);

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
    previewBody.innerHTML = sanitizeSignatureHtmlClient(html);
  }

  function setMode(next) {
    mode = next;
    const editing = mode === 'edit';
    editTab.classList.toggle('active', editing);
    previewTab.classList.toggle('active', !editing);
    toolbar.hidden = !editing;
    surface.hidden = !editing;
    preview.hidden = editing;
    if (!editing) refreshPreview();
  }

  async function ingestImageFile(file) {
    const resolved = resolveSignatureImageFile(file);
    if (!resolved) return;
    const item = await uploadSignatureImage(resolved);
    insertSignatureImage(surface, absoluteSiteUrl(item.publicUrl || item.url), item.filename || 'Logo');
    syncHidden();
  }

  editTab.addEventListener('click', () => setMode('edit'));
  previewTab.addEventListener('click', () => setMode('preview'));

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

  surface.addEventListener('input', syncHidden);

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
