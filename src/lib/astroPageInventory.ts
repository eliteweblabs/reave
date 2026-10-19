/**
 * Discover public URL paths from the Astro pages tree + active site content sitemap list.
 */
import { existsSync, readdirSync, statSync } from 'fs';
import { basename, extname, join } from 'path';
import { sitemapPaths } from './sitemap';
import { normalizePagePath } from './pageSeo';

const PAGES_ROOT = join(process.cwd(), 'src/pages');

/** Route segments that are never public marketing URLs. */
const SKIP_DIRS = new Set([
  'api',
  'admin',
  'c',
  'carddav',
  'hub',
  'email',
  'doc',
  'invoices',
  'meet',
  'stack',
  'focus',
  'oauth',
  'sign',
  '.well-known',
]);

const ROUTE_EXTS = new Set(['.astro', '.ts', '.md', '.mdx']);

const UTILITY_PATHS = ['/card', '/nfc'];

function isDynamicSegment(name: string): boolean {
  return name.includes('[') || name.includes(']');
}

function walkPagesDir(dir: string, urlPrefix: string, out: Set<string>): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const name = ent.name;
    if (name.startsWith('_')) continue;
    const full = join(dir, name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(name) || isDynamicSegment(name)) continue;
      walkPagesDir(full, `${urlPrefix}/${name}`, out);
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = extname(name);
    if (!ROUTE_EXTS.has(ext)) continue;
    const base = basename(name, ext);
    if (isDynamicSegment(base)) continue;
    if (base === 'index') {
      out.add(normalizePagePath(urlPrefix || '/'));
    } else {
      out.add(normalizePagePath(`${urlPrefix}/${base}`));
    }
  }
}

/** Union of sitemap paths, NFC utility routes, and static routes under src/pages. */
export function discoverPublicPagePaths(): string[] {
  const paths = new Set<string>();
  for (const p of sitemapPaths()) paths.add(normalizePagePath(p));
  for (const p of UTILITY_PATHS) paths.add(normalizePagePath(p));
  if (existsSync(PAGES_ROOT) && statSync(PAGES_ROOT).isDirectory()) {
    walkPagesDir(PAGES_ROOT, '', paths);
  }
  return [...paths].sort((a, b) => {
    if (a === '/') return -1;
    if (b === '/') return 1;
    return a.localeCompare(b);
  });
}
