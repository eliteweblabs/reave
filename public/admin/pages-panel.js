/**
 * Admin → Pages — per-path title, description, keywords, OG image overrides.
 */
import { escHtml, adminFetch, mountPanelSkeleton } from './shared.js?v=20260810a';
import { createBrandBtn } from './admin-ui.js?v=20260903a';
import { showChatToast } from './chat-panel.js?v=20260824a';
import {
  openMediaPicker,
  uploadMediaLibraryFile,
  BRANDING_RASTER_PICKER_UPLOAD_ACCEPT,
  validateBrandingRasterMediaUpload,
  brandingRasterMediaFilter,
} from './media-picker.js?v=20260813b';
import { openImageEditor, isEditableRasterFile } from './media-image-editor.js?v=20261026a';

const SHARE_IMAGE_ASPECT_PRESETS = [
  { id: 'landscape', label: 'Landscape 1.91:1', w: 1200, h: 630 },
  { id: 'portrait', label: 'Portrait 4:5', w: 4, h: 5 },
  { id: 'square', label: 'Square 1:1', w: 1, h: 1 },
  { id: 'tall', label: 'Tall 9:16', w: 9, h: 16 },
];

function fieldRow(path, fieldKey, id, value, placeholder, multiline = false, label = fieldKey) {
  const common = `id="${escHtml(id)}" data-page-field="${escHtml(path)}" data-field="${escHtml(fieldKey)}" placeholder="${escHtml(placeholder)}"`;
  if (multiline) {
    return (
      `<div class="prof-field">` +
      `<label for="${escHtml(id)}">${escHtml(label)}</label>` +
      `<textarea ${common} class="prof-input prof-textarea" rows="2">${escHtml(value)}</textarea>` +
      `</div>`
    );
  }
  return (
    `<div class="prof-field">` +
    `<label for="${escHtml(id)}">${escHtml(label)}</label>` +
    `<input ${common} class="prof-input" type="text" value="${escHtml(value)}" />` +
    `</div>`
  );
}

function ogImagePreviewSrc(path) {
  const p = String(path || '').trim();
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('/')) return p;
  return `/${p.replace(/^\/+/, '')}`;
}

function ogImageField(path, slug, value) {
  const src = ogImagePreviewSrc(value);
  const has = Boolean(src);
  return (
    `<div class="prof-field pages-seo-og-field" data-page-path="${escHtml(path)}">` +
    `<label for="page-og-${escHtml(slug)}">Share image</label>` +
    `<div class="prof-logo-upload pages-seo-og-upload">` +
    `<div class="prof-logo-preview-wrap prof-og-preview-wrap${has ? '' : ' is-empty'}" data-pages-og-preview-wrap>` +
    `<img id="page-og-preview-${escHtml(slug)}" class="prof-og-preview" src="${escHtml(src)}" alt="" />` +
    `<button type="button" class="prof-logo-remove" data-pages-og-remove aria-label="Clear share image"${has ? '' : ' hidden'}>×</button>` +
    `</div>` +
    `<div class="prof-logo-actions prof-logo-actions--library-only">` +
    `<button type="button" class="de-btn de-btn-primary prof-branding-library-btn" data-pages-og-library>Media</button>` +
    `<button type="button" class="de-btn de-btn-secondary prof-branding-crop-btn" data-pages-og-crop${has ? '' : ' hidden'}>Crop</button>` +
    `</div>` +
    `</div>` +
    `<input id="page-og-${escHtml(slug)}" data-page-field="${escHtml(path)}" data-field="ogImage" class="prof-input pages-seo-og-path" type="text" value="${escHtml(value)}" placeholder="/api/media/your-slug or /api/branding/og.png" />` +
    `<span class="prof-hint">Upload via Media (saved to the library), or paste a public path. Blank uses the default company share image.</span>` +
    `</div>`
  );
}

function syncPageOgField(fieldRoot) {
  const input = fieldRoot.querySelector('[data-field="ogImage"]');
  const previewWrap = fieldRoot.querySelector('[data-pages-og-preview-wrap]');
  const preview = fieldRoot.querySelector('.prof-og-preview');
  const removeBtn = fieldRoot.querySelector('[data-pages-og-remove]');
  const cropBtn = fieldRoot.querySelector('[data-pages-og-crop]');
  const path = input instanceof HTMLInputElement ? input.value.trim() : '';
  const src = ogImagePreviewSrc(path);
  const has = Boolean(src);
  if (preview instanceof HTMLImageElement) {
    if (has) preview.src = src.includes('?') ? src : `${src}?_=${Date.now()}`;
  }
  if (previewWrap instanceof HTMLElement) {
    previewWrap.classList.toggle('is-empty', !has);
  }
  if (removeBtn instanceof HTMLButtonElement) removeBtn.hidden = !has;
  if (cropBtn instanceof HTMLButtonElement) cropBtn.hidden = !has;
}

async function editPageShareImage(fileOrSrc, filename, mediaType) {
  if (fileOrSrc instanceof File && !isEditableRasterFile(fileOrSrc)) return fileOrSrc;
  return openImageEditor({
    file: fileOrSrc instanceof File ? fileOrSrc : undefined,
    src: fileOrSrc instanceof File ? undefined : fileOrSrc,
    filename: filename || (fileOrSrc instanceof File ? fileOrSrc.name : 'share-image'),
    mediaType,
    title: 'Crop share image',
    confirmLabel: 'Save',
    aspectPresets: SHARE_IMAGE_ASPECT_PRESETS,
    defaultAspectId: 'landscape',
    targetLongEdge: 1200,
  });
}

function bindPageSeoOgUploads(root) {
  for (const field of root.querySelectorAll('.pages-seo-og-field')) {
    if (!(field instanceof HTMLElement)) continue;
    const input = field.querySelector('[data-field="ogImage"]');
    if (!(input instanceof HTMLInputElement)) continue;

    const applyUploadedItem = (item) => {
      const url = String(item?.publicUrl || item?.url || '').trim();
      if (!url) return;
      input.value = url;
      syncPageOgField(field);
    };

    const uploadEditedFile = async (file) => {
      const item = await uploadMediaLibraryFile(file);
      applyUploadedItem(item);
      showChatToast('Share image added — save page SEO to apply.', { type: 'success' });
    };

    input.addEventListener('input', () => syncPageOgField(field));

    field.querySelector('[data-pages-og-remove]')?.addEventListener('click', () => {
      input.value = '';
      syncPageOgField(field);
    });

    field.querySelector('[data-pages-og-crop]')?.addEventListener('click', async () => {
      const src = ogImagePreviewSrc(input.value.trim());
      if (!src) return;
      const edited = await editPageShareImage(src, 'page-share-image', 'image/png');
      if (!edited) return;
      try {
        await uploadEditedFile(edited);
      } catch (e) {
        showChatToast(e.message || 'Upload failed.', { type: 'error' });
      }
    });

    field.querySelector('[data-pages-og-library]')?.addEventListener('click', () => {
      void openMediaPicker({
        title: 'Page share image',
        hint: 'Upload or pick an image, then crop. The public URL is stored on this page.',
        allowUpload: true,
        uploadAccept: BRANDING_RASTER_PICKER_UPLOAD_ACCEPT,
        uploadHint: 'PNG, JPEG, WebP, or AVIF — max 2 MB',
        validateUpload: validateBrandingRasterMediaUpload,
        emptyHint: 'Nothing here yet — upload above or add files from the Media tab.',
        emptyFilteredHint: 'No matching images in the library (PNG, JPEG, WebP, or AVIF under 2 MB).',
        filter: brandingRasterMediaFilter,
        onPick: async (item) => {
          const pickSrc = item.thumbnailUrl || item.url;
          const edited = await editPageShareImage(pickSrc, item.filename, item.mediaType);
          if (!edited) return false;
          try {
            await uploadEditedFile(edited);
          } catch (e) {
            showChatToast(e.message || 'Upload failed.', { type: 'error' });
            return false;
          }
          return true;
        },
      });
    });

    syncPageOgField(field);
  }
}

function renderPageEditor(path, suggestedTitle, override) {
  const o = override || {};
  const slug = path.replace(/[^\w-]+/g, '_') || 'root';
  return (
    `<details class="pages-seo-row prof-card prof-card--nested" data-page-path="${escHtml(path)}">` +
    `<summary><code>${escHtml(path)}</code> — ${escHtml(o.title || suggestedTitle)}</summary>` +
    `<div class="pages-seo-fields">` +
    fieldRow(path, 'title', `page-title-${slug}`, o.title || '', suggestedTitle, false, 'Title') +
    fieldRow(path, 'description', `page-desc-${slug}`, o.description || '', 'Meta description for search and share cards', true, 'Description') +
    fieldRow(path, 'keywords', `page-kw-${slug}`, (o.keywords || []).join('\n'), 'One term per line', true, 'Keywords') +
    ogImageField(path, slug, o.ogImage || '') +
    `</div></details>`
  );
}

function collectOverrides(root) {
  /** @type {Record<string, Record<string, unknown>>} */
  const overrides = {};
  for (const details of root.querySelectorAll('.pages-seo-row[data-page-path]')) {
    const path = details.getAttribute('data-page-path');
    if (!path) continue;
    const read = (label) => {
      const el = details.querySelector(`[data-field="${label}"]`);
      return el?.value?.trim?.() ?? '';
    };
    const entry = {};
    const title = read('title');
    const description = read('description');
    const ogImage = read('ogImage');
    const keywordsRaw = read('keywords');
    const keywords = keywordsRaw
      ? keywordsRaw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      : [];
    if (title) entry.title = title;
    if (description) entry.description = description;
    if (ogImage) entry.ogImage = ogImage;
    if (keywords.length) entry.keywords = keywords;
    if (Object.keys(entry).length) overrides[path] = entry;
  }
  return overrides;
}

export async function loadPagesTab(deps) {
  const { settingsPanelRoot, prependSettingsBackHeader } = deps;
  const root = settingsPanelRoot();
  if (!root) return;
  mountPanelSkeleton(root, 'dashboard', 'Loading pages…', {
    contentSelector: '.prof-card',
    wrapper: (sk) => `<div class="profile-panel-scroll">${sk}</div>`,
  });
  prependSettingsBackHeader(root);

  try {
    const res = await adminFetch('/api/admin/page-seo', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const filterId = 'pages-seo-filter';
    const rows = (data.pages || [])
      .map((p) => renderPageEditor(p.path, p.suggestedTitle, p.override))
      .join('');

    root.innerHTML =
      `<div class="profile-panel-scroll">` +
      `<div class="prof-card">` +
      `<h1 class="prof-title">Pages</h1>` +
      `<p class="prof-subtitle">Per-URL title, description, keywords, and share image. Blank fields use each page’s built-in defaults. Paths are discovered from <code>src/pages</code> and your site sitemap list.</p>` +
      `<div id="pages-seo-alert" class="prof-alert" hidden></div>` +
      `<div class="prof-field pages-seo-filter">` +
      `<label for="${filterId}">Filter paths</label>` +
      `<input id="${filterId}" class="prof-input" type="search" placeholder="/card, /about, …" autocomplete="off" />` +
      `</div>` +
      `<div id="pages-seo-list" class="pages-seo-list">${rows}</div>` +
      `<div class="prof-actions pages-seo-actions" id="pages-seo-save-wrap"></div>` +
      `</div></div>`;

    prependSettingsBackHeader(root);
    bindPageSeoOgUploads(root);

    const saveWrap = root.querySelector('#pages-seo-save-wrap');
    const saveBtn = createBrandBtn({
      variant: 'filled',
      label: 'Save page SEO',
      onClick: async () => {
        saveBtn.disabled = true;
        try {
          const overrides = collectOverrides(root);
          const put = await adminFetch('/api/admin/page-seo', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ overrides }),
          });
          const body = await put.json();
          if (!put.ok || !body.ok) throw new Error(body.error || `HTTP ${put.status}`);
          showChatToast('Saved.', { type: 'success' });
        } catch (e) {
          showChatToast(e.message || 'Save failed.', { type: 'error' });
        } finally {
          saveBtn.disabled = false;
        }
      },
    });
    saveWrap?.appendChild(saveBtn);

    const filter = root.querySelector(`#${filterId}`);
    filter?.addEventListener('input', () => {
      const q = String(filter.value || '').trim().toLowerCase();
      for (const row of root.querySelectorAll('.pages-seo-row')) {
        const path = row.getAttribute('data-page-path') || '';
        row.hidden = Boolean(q) && !path.toLowerCase().includes(q);
      }
    });
  } catch (e) {
    root.innerHTML =
      `<div class="profile-panel-scroll">` +
      `<div class="prof-card"><h1 class="prof-title">Pages</h1>` +
      `<p class="dash-empty">Could not load pages: ${escHtml(e.message)}</p></div></div>`;
    prependSettingsBackHeader(root);
  }
}
