import { cardDemoPreviewProxyUrl } from '../lib/cardDemoPreviewUrl';

type CardDemoSiteRow = {
  name?: string;
  category?: string;
  url?: string;
  emoji?: string;
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTile(site: CardDemoSiteRow): string {
  const name = String(site.name || 'Demo');
  const category = String(site.category || '');
  const href = String(site.url || '#');
  const emoji = String(site.emoji || '🌐');
  const previewSrc = href.startsWith('http') ? cardDemoPreviewProxyUrl(href) : '';

  return (
    `<a class="nfc-demo-tile" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="View demo for ${escapeHtml(name)}">` +
    `<span class="nfc-demo-tile-preview" data-emoji="${escapeHtml(emoji)}">` +
    (previewSrc
      ? `<img src="${escapeHtml(previewSrc)}" alt="" loading="lazy" decoding="async" class="nfc-demo-tile-img" />`
      : '') +
    `<span class="nfc-demo-tile-badge" aria-hidden="true">${emoji}</span>` +
    `</span>` +
    `<span class="nfc-demo-tile-body">` +
    `<span class="nfc-demo-tile-name">${escapeHtml(name)}</span>` +
    (category ? `<span class="nfc-demo-tile-category">${escapeHtml(category)}</span>` : '') +
    `</span>` +
    `</a>`
  );
}

function bindPreviewFallbacks(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>('.nfc-demo-tile-img').forEach((img) => {
    img.addEventListener('error', () => {
      img.remove();
      img.closest('.nfc-demo-tile-preview')?.classList.add('nfc-demo-tile-preview--fallback');
    });
  });
}

export function initCardDemoPortfolio(): void {
  const section = document.getElementById('nfc-demo-section');
  const grid = document.getElementById('nfc-demo-grid');
  const heading = document.getElementById('nfc-demo-heading');
  const subtext = document.getElementById('nfc-demo-subtext');
  if (!section || !grid || !heading || !subtext) return;

  const demoUrl = section.getAttribute('data-demo-url') || '';
  let api = '/api/card/demo-sites';
  if (demoUrl) api += `?demo=${encodeURIComponent(demoUrl)}`;

  fetch(api, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then((res) => res.json())
    .then((data) => {
      const sites = data?.ok && Array.isArray(data.sites) ? (data.sites as CardDemoSiteRow[]) : [];
      if (!sites.length) return;

      const single = Boolean(data.single);
      heading.textContent = single ? 'Your Demo Site' : 'Local Demo Sites';
      subtext.textContent = single
        ? 'Tap to preview your new website.'
        : 'Tap any business to see what your site could look like.';

      grid.innerHTML = sites.map(renderTile).join('');
      bindPreviewFallbacks(grid);
      section.hidden = false;
      section.classList.remove('demo-section--pending');
      if (single) {
        grid.classList.add('nfc-demo-grid--single');
      }
    })
    .catch(() => {
      /* portfolio optional */
    });
}
