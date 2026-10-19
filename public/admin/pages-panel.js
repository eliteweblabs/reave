/**
 * Admin → Pages — per-path title, description, keywords, OG image overrides.
 */
import { escHtml, adminFetch, mountPanelSkeleton } from './shared.js?v=20260810a';
import { createBrandBtn } from './admin-ui.js?v=20260903a';

function fieldRow(path, label, id, value, placeholder, multiline = false) {
  const common = `id="${escHtml(id)}" data-page-field="${escHtml(path)}" data-field="${escHtml(label)}" placeholder="${escHtml(placeholder)}"`;
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

function renderPageEditor(path, suggestedTitle, override) {
  const o = override || {};
  const slug = path.replace(/[^\w-]+/g, '_') || 'root';
  return (
    `<details class="pages-seo-row prof-card prof-card--nested" data-page-path="${escHtml(path)}">` +
    `<summary><code>${escHtml(path)}</code> — ${escHtml(o.title || suggestedTitle)}</summary>` +
    `<div class="pages-seo-fields">` +
    fieldRow(path, 'title', `page-title-${slug}`, o.title || '', suggestedTitle) +
    fieldRow(path, 'description', `page-desc-${slug}`, o.description || '', 'Meta description for search and share cards', true) +
    fieldRow(path, 'keywords', `page-kw-${slug}`, (o.keywords || []).join('\n'), 'One term per line', true) +
    fieldRow(path, 'ogImage', `page-og-${slug}`, o.ogImage || '', '/api/branding/og.png or /sites/your-slug/og.png') +
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
      `<div class="prof-field">` +
      `<label for="${filterId}">Filter paths</label>` +
      `<input id="${filterId}" class="prof-input" type="search" placeholder="/card, /about, …" autocomplete="off" />` +
      `</div>` +
      `<div id="pages-seo-list" class="pages-seo-list">${rows}</div>` +
      `<div class="prof-actions" id="pages-seo-save-wrap"></div>` +
      `</div></div>`;

    prependSettingsBackHeader(root);

    const saveWrap = root.querySelector('#pages-seo-save-wrap');
    const alertEl = root.querySelector('#pages-seo-alert');
    const saveBtn = createBrandBtn({
      variant: 'filled',
      label: 'Save page SEO',
      onClick: async () => {
        alertEl.hidden = true;
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
          alertEl.textContent = 'Saved.';
          alertEl.hidden = false;
          alertEl.classList.remove('prof-alert--error');
        } catch (e) {
          alertEl.textContent = e.message || 'Save failed.';
          alertEl.hidden = false;
          alertEl.classList.add('prof-alert--error');
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
