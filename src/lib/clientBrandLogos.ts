/**
 * Client / “worked with” brand marks shared by the about-page marquee and
 * audit document one-pagers.
 *
 * Source of truth is public/logos/clients/ — drop a new SVG/PNG there and it
 * shows up everywhere this list is rendered. About-page config entries
 * (media-library slugs) are merged in so existing brands stay visible.
 */
import { listBrandLogos, type BrandLogo } from './brandLogos';
import { getSiteContent, type SiteClientLogo } from './siteContent';

export const CLIENT_BRANDS_FOLDER = 'clients';

export type ClientBrandLogo = BrandLogo & {
  width?: number;
  height?: number;
};

function configuredClientLogos(): SiteClientLogo[] {
  try {
    return getSiteContent().clientLogos ?? [];
  } catch {
    return [];
  }
}

function logoIdentity(name: string, src: string): string {
  const fromName = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const fromSrc = (src.split('/').pop() || '')
    .replace(/\.[^.]+$/, '')
    .replace(/^(?:client-|\d+-)/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return fromName || fromSrc;
}

/**
 * About-page brand list plus any extra files in public/logos/clients/.
 * Config order is preserved; folder-only files append so new drops appear
 * without editing HTML or site config.
 */
export function listClientBrandLogos(): ClientBrandLogo[] {
  const seen = new Set<string>();
  const out: ClientBrandLogo[] = [];

  const add = (logo: ClientBrandLogo) => {
    const id = logoIdentity(logo.name, logo.src);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(logo);
  };

  for (const logo of configuredClientLogos()) {
    add({
      name: logo.name,
      src: logo.image,
      width: logo.width,
      height: logo.height,
    });
  }
  for (const logo of listBrandLogos(CLIENT_BRANDS_FOLDER)) {
    add(logo);
  }
  return out;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Print-safe brand strip. Images come from listClientBrandLogos(), not hardcoded HTML. */
export function renderClientBrandLogosHtml(logos = listClientBrandLogos()): string {
  if (!logos.length) return '';
  const items = logos
    .map((logo) => {
      const w = logo.width && logo.width > 0 ? ` width="${Math.round(logo.width)}"` : '';
      const h = logo.height && logo.height > 0 ? ` height="${Math.round(logo.height)}"` : '';
      return `<li class="doc-client-logos-item"><img src="${esc(logo.src)}" alt="${esc(logo.name)}"${w}${h} /></li>`;
    })
    .join('');
  return `<div class="doc-client-logos" role="group" aria-label="Brands we've worked with"><p class="doc-client-logos-kicker">Worked with</p><ul class="doc-client-logos-list">${items}</ul></div>`;
}

export const DOCUMENT_CLIENT_LOGOS_CSS = `
.doc-client-logos {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.doc-client-logos-kicker {
  margin: 0;
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--doc-muted, #6b6b6b);
}
.doc-client-logos-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45em 0.95em;
  list-style: none;
  margin: 0;
  padding: 0;
}
.doc-client-logos-item {
  display: flex;
  align-items: center;
  margin: 0;
}
.doc-client-logos-item img {
  display: block;
  height: clamp(12px, 2.2cqh, 20px);
  width: auto;
  max-width: 84px;
  object-fit: contain;
  filter: grayscale(1);
  opacity: 0.7;
}
`.trim();
