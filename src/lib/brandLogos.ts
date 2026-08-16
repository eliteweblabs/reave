/**
 * Discovers brand/app-logo SVGs from public/logos/<folder>/ so pages can
 * render a "logo wall" without hardcoding a list — drop a new SVG (with a
 * <title>) in the folder and it just shows up.
 *
 * Shared by any page/component that needs a folder-backed logo wall: the
 * "apps this platform replaces" marquees on /features and the homepage, the
 * about-page / audit-sheet client brands in public/logos/clients/, and
 * anywhere else a similar wall gets added later.
 *
 * File naming: prefix a filename with a two-digit number (e.g. "01-gmail.svg")
 * to pin its position; unprefixed files sort alphabetically after the
 * numbered ones. Display name comes from the SVG's <title>, falling back to
 * a humanized filename when a file has none.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export interface BrandLogo {
  /** Display name — from the SVG's <title>, or humanized from the filename. */
  name: string;
  /** Public URL to the file, e.g. /logos/replaced-apps/01-gmail.svg */
  src: string;
}

const ORDER_PREFIX_RE = /^(\d+)-/;
const TITLE_RE = /<title>([^<]*)<\/title>/i;

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function humanize(filename: string): string {
  return filename
    .replace(ORDER_PREFIX_RE, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortKey(filename: string): [number, string] {
  const match = filename.match(ORDER_PREFIX_RE);
  return match ? [Number(match[1]), filename] : [Number.MAX_SAFE_INTEGER, filename];
}

/** Lists every image file in public/logos/<folder>, sorted for display. */
export function listBrandLogos(folder: string): BrandLogo[] {
  const dir = join(projectRoot(), 'public', 'logos', folder);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => /\.(svg|png|jpe?g|webp)$/i.test(f))
    .sort((a, b) => {
      const [orderA, nameA] = sortKey(a);
      const [orderB, nameB] = sortKey(b);
      return orderA - orderB || nameA.localeCompare(nameB);
    })
    .map((file) => {
      let name = humanize(file);
      if (/\.svg$/i.test(file)) {
        const content = readFileSync(join(dir, file), 'utf8');
        const titleMatch = content.match(TITLE_RE);
        if (titleMatch?.[1]?.trim()) name = titleMatch[1].trim();
      }
      return { name, src: `/logos/${folder}/${file}` };
    });
}
