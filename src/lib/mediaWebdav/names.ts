import type { MediaLibrarySummary } from '../mediaLibrary';

const IGNORED_EXACT = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', '.localized']);

export function decodePathSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Last path segment only — reject traversal. */
export function sanitizeWebdavFilename(name: string): string | null {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const trimmed = base.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') return null;
  if (trimmed.length > 200) return null;
  return trimmed;
}

export function isIgnoredWebdavName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (IGNORED_EXACT.has(n)) return true;
  if (n.startsWith('._') || n.startsWith('.')) return true;
  if (n.endsWith('~')) return true;
  if (n.includes('.sb-')) return true;
  return false;
}

function displayFilename(item: MediaLibrarySummary): string {
  return sanitizeWebdavFilename(item.filename) || `${item.id}`;
}

function disambiguatedName(item: MediaLibrarySummary): string {
  const name = displayFilename(item);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  return `${stem}--${item.id.replace(/-/g, '').slice(0, 8)}${ext}`;
}

/** Stable unique name for listing — filename when unique, else stem--id8.ext. */
export function webdavNameForItem(item: MediaLibrarySummary, items: MediaLibrarySummary[]): string {
  const counts = new Map<string, number>();
  for (const it of items) {
    const n = displayFilename(it);
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  const base = displayFilename(item);
  return (counts.get(base) || 0) > 1 ? disambiguatedName(item) : base;
}

export function findItemByWebdavName(
  name: string,
  items: MediaLibrarySummary[],
): MediaLibrarySummary | null {
  const decoded = sanitizeWebdavFilename(decodePathSegment(name));
  if (!decoded) return null;

  const uniqueHits = items.filter((item) => displayFilename(item) === decoded);
  if (uniqueHits.length === 1) return uniqueHits[0] ?? null;

  const disambiguated = items.find((item) => disambiguatedName(item) === decoded);
  if (disambiguated) return disambiguated;

  return uniqueHits[0] ?? null;
}
