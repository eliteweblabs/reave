/**
 * Create the inquiry project file immediately when a Siri audit shortcut fires,
 * so the Work tab shows something in progress before the agent finishes.
 */

import {
  ensureWorkContact,
  isSafeWorkSlug,
  slugFromTitle,
  storeReadWork,
  storeWriteWork,
} from './workStore';
import type { SiriAuditTier } from './siriAuditRuns';

export type SiriAuditStubInput = {
  business: string;
  tier: SiriAuditTier;
  url?: string;
  phone?: string;
  email?: string;
  notes?: string;
};

function stubBody(input: SiriAuditStubInput, startedAt: string): string {
  const tierLabel = input.tier === 'full' ? 'Full audit' : 'Quick audit (street)';
  const lines = [
    '## Siri audit in progress',
    '',
    `- **Business:** ${input.business}`,
    `- **Tier:** ${tierLabel}`,
    `- **Started:** ${startedAt}`,
  ];
  if (input.url?.trim()) lines.push(`- **URL hint:** ${input.url.trim()}`);
  if (input.phone?.trim()) lines.push(`- **Phone hint:** ${input.phone.trim()}`);
  if (input.email?.trim()) lines.push(`- **Email hint:** ${input.email.trim()}`);
  if (input.notes?.trim()) lines.push(`- **Notes:** ${input.notes.trim()}`);
  lines.push(
    '',
    'The research agent is locating the business, running website checks, and will replace this stub with the full audit.',
    '',
    '_Created when the Siri shortcut fired — no chat thread is kept for the research prompt._',
  );
  return lines.join('\n');
}

function stubTitle(business: string): string {
  const trimmed = business.trim().replace(/\s+/g, ' ');
  return trimmed ? `Auditing ${trimmed}…` : 'Auditing…';
}

async function uniqueAuditSlug(base: string): Promise<string> {
  let slug = slugFromTitle(base);
  if (!slug || !isSafeWorkSlug(slug)) {
    slug = slugFromTitle(`${base}-${Date.now()}`);
  }
  if (!slug || !isSafeWorkSlug(slug)) {
    return `siri-audit-${Date.now().toString(36)}`;
  }
  if (!(await storeReadWork(slug))) return slug;
  const suffixed = `${slug}-${Date.now().toString(36).slice(-4)}`;
  return isSafeWorkSlug(suffixed) ? suffixed : `${slug}-${Date.now()}`;
}

export async function createSiriAuditStubProject(
  input: SiriAuditStubInput,
): Promise<
  | { ok: true; slug: string; title: string; contactUid: string; contactName: string }
  | { ok: false; error: string }
> {
  const business = input.business.trim();
  if (!business) return { ok: false, error: 'Business name is required' };

  const contact = await ensureWorkContact({
    contact_name: business,
    client: business,
  });
  if (!contact.ok) return { ok: false, error: contact.error };

  const slug = await uniqueAuditSlug(`auditing-${business}`);
  const startedAt = new Date().toISOString();
  const title = stubTitle(business);

  const written = await storeWriteWork(slug, {
    title,
    contact_uid: contact.uid,
    contact_name: contact.name,
    status: 'inquiry',
    source: 'siri_audit',
    record_origin: 'siri',
    tags: ['siri-audit', input.tier === 'full' ? 'full-audit' : 'quick-audit'],
    body: stubBody(input, startedAt),
  });

  if (!written.ok) return { ok: false, error: written.error };

  return {
    ok: true,
    slug: written.doc.slug,
    title: written.doc.title,
    contactUid: contact.uid,
    contactName: contact.name,
  };
}
