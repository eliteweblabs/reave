import { serverEnv } from './serverEnv';

/** Folder under `src/knowledge/industries/{id}/` for this install’s sample-data industry. */
export function knowledgeIndustryId(raw?: string | null): string | null {
  const slug = (raw ?? serverEnv('DEMO_INDUSTRY') ?? '').trim().toLowerCase();
  if (!slug || slug === 'none' || slug === 'general') return null;
  if (slug === 'law' || slug === 'legal' || slug === 'lawyer' || slug === 'law-firm' || slug === 'bankruptcy') {
    return 'law';
  }
  if (slug === 'plumbing' || slug === 'plumber') return 'plumbing';
  return null;
}
