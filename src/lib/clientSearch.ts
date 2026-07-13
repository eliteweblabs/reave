/**
 * Contact search helpers — supplements contact-api list/resolve, which only
 * fuzzy-match on name/email/phone (not company, notes, website, phone suffix).
 */
import { websiteFromNotes } from './clientBrand';
import { getContact, listContacts, resolveContact, type ContactRecord } from './contactApi';

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

function phoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function phoneMatchScore(phone: string | null | undefined, query: string): number {
  const digits = phoneDigits(phone);
  const qDigits = phoneDigits(query);
  if (!digits || !qDigits) return 0;
  if (digits === qDigits) return 1;
  if (qDigits.length >= 4 && digits.endsWith(qDigits)) return 0.92;
  if (qDigits.length === 4 && digits.endsWith(qDigits)) return 0.9;
  return 0;
}

function notesMatchScore(notes: string | null | undefined, q: string): number {
  if (!notes?.trim() || !q?.trim()) return 0;
  const n = notes.toLowerCase();
  const query = q.trim().toLowerCase();
  if (n.includes(query)) return 0.78;
  return 0;
}

function normalizeDomainish(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function websiteMatchScore(contact: ContactRecord, q: string): number {
  const query = normalizeDomainish(q);
  if (!query || !query.includes('.')) return 0;

  const emailDomain = contact.email?.split('@')[1]?.toLowerCase();
  if (emailDomain && (emailDomain.includes(query) || query.includes(emailDomain))) return 0.88;

  const notesSite = websiteFromNotes(contact.notes ?? '');
  if (notesSite) {
    const domain = normalizeDomainish(notesSite);
    if (domain.includes(query) || query.includes(domain)) return 0.88;
  }

  const company = contact.company?.trim().toLowerCase();
  if (company && company.includes('.') && (company.includes(query) || query.includes(company))) {
    return 0.82;
  }

  return 0;
}

export function formatClientCandidate(
  c: ContactRecord & { _score?: number; _matchReason?: string; score?: number },
) {
  return {
    uid: c.uid,
    name: c.name,
    email: c.email ?? null,
    phone: c.phone ?? null,
    company: c.company ?? null,
    score: c._score ?? c.score ?? null,
    matchReason: c._matchReason ?? null,
  };
}

export type WorkClientResolution =
  | { status: 'resolved'; uid: string; name: string; match: string }
  | {
      status: 'needs_selection';
      reason: 'ambiguous' | 'no_match';
      candidates: ReturnType<typeof formatClientCandidate>[];
      hint: string;
    }
  | { status: 'needs_client'; hint: string };

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

      const checks: Array<[number, string]> = [
        [companyMatchScore(c.company, term), 'company'],
        [phoneMatchScore(c.phone, term), 'phone'],
        [notesMatchScore(c.notes, term), 'notes'],
        [websiteMatchScore(c, term), 'website'],
      ];

      for (const [score, reason] of checks) {
        if (score <= 0) continue;
        const existing = byUid.get(c.uid);
        if (!existing || score > (existing._score ?? 0)) {
          byUid.set(c.uid, { ...c, _score: score, _matchReason: reason });
        }
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

  const enhancedSearch = await searchClientsEnhanced(name, 8);
  if (!enhancedSearch.ok) {
    return { ok: false, error: enhancedSearch.error, status: enhancedSearch.status };
  }

  const hits = enhancedSearch.data.contacts;
  if (!hits.length) {
    return { ok: true, match: 'none', candidates: [] };
  }

  const top = hits[0]!;
  const topScore = top._score ?? 0;
  const candidates = hits.map((c) => ({
    ...c,
    score: c._score,
  }));

  if (topScore >= 0.85 && hits.length === 1) {
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

/**
 * Resolve which client a project belongs to — for chat/agent create_work.
 * Returns structured status so the agent can ask the user when ambiguous.
 */
export async function resolveWorkClientDecision(input: {
  contact_uid?: string;
  contact_name?: string;
  client?: string;
  hints?: string[];
}): Promise<WorkClientResolution> {
  const uid = input.contact_uid?.trim();
  if (uid) {
    const fetched = await getContact(uid);
    if (fetched.ok) {
      return {
        status: 'resolved',
        uid: fetched.data.uid,
        name: input.contact_name?.trim() || fetched.data.name,
        match: 'exact',
      };
    }
    return {
      status: 'needs_selection',
      reason: 'no_match',
      candidates: [],
      hint: `contact_uid ${uid} was not found. Search again or create the client first.`,
    };
  }

  const queries = [
    input.client?.trim(),
    ...(input.hints ?? []).map((h) => h.trim()).filter(Boolean),
  ].filter(Boolean) as string[];

  if (!queries.length) {
    return {
      status: 'needs_client',
      hint:
        'No client identified yet. Ask the user who this project is for, using any clues from the conversation (name, company, phone, email, website, or notes). Call resolve_contact with those hints first, then create_work with contact_uid once confirmed.',
    };
  }

  const seenUids = new Set<string>();
  const mergedCandidates: ScoredContact[] = [];

  for (const query of queries) {
    const resolved = await resolveContactEnhanced({
      name: query,
      phone: phoneDigits(query).length >= 4 ? query : undefined,
    });
    if (!resolved.ok) continue;

    if ((resolved.match === 'exact' || resolved.match === 'likely') && resolved.contact?.uid) {
      return {
        status: 'resolved',
        uid: resolved.contact.uid,
        name: resolved.contact.name,
        match: resolved.match,
      };
    }

    for (const c of resolved.candidates ?? []) {
      if (!c.uid || seenUids.has(c.uid)) continue;
      seenUids.add(c.uid);
      mergedCandidates.push(c as ScoredContact);
    }

    const searched = await searchClientsEnhanced(query, 8);
    if (searched.ok) {
      for (const c of searched.data.contacts) {
        if (seenUids.has(c.uid)) continue;
        seenUids.add(c.uid);
        mergedCandidates.push(c);
      }
    }
  }

  const candidates = rankContacts(mergedCandidates)
    .slice(0, 8)
    .map(formatClientCandidate);

  if (candidates.length === 1 && (candidates[0]?.score ?? 0) >= 0.85) {
    const only = candidates[0]!;
    return {
      status: 'resolved',
      uid: only.uid,
      name: only.name,
      match: 'likely',
    };
  }

  if (candidates.length) {
    return {
      status: 'needs_selection',
      reason: 'ambiguous',
      candidates,
      hint: 'Multiple possible clients matched. Ask the user to confirm which one, then re-call create_work with contact_uid.',
    };
  }

  return {
    status: 'needs_selection',
    reason: 'no_match',
    candidates: [],
    hint:
      'No matching client found. Ask the user for a name, company, phone (last 4 is fine), email, website, or distinguishing notes — or offer to create a new client with create_contact first.',
  };
}
