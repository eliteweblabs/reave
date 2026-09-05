import { BARBERS_EDGE_BARBERS } from './barbersEdge';
import { getSiteContent, type SiteContentConfig } from './siteContent';

/** Enabled site pages that should not be submitted to search engines. */
export const SITEMAP_EXCLUDED_PATHS = new Set([
  '/test',
  '/features-tight',
  '/demo-five',
  '/deploy',
  '/deck',
  '/form/',
  '/pricing',
]);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function locForPath(origin: string, path: string): string {
  if (path === '/') return `${origin}/`;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Public indexable paths for the active install's site content config. */
export function sitemapPaths(site?: SiteContentConfig): string[] {
  const config = site ?? getSiteContent();
  const paths = config.pages.filter((path) => !SITEMAP_EXCLUDED_PATHS.has(path));

  if (config.key === 'barbersedge') {
    for (const barber of BARBERS_EDGE_BARBERS) {
      paths.push(`/barbers/${barber.slug}`);
    }
  }

  return [...new Set(paths)];
}

export function buildSitemapXml(origin: string, site?: SiteContentConfig): string {
  const urls = sitemapPaths(site).map((path) => `  <url><loc>${escapeXml(locForPath(origin, path))}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
