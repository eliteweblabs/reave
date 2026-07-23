import type { APIContext } from 'astro';
import { isMaterialsApiConfigured, materialsListProviders } from '../../../lib/materialsClient';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isMaterialsApiConfigured()) {
    return json({ ok: false, error: 'MATERIALS_API_BASE_URL is not configured' }, 503);
  }

  const result = await materialsListProviders();
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json(result.data);
}
