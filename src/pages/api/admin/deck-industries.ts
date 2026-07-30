/**
 * Admin CRUD for deck industry / category list.
 * GET  — list industries
 * PUT  — replace full list { industries: [{ slug?, label, enabled?, sortOrder? }] }
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  deckIndustriesStorageBackend,
  listDeckIndustries,
  replaceDeckIndustries,
  type DeckIndustryInput,
} from '../../../lib/deckIndustriesStore';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const industries = await listDeckIndustries();
  return json({
    ok: true,
    backend: deckIndustriesStorageBackend(),
    industries,
  });
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid body' }, 400);
  }

  const industriesRaw = (body as { industries?: unknown }).industries;
  if (!Array.isArray(industriesRaw)) {
    return json({ error: 'industries must be an array' }, 400);
  }

  const inputs: DeckIndustryInput[] = [];
  for (const item of industriesRaw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.label !== 'string') continue;
    inputs.push({
      id: typeof o.id === 'number' ? o.id : undefined,
      slug: typeof o.slug === 'string' ? o.slug : undefined,
      label: o.label,
      sortOrder: typeof o.sortOrder === 'number' ? o.sortOrder : undefined,
      enabled: o.enabled === false ? false : true,
    });
  }

  const result = await replaceDeckIndustries(inputs);
  if (!result.ok) return json({ error: result.error }, 400);
  return json({
    ok: true,
    backend: deckIndustriesStorageBackend(),
    industries: result.industries,
  });
}
