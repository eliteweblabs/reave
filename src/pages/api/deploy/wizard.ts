/**
 * GET  /api/deploy/wizard — catalog for the owner deploy wizard.
 * POST /api/deploy/wizard — build a variable plan, or apply references to Railway.
 */
import type { APIContext } from 'astro';
import {
  listDemoLoaderIncludedCards,
  listDemoLoaderModules,
} from '../../../lib/demoLoaderCatalog';
import {
  catalogBlurb,
  catalogLabel,
  overlayDemoModule,
  overlayIncludedCard,
  sectionsFromCatalog,
} from '../../../lib/moduleCatalogOverlay';
import { ensureModuleCatalogLoaded } from '../../../lib/moduleCatalogStore';
import { DEMO_BASELINE_MODULE_IDS, demoModuleById, resolveDemoModuleFeatures } from '../../../lib/demoModuleCatalog';
import {
  DEPLOY_WIZARD_EXTRAS,
  buildDeployWizardPlan,
  formatDeployWizardCli,
  isDeployWizardExtraId,
  isDeployWizardPublicHost,
  isDeployWizardSeedIndustryId,
  mergeDeployWizardSeedIndustries,
  normalizeDeployWizardSeed,
  normalizeSiteDomain,
  type DeployWizardExtraId,
  type DeployWizardPlan,
  resolveDeployWizardInstallSlug,
  type DeployWizardDnsAccess,
} from '../../../lib/deployWizardCatalog';
import { buildDeployWizardPlanResolved } from '../../../lib/deployWizardStaging';
import { listDeckIndustries } from '../../../lib/deckIndustriesStore';
import { executeDeployWizardApply, isDeployWizardApplyNeedGithubApp } from '../../../lib/deployWizardApply';
import { serverEnv } from '../../../lib/serverEnv';
import { requireDeploymentOwner } from '../../../lib/deploymentOwner';
import { FEATURE_BLURBS, FEATURE_ID_SET, type FeatureId } from '../../../lib/featureCatalog';
import { hasFeature } from '../../../lib/features';
import { isCanonicalReaveInstall } from '../../../lib/installConfig';
import { isCloudflareConfigured } from '../../../lib/cloudflareClient';
import { isRailwayConfigured, railwayListProjects } from '../../../lib/railwayClient';
import { isResendConfigured } from '../../../lib/resendDnsSync';
import { isNamecomConfigured } from '../../../lib/namecomClient';
import { isGoDaddyConfigured } from '../../../lib/godaddyClient';
import { isGithubAppConfigured } from '../../../lib/githubApp';
import {
  createGithubAppPending,
  getGithubAppPending,
  githubAppCookieHeader,
  pendingToCredentials,
  readGithubAppCookie,
  saveGithubAppPending,
} from '../../../lib/deployWizardGithubApp';
import { requestOrigin } from '../../../lib/requestOrigin';
import { DIRECTORY_COUNTIES } from '../../../lib/courtDirectory';
import { PRACTICE_AREAS, PRACTICE_GATE_MODES, US_STATES } from '../../../lib/practiceGate';
import { jsonResponse } from '../../../lib/apiResponse';

export const prerender = false;


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
  return jsonResponse({ ok: false, error: 'Not found' }, 404);
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
  const states = Array.isArray(seed.courtStates) ? seed.courtStates.map(String) : [];
  const areas = Array.isArray(seed.practiceAreas) ? seed.practiceAreas.map(String) : [];
  const gateMode =
    seed.courtGateMode === 'counties' || seed.courtGateMode === 'state' || seed.courtGateMode === 'radius'
      ? seed.courtGateMode
      : undefined;
  return normalizeDeployWizardSeed({
    industry: typeof seed.industry === 'string' && isDeployWizardSeedIndustryId(seed.industry) ? seed.industry : 'none',
    inbox: seed.inbox !== false,
    todos: seed.todos !== false,
    schedule: seed.schedule !== false,
    practiceAddress: typeof seed.practiceAddress === 'string' ? seed.practiceAddress : undefined,
    courtGateMode: gateMode,
    courtRadiusMi: typeof seed.courtRadiusMi === 'number' ? seed.courtRadiusMi : undefined,
    courtCounties: counties,
    courtStates: states,
    practiceAreas: areas,
    practiceArea: typeof seed.practiceArea === 'string' ? seed.practiceArea : undefined,
  });
}


export async function GET(context: APIContext): Promise<Response> {
  const hostDenied = requireCanonicalReaveHost();
  if (hostDenied) return hostDenied;

  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  const probeRaw = context.url.searchParams.get('probeSite')?.trim() || '';
  if (probeRaw) {
    const host = normalizeSiteDomain(probeRaw);
    if (!isDeployWizardPublicHost(host)) {
      return jsonResponse({ ok: false, error: 'Invalid site host' }, 400);
    }
    const origin = `https://${host}`;
    const live = `${origin}/api/health/live`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(live, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'reave-deploy-wizard/1.0' },
      });
      clearTimeout(timer);
      return jsonResponse({ ok: true, url: origin, reachable: res.ok, status: res.status });
    } catch {
      return jsonResponse({ ok: true, url: origin, reachable: false });
    }
  }

  await ensureModuleCatalogLoaded();
  const modules = listDemoLoaderModules().map(overlayDemoModule);
  const baseline = [...DEMO_BASELINE_MODULE_IDS]
    .map((id) => demoModuleById(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .map((e) => {
      const fromList = modules.find((m) => m.feature === e.feature);
      const inProduction = fromList?.inProduction ?? true;
      const status = fromList?.status ?? 'deployed';
      return {
        moduleId: e.id,
        feature: e.feature,
        label: catalogLabel(e.feature, e.label),
        blurb: catalogBlurb(e.feature, FEATURE_BLURBS[e.feature] ?? fromList?.blurb ?? ''),
        status,
        inProduction,
        toggleable: inProduction && status === 'deployed',
        features: fromList?.features ?? [],
        requires: fromList?.requires ?? [],
        requiresLabels: fromList?.requiresLabels ?? [],
      };
    });

  const allModules = [...baseline, ...modules];
  const sections = [
    {
      id: 'baseline',
      title: 'Client baseline',
      modules: baseline,
    },
    ...sectionsFromCatalog(modules),
  ];

  let projects: { id: string; name: string }[] = [];
  if (isRailwayConfigured()) {
    const listed = await railwayListProjects();
    if (listed.ok) projects = listed.projects;
  }

  return jsonResponse({
    ok: true,
    modules: allModules,
    sections,
    included: listDemoLoaderIncludedCards().map(overlayIncludedCard),
    extras: [...DEPLOY_WIZARD_EXTRAS],
    seedIndustries: mergeDeployWizardSeedIndustries(await listDeckIndustries()),
    courtGateModes: [...PRACTICE_GATE_MODES],
    usStates: [...US_STATES],
    directoryCounties: [...DIRECTORY_COUNTIES],
    practiceAreas: [...PRACTICE_AREAS],
    defaultModuleIds: baseline.map((m) => m.moduleId),
    railway: {
      configured: isRailwayConfigured(),
      projects,
    },
    cloudflare: { configured: isCloudflareConfigured() },
    namecom: { configured: isNamecomConfigured() },
    godaddy: { configured: isGoDaddyConfigured() },
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
      ownerFirstName: '',
      ownerLastName: '',
      ownerEmail: '',
      ownerPhone: '',
      timezone: 'America/New_York',
    },
  });
}

function parseDnsAccess(body: Record<string, unknown>): DeployWizardDnsAccess {
  const raw = typeof body.dnsAccess === 'string' ? body.dnsAccess.trim() : '';
  if (raw === 'namecom' || raw === 'godaddy' || raw === 'cloudflare') return raw;
  return 'skip';
}

function parseNamecomCreds(body: Record<string, unknown>): { username?: string; token?: string } {
  const username = typeof body.namecomUsername === 'string' ? body.namecomUsername.trim() : '';
  const token = typeof body.namecomToken === 'string' ? body.namecomToken.trim() : '';
  return {
    username: username || undefined,
    token: token || undefined,
  };
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
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const features = parseFeatures(body);
  const extras = parseExtras(body);
  const appService = typeof body.appService === 'string' ? body.appService : undefined;
  const installSlug = typeof body.installSlug === 'string' ? body.installSlug : undefined;
  const siteDomain = typeof body.siteDomain === 'string' ? body.siteDomain : undefined;
  const postAlias = typeof body.postAlias === 'string' ? body.postAlias : undefined;
  const companyName = typeof body.companyName === 'string' ? body.companyName : undefined;
  const adminUsername = typeof body.adminUsername === 'string' ? body.adminUsername : undefined;
  const ownerFirstName = typeof body.ownerFirstName === 'string' ? body.ownerFirstName : undefined;
  const ownerLastName = typeof body.ownerLastName === 'string' ? body.ownerLastName : undefined;
  const ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail : undefined;
  const ownerPhone = typeof body.ownerPhone === 'string' ? body.ownerPhone : undefined;
  const timezone = typeof body.timezone === 'string' ? body.timezone : undefined;
  const seed = parseSeed(body);
  const dnsAccess = parseDnsAccess(body);
  const namecom = parseNamecomCreds(body);
  const godaddyToken = typeof body.godaddyToken === 'string' ? body.godaddyToken.trim() : '';
  const plan = await buildDeployWizardPlanResolved({
    features,
    extras,
    appService,
    installSlug,
    siteDomain,
    dnsAccess,
    namecomUsername: namecom.username,
    namecomToken: namecom.token,
    godaddyToken: godaddyToken || undefined,
    postAlias,
    companyName,
    adminUsername,
    ownerFirstName,
    ownerLastName,
    ownerEmail,
    ownerPhone,
    timezone,
    seed,
  });
  const values = parseValues(body);
  const publicPlan = presentHostSecrets(plan);
  const cli = formatDeployWizardCli(publicPlan, values);
  const action = typeof body.action === 'string' ? body.action : 'plan';

  if (action !== 'apply') {
    return jsonResponse({ ok: true, plan: publicPlan, cli });
  }

  if (!isRailwayConfigured()) {
    return jsonResponse({ ok: false, error: 'RAILWAY_API_TOKEN is not set on this service', plan: publicPlan, cli }, 400);
  }

  const origin = requestOrigin(context.request);
  const cookieSecure = origin.startsWith('https:');
  const project = typeof body.project === 'string' ? body.project.trim() : '';
  const projectName = typeof body.projectName === 'string' ? body.projectName.trim() : '';
  const environment = typeof body.environment === 'string' ? body.environment.trim() : 'production';
  const applyBody = {
    features,
    extras,
    appService,
    installSlug: plan.installSlug,
    siteDomain,
    dnsAccess,
    namecomUsername: namecom.username,
    namecomToken: namecom.token,
    godaddyToken: godaddyToken || undefined,
    postAlias,
    companyName,
    adminUsername,
    ownerFirstName,
    ownerLastName,
    ownerEmail,
    ownerPhone,
    timezone,
    seed,
    project,
    projectName,
    environment,
    values,
  };
  const wantStream =
    body.stream === true ||
    (context.request.headers.get('accept') || '').includes('ndjson');
  const mightNeedGithub =
    plan.features.includes('website') || plan.features.includes('content_management');
  const resumeGithubApp = pendingToCredentials(
    getGithubAppPending(readGithubAppCookie(context.request.headers.get('cookie'))),
  );

  const githubPayload = (
    setup: ReturnType<typeof createGithubAppPending>,
    notes: string[],
  ) => ({
    ok: true,
    needsGithubApp: setup,
    plan: publicPlan,
    cli,
    provisioned: notes,
  });

  if (!wantStream) {
    const executed = await executeDeployWizardApply({
      plan,
      values,
      project,
      projectName,
      environment,
      request: context.request,
      githubApp: resumeGithubApp || undefined,
      namecomUsername: namecom.username,
      namecomToken: namecom.token,
      godaddyToken: godaddyToken || undefined,
    });
    if (isDeployWizardApplyNeedGithubApp(executed)) {
      const setup = createGithubAppPending(
        {
          ...applyBody,
          project: executed.projectId || project,
          projectName: executed.projectName || projectName,
        },
        origin,
      );
      return new Response(JSON.stringify(githubPayload(setup, executed.notes)), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Set-Cookie': githubAppCookieHeader(setup.state, cookieSecure),
        },
      });
    }
    if (!executed.ok) {
      return jsonResponse(
        { ok: false, error: executed.error, plan: publicPlan, cli, applied: executed.applied },
        executed.applied?.length ? 502 : 400,
      );
    }
    return jsonResponse({
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

  const githubSetup = mightNeedGithub && !resumeGithubApp
    ? createGithubAppPending(applyBody, origin)
    : null;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        emit({ phase: 'start', message: 'Apply started — standing up the stack.' });
        const executed = await executeDeployWizardApply({
          plan,
          values,
          project,
          projectName,
          environment,
          request: context.request,
          githubApp: resumeGithubApp || undefined,
          namecomUsername: namecom.username,
          namecomToken: namecom.token,
          godaddyToken: godaddyToken || undefined,
          onProgress: (message) => emit({ phase: 'log', message }),
        });
        if (isDeployWizardApplyNeedGithubApp(executed)) {
          const setup =
            githubSetup ||
            createGithubAppPending(
              {
                ...applyBody,
                project: executed.projectId || project,
                projectName: executed.projectName || projectName,
              },
              origin,
            );
          if (githubSetup) {
            const pending = getGithubAppPending(githubSetup.state);
            if (pending) {
              saveGithubAppPending(githubSetup.state, {
                ...pending,
                apply: {
                  ...pending.apply,
                  project: executed.projectId || project,
                  projectName: executed.projectName || projectName,
                },
              });
            }
          }
          emit({
            phase: 'github',
            message: `Opening GitHub to create the restricted App for ${setup.repo}…`,
            ...githubPayload(setup, executed.notes),
          });
          return;
        }
        if (!executed.ok) {
          emit({
            phase: 'error',
            ok: false,
            message: executed.error,
            error: executed.error,
            plan: publicPlan,
            cli,
            applied: executed.applied,
          });
          return;
        }
        emit({
          phase: 'done',
          ok: true,
          message: executed.hint,
          plan: publicPlan,
          cli,
          applied: executed.applied,
          identity: executed.identity,
          dns: executed.dns,
          provisioned: executed.provisioned,
          hint: executed.hint,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        emit({ phase: 'error', ok: false, message, error: message });
      } finally {
        controller.close();
      }
    },
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  if (githubSetup) {
    headers['Set-Cookie'] = githubAppCookieHeader(githubSetup.state, cookieSecure);
  }
  return new Response(stream, { status: 200, headers });
}
