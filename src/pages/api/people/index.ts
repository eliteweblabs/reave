/**
 * GET /api/people — unified @-mention search: clients + proposed (contact-api)
 * and Clerk team users. Personal and service contacts are excluded.
 */

import type { APIContext } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { clientListDisplayName, searchClientsEnhanced } from '../../../lib/clientSearch';
import {
  attachPortalLinksForList,
  getClientKind,
  isContactApiConfigured,
  listContacts,
  type ContactRecord,
} from '../../../lib/contactApi';
import {
  clerkUserDisplayName,
  isMentionableClientKind,
  sanitizeMentionLabel,
  type PeopleSearchResult,
} from '../../../lib/chatMentions';
import { requireDashboardUser } from '../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function scoreName(name: string, q: string): number {
  const n = name.trim().toLowerCase();
  const query = q.trim().toLowerCase();
  if (!query) return 0;
  if (n === query) return 100;
  if (n.startsWith(query)) return 80;
  if (n.includes(query)) return 50;
  return 10;
}

function toMentionContact(c: ContactRecord): PeopleSearchResult | null {
  const clientKind = getClientKind(c);
  if (!isMentionableClientKind(clientKind)) return null;
  return {
    kind: 'contact',
    uid: c.uid,
    // Company-first label — matches CRM sidebar and what users type after @.
    name: sanitizeMentionLabel(clientListDisplayName(c)),
    email: c.email?.trim() || undefined,
    company: c.company?.trim() || undefined,
    phone: c.phone?.trim() || undefined,
    clientKind,
  };
}

async function searchContacts(q: string | undefined, limit: number): Promise<PeopleSearchResult[]> {
  if (!isContactApiConfigured()) return [];

  // Kind lives on portal metadata. Attach links before dropping personal/service
  // or the first page is often vendor/noreply noise (Google, Railway, etc.).
  if (!q) {
    const result = await listContacts({ limit: 200 });
    if (!result.ok) return [];
    const active = result.data.contacts.filter((c) => !c.archived);
    const out: PeopleSearchResult[] = [];
    const batchSize = 24;
    for (let i = 0; i < active.length && out.length < limit; i += batchSize) {
      const batch = active.slice(i, i + batchSize);
      await attachPortalLinksForList(batch);
      for (const c of batch) {
        const row = toMentionContact(c);
        if (row) out.push(row);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  const result = await searchClientsEnhanced(q, Math.min(limit * 3, 60));
  if (!result.ok) return [];
  return result.data.contacts
    .map(toMentionContact)
    .filter((p): p is PeopleSearchResult => p != null)
    .slice(0, limit);
}

async function searchTeamUsers(
  context: APIContext,
  q: string | undefined,
  limit: number,
): Promise<PeopleSearchResult[]> {
  try {
    const client = clerkClient(context);
    const batch = await client.users.getUserList({
      limit: Math.min(Math.max(limit, 1), 50),
      offset: 0,
      ...(q ? { query: q } : {}),
    });
    return batch.data.map((user) => {
      const email = user.emailAddresses?.[0]?.emailAddress?.trim() || undefined;
      return {
        kind: 'user' as const,
        userId: user.id,
        name: sanitizeMentionLabel(clerkUserDisplayName(user)),
        email,
        username: user.username?.trim() || undefined,
      };
    });
  } catch {
    return [];
  }
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);
  const q = url.searchParams.get('q')?.trim() || undefined;
  const limitRaw = Number(url.searchParams.get('limit') ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 40) : 20;

  // Fetch more from each source so we can merge/rank into `limit`.
  const perSource = Math.min(limit, 20);
  const [contacts, users] = await Promise.all([
    searchContacts(q, perSource),
    searchTeamUsers(context, q, perSource),
  ]);

  const scored = [
    ...contacts.map((p) => ({
      p,
      score: (q ? scoreName(p.name, q) : 0) + 5, // slight contact preference when tied
    })),
    ...users.map((p) => ({
      p,
      score: q ? scoreName(p.name, q) : 0,
    })),
  ].sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));

  const people = scored.slice(0, limit).map((s) => s.p);
  return json({ ok: true, people });
}
