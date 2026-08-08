/**
 * GET /api/people — unified @-mention search: clients (contact-api) + Clerk team users.
 */

import type { APIContext } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { searchClientsEnhanced } from '../../../lib/clientSearch';
import { isContactApiConfigured, listContacts } from '../../../lib/contactApi';
import {
  clerkUserDisplayName,
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

async function searchContacts(q: string | undefined, limit: number): Promise<PeopleSearchResult[]> {
  if (!isContactApiConfigured()) return [];

  if (!q) {
    const result = await listContacts({ limit });
    if (!result.ok) return [];
    return result.data.contacts
      .filter((c) => !c.archived)
      .slice(0, limit)
      .map((c) => ({
        kind: 'contact' as const,
        uid: c.uid,
        name: (c.name || '').trim() || 'Client',
        email: c.email?.trim() || undefined,
        company: c.company?.trim() || undefined,
        phone: c.phone?.trim() || undefined,
      }));
  }

  const result = await searchClientsEnhanced(q, limit);
  if (!result.ok) return [];
  return result.data.contacts.map((c) => ({
    kind: 'contact' as const,
    uid: c.uid,
    name: (c.name || '').trim() || 'Client',
    email: c.email?.trim() || undefined,
    company: c.company?.trim() || undefined,
    phone: c.phone?.trim() || undefined,
  }));
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
        name: clerkUserDisplayName(user),
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
