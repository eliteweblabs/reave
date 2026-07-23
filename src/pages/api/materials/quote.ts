import type { APIContext } from 'astro';
import {
  isMaterialsApiConfigured,
  materialsQuote,
  type MaterialsQuoteItem,
} from '../../../lib/materialsClient';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isMaterialsApiConfigured()) {
    return json({ ok: false, error: 'MATERIALS_API_BASE_URL is not configured' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const items = Array.isArray(body.items) ? (body.items as MaterialsQuoteItem[]) : [];
  const result = await materialsQuote({
    items,
    provider: body.provider != null ? String(body.provider) : undefined,
    zip: body.zip != null ? String(body.zip) : undefined,
  });

  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json(result.data);
}
