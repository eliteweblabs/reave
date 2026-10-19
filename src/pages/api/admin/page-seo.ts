import type { APIContext } from 'astro';
import { discoverPublicPagePaths } from '../../../lib/astroPageInventory';
import { jsonResponse } from '../../../lib/apiResponse';
import { getStoredCompanyConfig, setStoredCompanyConfig } from '../../../lib/companyConfigStore';
import {
  humanizePagePath,
  normalizePagePath,
  parsePageSeoOverrides,
  type PageSeoOverrides,
} from '../../../lib/pageSeo';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';

export const prerender = false;

function sanitizeOverrides(raw: unknown): PageSeoOverrides {
  const parsed = parsePageSeoOverrides(raw);
  const out: PageSeoOverrides = {};
  for (const [path, entry] of Object.entries(parsed)) {
    out[normalizePagePath(path)] = entry;
  }
  return out;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const stored = await getStoredCompanyConfig();
  const overrides = parsePageSeoOverrides(stored?.pageSeoOverrides);
  const paths = discoverPublicPagePaths();
  const pages = paths.map((path) => ({
    path,
    suggestedTitle: humanizePagePath(path),
    override: overrides[path] ?? null,
  }));

  return jsonResponse({ ok: true, pages, overrides });
}

export async function PUT(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  let body: { overrides?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const overrides = sanitizeOverrides(body.overrides);
  const ok = await setStoredCompanyConfig({ pageSeoOverrides: overrides });
  if (!ok) {
    return jsonResponse({ ok: false, error: 'Could not save page SEO settings.' }, 500);
  }

  return jsonResponse({ ok: true, overrides });
}
