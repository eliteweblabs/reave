import type { APIContext } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  try {
    const user = await clerkClient(context).users.getUser(userId);
    const meta = (user.publicMetadata ?? {}) as Record<string, unknown>;
    const tabOrder = Array.isArray(meta.osMapTabOrder) ? meta.osMapTabOrder : null;
    return jsonResponse({ tabOrder });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: { tabOrder?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!Array.isArray(body.tabOrder) || !body.tabOrder.every((k) => typeof k === 'string')) {
    return jsonResponse({ error: 'tabOrder must be a string array' }, 400);
  }

  try {
    const client = clerkClient(context);
    const user = await client.users.getUser(userId);
    const meta = (user.publicMetadata ?? {}) as Record<string, unknown>;

    await client.users.updateUser(userId, {
      publicMetadata: {
        ...meta,
        osMapTabOrder: body.tabOrder,
      },
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
}
