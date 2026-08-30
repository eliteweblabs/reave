/**
 * Super-admin CRUD for the module catalog (sale sheet, labels, prices, groups).
 * GET  — list rows + group titles
 * PUT  — replace { rows: [...] } or { reset: true }
 *
 * Official reave.app host only. Client installs 404.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { isCanonicalReaveInstall } from '../../../lib/installConfig';
import {
  applyCatalogIndustriesToPlaybooks,
  listDeckIndustries,
} from '../../../lib/deckIndustriesStore';
import { CATALOG_GROUPS, CATALOG_GROUP_TITLES } from '../../../lib/moduleCatalog';
import { industryDefaultsFromCatalog } from '../../../lib/moduleCatalogOverlay';
import {
  listModuleCatalog,
  moduleCatalogStorageBackend,
  replaceModuleCatalog,
  resetModuleCatalog,
} from '../../../lib/moduleCatalogStore';
import { jsonResponse } from '../../../lib/apiResponse';

async function syncIndustryPlaybooks(rows: { feature: string; id: string }[]) {
  try {
    const industries = await listDeckIndustries();
    await applyCatalogIndustriesToPlaybooks(
      industryDefaultsFromCatalog(
        industries,
        rows.map((row) => ({ feature: row.feature, moduleId: row.id })),
      ),
    );
  } catch (e) {
    console.error('[module-catalog] industry playbook sync failed', e);
  }
}

export const prerender = false;


function requireReaveCatalogAdmin(): Response | null {
  if (isCanonicalReaveInstall()) return null;
  return jsonResponse({ ok: false, error: 'Not found' }, 404);
}

export async function GET(context: APIContext): Promise<Response> {
  const hostDenied = requireReaveCatalogAdmin();
  if (hostDenied) return hostDenied;

  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const rows = await listModuleCatalog();
  const industries = await listDeckIndustries().catch(() => []);
  return jsonResponse({
    ok: true,
    backend: moduleCatalogStorageBackend(),
    rows,
    industries: industries.map((item) => ({
      slug: item.slug,
      label: item.label,
      enabled: item.enabled,
    })),
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
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Invalid body' }, 400);
  }

  const o = body as { reset?: unknown; rows?: unknown };
  const result = o.reset === true ? await resetModuleCatalog() : await replaceModuleCatalog(o.rows);
  if (!result.ok) return jsonResponse({ error: result.error }, 400);
  await syncIndustryPlaybooks(result.rows);
  return jsonResponse({
    ok: true,
    backend: moduleCatalogStorageBackend(),
    rows: result.rows,
    groups: CATALOG_GROUPS.map((id) => ({ id, title: CATALOG_GROUP_TITLES[id] })),
  });
}
