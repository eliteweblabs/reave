/**
 * Per-path SEO overrides (title, description, keywords, og:image) — Admin → Pages.
 */
import { mergeSearchKeywordLists, parseSearchKeywordLines } from './searchKeywords';

export type PageSeoEntry = {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
};

export type PageSeoOverrides = Record<string, PageSeoEntry>;

export function normalizePagePath(pathname: string): string {
  const raw = (pathname || '/').split('#')[0]?.split('?')[0] ?? '/';
  const collapsed = raw.replace(/\/{2,}/g, '/');
  return collapsed.replace(/\/$/, '') || '/';
}

export function parsePageSeoOverrides(raw: unknown): PageSeoOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PageSeoOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const path = normalizePagePath(key);
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const entry: PageSeoEntry = {};
    const title = String(row.title ?? '').trim();
    const description = String(row.description ?? '').trim();
    const ogImage = String(row.ogImage ?? row.og_image ?? '').trim();
    const keywords = parseSearchKeywordLines(row.keywords);
    if (title) entry.title = title;
    if (description) entry.description = description;
    if (ogImage) entry.ogImage = ogImage;
    if (keywords.length) entry.keywords = keywords;
    if (Object.keys(entry).length) out[path] = entry;
  }
  return out;
}

export function getPageSeoOverride(
  overrides: PageSeoOverrides | undefined | null,
  pathname: string,
): PageSeoEntry | null {
  if (!overrides) return null;
  const path = normalizePagePath(pathname);
  return overrides[path] ?? null;
}

export function humanizePagePath(path: string): string {
  const normalized = normalizePagePath(path);
  if (normalized === '/') return 'Home';
  const slug = normalized.split('/').filter(Boolean).pop() || 'Page';
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function mergePageKeywords(
  baseKeywords: string[],
  override: PageSeoEntry | null | undefined,
): string[] {
  return mergeSearchKeywordLists(baseKeywords, override?.keywords);
}
