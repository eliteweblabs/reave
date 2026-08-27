/**
 * PATCH  /api/admin/punchlist/:id — rename or complete a punch-list item
 * DELETE /api/admin/punchlist/:id — remove a punch-list item
 */

import type { APIContext } from 'astro';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import {
  deleteOfficialPunchlistItem,
  fetchPunchlistHub,
  isPunchlistHubClientConfigured,
  isPunchlistHubHost,
  updateOfficialPunchlistItem,
} from '../../../../lib/punchlistHub';
import type { HubPunchlistItem } from '../../../../lib/punchlist';
import type { TodoStatus } from '../../../../lib/todoStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function parseStatus(raw: unknown): TodoStatus | undefined {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'open' || v === 'done' ? v : undefined;
}

export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const id = parseId(context.params.id);
  if (!id) return json({ ok: false, error: 'Not found' }, 404);

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  if (isPunchlistHubHost()) {
    const result = await updateOfficialPunchlistItem({
      id,
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(parseStatus(body.status) ? { status: parseStatus(body.status) } : {}),
    });
    if (!result.ok) return json({ ok: false, error: result.error }, result.status);
    return json({ ok: true, item: result.item });
  }

  if (!isPunchlistHubClientConfigured()) {
    return json({ ok: false, error: 'Punch list is not connected. Set REAVE_HUB_KEY.' }, 503);
  }

  const result = await fetchPunchlistHub<{ item?: HubPunchlistItem }>(`/api/hub/punchlist/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    }),
  });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  return json({ ok: true, item: result.data.item });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const id = parseId(context.params.id);
  if (!id) return json({ ok: false, error: 'Not found' }, 404);

  if (isPunchlistHubHost()) {
    const result = await deleteOfficialPunchlistItem(id);
    if (!result.ok) return json({ ok: false, error: result.error }, result.status);
    return json({ ok: true, id, deleted: true });
  }

  if (!isPunchlistHubClientConfigured()) {
    return json({ ok: false, error: 'Punch list is not connected. Set REAVE_HUB_KEY.' }, 503);
  }

  const result = await fetchPunchlistHub<{ id?: number }>(`/api/hub/punchlist/${id}`, {
    method: 'DELETE',
  });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  return json({ ok: true, id, deleted: true });
}
