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
  DEPLOY_WIZARD_SEED_INDUSTRIES,
  buildDeployWizardPlan,
  formatDeployWizardCli,
  isDeployWizardExtraId,
  isDeployWizardSeedIndustryId,
  normalizeDeployWizardSeed,
  type DeployWizardExtraId,
  type DeployWizardPlan,
} from '../../../lib/deployWizardCatalog';
import { executeDeployWizardApply, isDeployWizardApplyNeedGithubApp } from '../../../lib/deployWizardApply';
import { serverEnv } from '../../../lib/serverEnv';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';
import { FEATURE_BLURBS, FEATURE_ID_SET, type FeatureId } from '../../../lib/featureCatalog';
import { hasFeature } from '../../../lib/features';
import { isCanonicalReaveInstall } from '../../../lib/installConfig';
import { isCloudflareConfigured } from '../../../lib/cloudflareClient';
import { isRailwayConfigured, railwayListProjects } from '../../../lib/railwayClient';
import { isResendConfigured } from '../../../lib/resendDnsSync';
import { isGithubAppConfigured } from '../../../lib/githubApp';
import { createGithubAppPending, githubAppCookieHeader } from '../../../lib/deployWizardGithubApp';

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

/** Mark which host secrets exist — never put live values on the plan. */
function presentHostSecrets(plan: DeployWizardPlan): DeployWizardPlan {
  return {
    ...plan,
    variables: plan.variables.map((variable) =>
      variable.inheritFromHost
        ? { ...variable, filled: '', hostHasValue: Boolean(serverEnv(variable.name)?.trim()) }
        : variable,
    ),
  };
}

function parseSeed(body: Record<string, unknown>) {
  const raw = body.seed;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return normalizeDeployWizardSeed();
  const seed = raw as Record<string, unknown>;
  const counties = Array.isArray(seed.courtCounties) ? seed.courtCounties.map(String) : [];
  return normalizeDeployWizardSeed({
    industry: typeof seed.industry === 'string' && isDeployWizardSeedIndustryId(seed.industry) ? seed.industry : 'none',
    inbox: seed.inbox !== false,
    todos: seed.todos !== false,
    schedule: seed.schedule !== false,
    practiceAddress: typeof seed.practiceAddress === 'string' ? seed.practiceAddress : undefined,
    courtRadiusMi: typeof seed.courtRadiusMi === 'number' ? seed.courtRadiusMi : undefined,
    courtCounties: counties,
    practiceArea: typeof seed.practiceArea === 'string' ? seed.practiceArea : undefined,
  });
}


export async function GET(context: APIContext): Promise<Response> {
  const hostDenied = requireCanonicalReaveHost();
  if (hostDenied) return hostDenied;

  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const modules = listDemoLoaderModules();
  const baseline = ['001', '002', '003', '004']
    .map((id) => demoModuleById(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .map((e) => {
      const fromList = modules.find((m) => m.feature === e.feature);
      const inProduction = fromList?.inProduction ?? true;
      const status = fromList?.status ?? 'deployed';
      return {
        moduleId: e.id,
        feature: e.feature,
        label: e.label,
        blurb: FEATURE_BLURBS[e.feature] ?? fromList?.blurb ?? '',
        status,
        inProduction,
        toggleable: inProduction && status === 'deployed',
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
    seedIndustries: [...DEPLOY_WIZARD_SEED_INDUSTRIES],
    defaultModuleIds: baseline.map((m) => m.moduleId),
    railway: {
      configured: isRailwayConfigured(),
      projects,
    },
    cloudflare: { configured: isCloudflareConfigured() },
    resend: { configured: isResendConfigured() },
    githubApp: { configured: isGithubAppConfigured() },
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
  const seed = parseSeed(body);
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
    seed,
  });
  const values = parseValues(body);
  const publicPlan = presentHostSecrets(plan);
  const cli = formatDeployWizardCli(publicPlan, values);
  const action = typeof body.action === 'string' ? body.action : 'plan';

  if (action !== 'apply') {
    return json({ ok: true, plan: publicPlan, cli });
  }

  if (!isRailwayConfigured()) {
    return json({ ok: false, error: 'RAILWAY_API_TOKEN is not set on this service', plan: publicPlan, cli }, 400);
  }

  const project = typeof body.project === 'string' ? body.project.trim() : '';
  const environment = typeof body.environment === 'string' ? body.environment.trim() : 'production';
  if (!project) {
    return json({ ok: false, error: 'project is required to apply variables', plan: publicPlan, cli }, 400);
  }

  const executed = await executeDeployWizardApply({
    plan,
    values,
    project,
    environment,
    request: context.request,
  });

  if (isDeployWizardApplyNeedGithubApp(executed)) {
    const setup = createGithubAppPending(
      {
        features,
        extras,
        appService,
        installSlug: plan.installSlug,
        siteDomain,
        postAlias,
        companyName,
        adminUsername,
        timezone,
        seed,
        project,
        environment,
        values,
      },
      context.url.origin,
    );
    return new Response(
      JSON.stringify({
        ok: true,
        needsGithubApp: setup,
        plan: publicPlan,
        cli,
        provisioned: executed.notes,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Set-Cookie': githubAppCookieHeader(setup.state, context.url.protocol === 'https:'),
        },
      },
    );
  }

  if (!executed.ok) {
    return json({ ok: false, error: executed.error, plan: publicPlan, cli, applied: executed.applied }, executed.applied?.length ? 502 : 400);
  }

  return json({
    ok: true,
    plan: publicPlan,
    cli,
    applied: executed.applied,
    identity: executed.identity,
    dns: executed.dns,
    provisioned: executed.provisioned,
    hint: executed.hint,
  });
}
