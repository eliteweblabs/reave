/**
 * GET  /api/admin/punchlist — install owner's reΛVe punch list (proxies to hub)
 * POST /api/admin/punchlist — add a feature request for official reΛVe
 */

import type { APIContext } from 'astro';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import {
  fetchPunchlistHub,
  isPunchlistHubClientConfigured,
  isPunchlistHubHost,
  localPunchlistIdentity,
  punchlistHubUrl,
} from '../../../../lib/punchlistHub';
import type { HubPunchlistItem } from '../../../../lib/punchlist';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;
  if (isPunchlistHubHost()) {
    return json({ ok: false, error: 'Not found' }, 404);
  }

  const identity = await localPunchlistIdentity(context.request);
  const configured = isPunchlistHubClientConfigured();
  if (!configured) {
    return json({
      ok: true,
      configured: false,
      items: [],
      slug: identity.slug,
      company: identity.company,
      hubUrl: punchlistHubUrl(),
    });
  }

  const result = await fetchPunchlistHub<{ items?: HubPunchlistItem[]; company?: string; slug?: string }>(
    '/api/hub/punchlist',
  );
  if (!result.ok) return json({ ok: false, configured: true, error: result.error }, result.status);
  return json({
    ok: true,
    configured: true,
    items: result.data.items ?? [],
    slug: result.data.slug || identity.slug,
    company: result.data.company || identity.company,
    hubUrl: punchlistHubUrl(),
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;
  if (isPunchlistHubHost()) {
    return json({ ok: false, error: 'Not found' }, 404);
  }
  if (!isPunchlistHubClientConfigured()) {
    return json({ ok: false, error: 'Punch list is not connected. Set REAVE_HUB_KEY.' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const result = await fetchPunchlistHub<{ item?: HubPunchlistItem }>('/api/hub/punchlist', {
    method: 'POST',
    body: JSON.stringify({ title: body.title }),
  });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  return json({ ok: true, item: result.data.item }, 201);
}
