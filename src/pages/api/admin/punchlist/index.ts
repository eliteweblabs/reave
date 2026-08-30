/**
 * GET  /api/admin/punchlist — shared Punch list (official local, client hub)
 * POST /api/admin/punchlist — client install adds a request for official reave
 */

import type { APIContext } from 'astro';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import {
  fetchPunchlistHub,
  isPunchlistHubClientConfigured,
  isPunchlistHubHost,
  listOfficialPunchlistItems,
  localPunchlistIdentity,
  punchlistHubUrl,
} from '../../../../lib/punchlistHub';
import type { HubPunchlistItem } from '../../../../lib/punchlist';
import { isTodoDbConfigured } from '../../../../lib/todoStore';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  if (isPunchlistHubHost()) {
    if (!isTodoDbConfigured()) {
      return jsonResponse({ ok: true, configured: false, host: true, items: [] });
    }
    const items = await listOfficialPunchlistItems();
    return jsonResponse({ ok: true, configured: true, host: true, items });
  }

  const identity = await localPunchlistIdentity(context.request);
  const configured = isPunchlistHubClientConfigured();
  if (!configured) {
    return jsonResponse({
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
  if (!result.ok) return jsonResponse({ ok: false, configured: true, error: result.error }, result.status);
  return jsonResponse({
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
    return jsonResponse({ ok: false, error: 'Add items from Punch list on a client install.' }, 400);
  }
  if (!isPunchlistHubClientConfigured()) {
    return jsonResponse({ ok: false, error: 'Punch list is not connected. Set REAVE_HUB_KEY.' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const result = await fetchPunchlistHub<{ item?: HubPunchlistItem }>('/api/hub/punchlist', {
    method: 'POST',
    body: JSON.stringify({ title: body.title }),
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status);
  return jsonResponse({ ok: true, item: result.data.item }, 201);
}
