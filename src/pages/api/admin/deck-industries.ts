/**
 * Admin CRUD for deck industry / category list + deploy playbooks.
 * GET  — list industries and the module/extra catalog for the editor
 * PUT  — replace full list { industries: [{ slug?, label, enabled?, playbook? }] }
 */
import type { APIContext } from 'astro';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';
import {
  deckIndustriesStorageBackend,
  listDeckIndustries,
  replaceDeckIndustries,
  type DeckIndustryInput,
} from '../../../lib/deckIndustriesStore';
import { DEPLOY_WIZARD_EXTRAS } from '../../../lib/deployWizardCatalog';
import { isCanonicalReaveInstall } from '../../../lib/installConfig';
import { listIndustryPlaybookModules } from '../../../lib/industryPlaybook';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requireReaveIndustriesAdmin(): Response | null {
  if (isCanonicalReaveInstall()) return null;
  return json({ ok: false, error: 'Not found' }, 404);
}

export async function GET(context: APIContext): Promise<Response> {
  const hostDenied = requireReaveIndustriesAdmin();
  if (hostDenied) return hostDenied;

  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const industries = await listDeckIndustries();
  return json({
    ok: true,
    backend: deckIndustriesStorageBackend(),
    industries,
    modules: listIndustryPlaybookModules(),
    extras: DEPLOY_WIZARD_EXTRAS.map((e) => ({
      id: e.id,
      label: e.label,
      blurb: e.blurb,
    })),
  });
}

export async function PUT(context: APIContext): Promise<Response> {
  const hostDenied = requireReaveIndustriesAdmin();
  if (hostDenied) return hostDenied;

  const auth = await requireDeploymentOwner(context);
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
      playbook: o.playbook,
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
