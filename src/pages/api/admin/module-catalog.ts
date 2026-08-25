/**
 * Super-admin CRUD for the module catalog (sale sheet, labels, prices, groups).
 * GET  — list rows + group titles
 * PUT  — replace { rows: [...] } or { reset: true }
 *
 * Official reΛVe.app host only. Client installs 404.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { isCanonicalReaveInstall } from '../../../lib/installConfig';
import { CATALOG_GROUPS, CATALOG_GROUP_TITLES } from '../../../lib/moduleCatalog';
import {
  listModuleCatalog,
  moduleCatalogStorageBackend,
  replaceModuleCatalog,
  resetModuleCatalog,
} from '../../../lib/moduleCatalogStore';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function requireReaveCatalogAdmin(): Response | null {
  if (isCanonicalReaveInstall()) return null;
  return json({ ok: false, error: 'Not found' }, 404);
}

export async function GET(context: APIContext): Promise<Response> {
  const hostDenied = requireReaveCatalogAdmin();
  if (hostDenied) return hostDenied;

  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const rows = await listModuleCatalog();
  return json({
    ok: true,
    backend: moduleCatalogStorageBackend(),
    rows,
    groups: CATALOG_GROUPS.map((id) => ({ id, title: CATALOG_GROUP_TITLES[id] })),
  });
}

export async function PUT(context: APIContext): Promise<Response> {
  const hostDenied = requireReaveCatalogAdmin();
  if (hostDenied) return hostDenied;

  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid body' }, 400);
  }

  const o = body as { reset?: unknown; rows?: unknown };
  const result = o.reset === true ? await resetModuleCatalog() : await replaceModuleCatalog(o.rows);
  if (!result.ok) return json({ error: result.error }, 400);
  return json({
    ok: true,
    backend: moduleCatalogStorageBackend(),
    rows: result.rows,
    groups: CATALOG_GROUPS.map((id) => ({ id, title: CATALOG_GROUP_TITLES[id] })),
  });
}
