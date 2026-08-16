/**
 * GET  /api/deploy/wizard — catalog for the owner deploy wizard.
 * POST /api/deploy/wizard — build a variable plan, or apply references to Railway.
 */
import type { APIContext } from 'astro';
import {
  listDemoLoaderIncludedCards,
  listDemoLoaderModules,
  listDemoLoaderSections,
} from '../../../lib/demoLoaderCatalog';
import { demoModuleById, resolveDemoModuleFeatures } from '../../../lib/demoModuleCatalog';
import {
  DEPLOY_WIZARD_EXTRAS,
  buildDeployWizardPlan,
  formatDeployWizardCli,
  isDeployWizardExtraId,
  type DeployWizardExtraId,
} from '../../../lib/deployWizardCatalog';
import { syncCalcomIdentityFromReave } from '../../../lib/calcomIdentitySync';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';
import { FEATURE_BLURBS, FEATURE_ID_SET, type FeatureId } from '../../../lib/featureCatalog';
import { hasFeature } from '../../../lib/features';
import { isCanonicalReaveInstall } from '../../../lib/installConfig';
import { isRailwayConfigured, railwayListProjects } from '../../../lib/railwayClient';
import { railwaySetVariables } from '../../../lib/railwayAgentApi';

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseFeatures(body: Record<string, unknown>): FeatureId[] {
  if (Array.isArray(body.features)) {
    return body.features
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.trim())
      .filter((f): f is FeatureId => FEATURE_ID_SET.has(f));
  }
  if (Array.isArray(body.moduleIds)) {
    const ids = body.moduleIds.filter((id): id is string => typeof id === 'string');
    return resolveDemoModuleFeatures(ids);
  }
  return [];
}

function parseExtras(body: Record<string, unknown>): DeployWizardExtraId[] {
  if (!Array.isArray(body.extras)) return [];
  return body.extras.filter((e): e is DeployWizardExtraId => typeof e === 'string' && isDeployWizardExtraId(e));
}

function parseValues(body: Record<string, unknown>): Record<string, string> {
  const raw = body.values;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) out[key] = value;
  }
  return out;
}

function requireCanonicalReaveHost(): Response | null {
  if (isCanonicalReaveInstall() && hasFeature('deploy_wizard')) return null;
  return json({ ok: false, error: 'Not found' }, 404);
}

export async function GET(context: APIContext): Promise<Response> {
  const hostDenied = requireCanonicalReaveHost();
  if (hostDenied) return hostDenied;

  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const modules = listDemoLoaderModules().map((m) => ({
    ...m,
    toggleable: Boolean(m.moduleId),
  }));
  const baseline = ['001', '002', '003', '004']
    .map((id) => demoModuleById(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .map((e) => {
      const fromList = listDemoLoaderModules().find((m) => m.feature === e.feature);
      return {
        moduleId: e.id,
        feature: e.feature,
        label: e.label,
        blurb: FEATURE_BLURBS[e.feature] ?? fromList?.blurb ?? '',
        status: fromList?.status ?? 'deployed',
        inProduction: fromList?.inProduction ?? true,
        toggleable: true,
        features: fromList?.features ?? [],
      };
    });

  const allModules = [...baseline, ...modules];
  const sections = [
    {
      id: 'baseline',
      title: 'Client baseline',
      modules: baseline,
    },
    ...listDemoLoaderSections(modules),
  ];

  let projects: { id: string; name: string }[] = [];
  if (isRailwayConfigured()) {
    const listed = await railwayListProjects();
    if (listed.ok) projects = listed.projects;
  }

  return json({
    ok: true,
    modules: allModules,
    sections,
    included: listDemoLoaderIncludedCards(),
    extras: [...DEPLOY_WIZARD_EXTRAS],
    defaultModuleIds: baseline.map((m) => m.moduleId),
    railway: {
      configured: isRailwayConfigured(),
      projects,
    },
    defaults: {
      appService: 'reave',
      environment: 'production',
      installSlug: 'demo',
      siteDomain: '',
      postAlias: 'project',
      companyName: '',
      adminUsername: '',
      timezone: 'America/New_York',
    },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const hostDenied = requireCanonicalReaveHost();
  if (hostDenied) return hostDenied;

  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const features = parseFeatures(body);
  const extras = parseExtras(body);
  const appService = typeof body.appService === 'string' ? body.appService : undefined;
  const installSlug = typeof body.installSlug === 'string' ? body.installSlug : undefined;
  const siteDomain = typeof body.siteDomain === 'string' ? body.siteDomain : undefined;
  const postAlias = typeof body.postAlias === 'string' ? body.postAlias : undefined;
  const companyName = typeof body.companyName === 'string' ? body.companyName : undefined;
  const adminUsername = typeof body.adminUsername === 'string' ? body.adminUsername : undefined;
  const timezone = typeof body.timezone === 'string' ? body.timezone : undefined;
  const plan = buildDeployWizardPlan({
    features,
    extras,
    appService,
    installSlug,
    siteDomain,
    postAlias,
    companyName,
    adminUsername,
    timezone,
  });
  const values = parseValues(body);
  const cli = formatDeployWizardCli(plan, values);
  const action = typeof body.action === 'string' ? body.action : 'plan';

  if (action !== 'apply') {
    return json({ ok: true, plan, cli });
  }

  if (!isRailwayConfigured()) {
    return json({ ok: false, error: 'RAILWAY_API_TOKEN is not set on this service', plan, cli }, 400);
  }

  const project = typeof body.project === 'string' ? body.project.trim() : '';
  const environment = typeof body.environment === 'string' ? body.environment.trim() : 'production';
  if (!project) {
    return json({ ok: false, error: 'project is required to apply variables', plan, cli }, 400);
  }

  const byService = new Map<string, Record<string, string>>();
  for (const variable of plan.variables) {
    const key = `${variable.service}:${variable.name}`;
    const value = values[key] ?? variable.filled;
    if (!value) {
      if (variable.required && variable.kind === 'secret') {
        return json(
          { ok: false, error: `Missing value for ${variable.service}.${variable.name}`, plan, cli },
          400,
        );
      }
      continue;
    }
    const bucket = byService.get(variable.service) ?? {};
    bucket[variable.name] = value;
    byService.set(variable.service, bucket);
  }

  const applied: Array<{ service: string; updated: string[] }> = [];
  for (const [service, variables] of byService) {
    const result = await railwaySetVariables({
      project,
      environment,
      service: service === 'shared' ? undefined : service,
      variables,
      skip_deploys: true,
    });
    if (!result.ok) {
      return json({ ok: false, error: `${service}: ${result.error}`, plan, cli, applied }, 502);
    }
    applied.push({ service, updated: result.updated });
  }

  const identity = features.includes('scheduling')
    ? await syncCalcomIdentityFromReave({
        force: true,
        request: context.request,
        project,
      }).catch((e) => ({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }))
    : undefined;

  return json({
    ok: true,
    plan,
    cli,
    applied,
    identity,
    hint: 'Variables saved without an automatic redeploy. Redeploy each service when you are ready.',
  });
}
