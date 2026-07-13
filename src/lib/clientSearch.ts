/**
 * Contact search helpers — supplements contact-api list/resolve, which only
 * fuzzy-match on name/email/phone (not company).
 */
import { listContacts, resolveContact, type ContactRecord } from './contactApi';

/** Split "Reggie / Solid Builders" → ["Reggie / Solid Builders", "Solid Builders", "Reggie"]. */
export function extractClientSearchTerms(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const terms = new Set<string>([trimmed]);
  for (const part of trimmed.split(/\s*[\/|—–-]\s*/)) {
    const p = part.trim();
    if (p) terms.add(p);
  }
  return [...terms];
}

/** Prefer the company segment after "/" when present. */
export function primaryClientSearchTerm(raw: string): string {
  const terms = extractClientSearchTerms(raw);
  if (terms.length <= 1) return terms[0] ?? raw.trim();
  return terms[terms.length - 1]!;
}

export function companyMatchesQuery(
  company: string | null | undefined,
  q: string,
): boolean {
  if (!company?.trim() || !q?.trim()) return false;
  const c = company.trim().toLowerCase();
  const query = q.trim().toLowerCase();
  return c.includes(query) || query.includes(c);
}

function companyMatchScore(company: string | null | undefined, q: string): number {
  if (!company?.trim() || !q?.trim()) return 0;
  const c = company.trim().toLowerCase();
  const query = q.trim().toLowerCase();
  if (c === query) return 1;
  if (c.includes(query) || query.includes(c)) return 0.85;
  return 0;
}

export type ScoredContact = ContactRecord & { _score?: number; _matchReason?: string };

function rankContacts(contacts: ScoredContact[]): ScoredContact[] {
  return [...contacts].sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
}

/**
 * Search contacts by name/email (via contact-api) plus company (local filter).
 * contact-api GET /api/contacts only searches name + email.
 */
export async function searchClientsEnhanced(
  q: string,
  limit = 20,
): Promise<
  | { ok: true; data: { total: number; contacts: ScoredContact[] } }
  | { ok: false; error: string; status?: number }
> {
  const terms = extractClientSearchTerms(q);
  const searchQ = primaryClientSearchTerm(q);

  const [nameResult, broadResult] = await Promise.all([
    listContacts({ q: searchQ, limit }),
    listContacts({ limit: 200 }),
  ]);

  if (!nameResult.ok) return nameResult;
  if (!broadResult.ok) return broadResult;

  const byUid = new Map<string, ScoredContact>();

  for (const c of nameResult.data.contacts) {
    if (c.archived) continue;
    byUid.set(c.uid, { ...c, _score: 0.9, _matchReason: 'name' });
  }

  for (const term of terms) {
    for (const c of broadResult.data.contacts) {
      if (c.archived) continue;
      const score = companyMatchScore(c.company, term);
      if (score <= 0) continue;
      const existing = byUid.get(c.uid);
      if (!existing || score > (existing._score ?? 0)) {
        byUid.set(c.uid, { ...c, _score: score, _matchReason: 'company' });
      }
    }
  }

  const contacts = rankContacts([...byUid.values()]).slice(0, limit);
  return { ok: true, data: { total: contacts.length, contacts } };
}

export type ResolveEnhancedResult =
  | {
      ok: true;
      match: 'exact' | 'likely' | 'possible' | 'none';
      contact?: ContactRecord;
      candidates: Array<ContactRecord & { score?: number }>;
      score?: number;
    }
  | { ok: false; error: string; status?: number };

/**
 * Resolve a client query — standard contact-api fuzzy resolve, then company
 * fallback for strings like "Reggie / Solid Builders".
 */
export async function resolveContactEnhanced(input: {
  name?: string;
  email?: string;
  phone?: string;
}): Promise<ResolveEnhancedResult> {
  const name = input.name?.trim() || '';
  const email = input.email?.trim() || undefined;
  const phone = input.phone?.trim() || undefined;

  if (!name && !email && !phone) {
    return { ok: false, error: 'Provide at least one of: name, email, phone' };
  }

  const resolved = await resolveContact({ name, email, phone });
  if (!resolved.ok) return { ok: false, error: resolved.error, status: resolved.status };

  const payload = resolved.data as Record<string, unknown>;
  const match = String(payload.match ?? 'none').toLowerCase();
  const contact = payload.contact as ContactRecord | undefined;
  const apiCandidates = (payload.candidates as Array<ContactRecord & { score?: number }>) ?? [];

  if ((match === 'exact' || match === 'likely') && contact?.uid) {
    return {
      ok: true,
      match: match as 'exact' | 'likely',
      contact,
      candidates: apiCandidates,
      score: typeof payload.score === 'number' ? payload.score : undefined,
    };
  }

  if (match === 'possible' && apiCandidates.length) {
    return { ok: true, match: 'possible', candidates: apiCandidates };
  }

  if (!name) {
    return { ok: true, match: 'none', candidates: [] };
  }

  const companySearch = await searchClientsEnhanced(name, 8);
  if (!companySearch.ok) {
    return { ok: false, error: companySearch.error, status: companySearch.status };
  }

  const companyHits = companySearch.data.contacts.filter((c) => c._matchReason === 'company');
  if (!companyHits.length) {
    return { ok: true, match: 'none', candidates: [] };
  }

  const top = companyHits[0]!;
  const topScore = top._score ?? 0;
  const candidates = companyHits.map((c) => ({
    ...c,
    score: c._score,
  }));

  if (topScore >= 0.85 && companyHits.length === 1) {
    return {
      ok: true,
      match: 'likely',
      contact: top,
      candidates,
      score: topScore,
    };
  }

  return { ok: true, match: 'possible', candidates };
}

/** Best single contact for a free-text client string (used on save). */
export async function findContactByQuery(
  query: string,
): Promise<{ uid: string; name: string } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const result = await resolveContactEnhanced({ name: trimmed });
  if (!result.ok || result.match === 'none') return null;

  if ((result.match === 'exact' || result.match === 'likely') && result.contact?.uid) {
    return { uid: result.contact.uid, name: result.contact.name || trimmed };
  }

  return null;
}
