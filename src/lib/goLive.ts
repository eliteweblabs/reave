/**
 * Go-live — move a staged install ({slug}.reave.app) to the client apex.
 * Creates the Cloudflare zone, updates registrar nameservers when Name.com creds
 * are supplied, wires Railway + DNS, and flips PUBLIC_SITE_URL to the apex.
 */
import {
  buildDeployWizardPlan,
  deployWizardResendFrom,
  normalizeSiteDomain,
  type DeployWizardExtraId,
  type DeployWizardPlan,
} from './deployWizardCatalog';
import { applyDeployWizardDns } from './deployWizardDns';
import { applyDeployWizardPublicOrigin, isDeployWizardReaveStagingHost } from './deployWizardStaging';
import { ensureClientCloudflareZone, provisionNamecomNameservers } from './clientDomainProvision';
import { isCloudflareConfigured } from './cloudflareClient';
import { FEATURE_ID_SET, type FeatureId } from './featureCatalog';
import { CATALOG_BASELINE_FEATURES } from './moduleCatalog';
import { isNamecomConfigured } from './namecomClient';
import { isRailwayConfigured, railwayResolveProject } from './railwayClient';
import { railwayListVariables, railwaySetVariables } from './railwayAgentApi';

export type GoLiveRegistrar = 'namecom' | 'manual';

export type GoLiveInstallContext = {
  projectId: string;
  projectName: string;
  environment: string;
  appService: string;
  installSlug: string;
  currentSiteDomain: string;
  plannedSiteDomain: string;
  stagingHost: boolean;
  features: FeatureId[];
  extras: DeployWizardExtraId[];
  postAlias: string;
  companyName: string;
};

export type GoLiveStep = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error';
  detail?: string;
};

export type GoLiveResult =
  | {
      ok: true;
      domain: string;
      nameservers: string[];
      zoneId: string;
      plan: DeployWizardPlan;
      dnsSummary: string;
      registrarUpdated: boolean;
      steps: GoLiveStep[];
    }
  | { ok: false; error: string; steps: GoLiveStep[] };

function parseFeaturesJson(raw: string | undefined): FeatureId[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.trim())
      .filter((f): f is FeatureId => FEATURE_ID_SET.has(f as FeatureId));
  } catch {
    return [];
  }
}

function inferExtras(serviceNames: string[]): DeployWizardExtraId[] {
  const extras: DeployWizardExtraId[] = [];
  const set = new Set(serviceNames.map((n) => n.toLowerCase()));
  if (set.has('plausible')) extras.push('plausible_railway');
  if (set.has('changedetection')) extras.push('changedetection_railway');
  return extras;
}

function pickAppService(services: { name: string }[], preferred?: string): string {
  const want = (preferred ?? 'reave').trim() || 'reave';
  if (services.some((s) => s.name === want)) return want;
  const reave = services.find((s) => s.name === 'reave');
  if (reave) return reave.name;
  return want;
}

export async function loadGoLiveInstallContext(opts: {
  project: string;
  environment?: string;
}): Promise<{ ok: true; data: GoLiveInstallContext } | { ok: false; error: string }> {
  if (!isRailwayConfigured()) {
    return { ok: false, error: 'RAILWAY_API_TOKEN is not set on this host' };
  }

  const resolved = await railwayResolveProject(opts.project.trim());
  if (!resolved.ok) return resolved;

  const envName = (opts.environment ?? 'production').trim() || 'production';
  const appService = pickAppService(resolved.services);

  const vars = await railwayListVariables({
    project: resolved.project.id,
    environment: envName,
    service: appService,
  });
  if (!vars.ok) return vars;

  const installSlug = (vars.variables.INSTALL_CONFIG ?? '').trim() || resolved.project.name;
  const currentSiteDomain = normalizeSiteDomain(vars.variables.PUBLIC_SITE_DOMAIN);
  const plannedSiteDomain =
    normalizeSiteDomain(vars.variables.PLANNED_SITE_DOMAIN) ||
    (currentSiteDomain && !isDeployWizardReaveStagingHost(currentSiteDomain) ? currentSiteDomain : '');

  return {
    ok: true,
    data: {
      projectId: resolved.project.id,
      projectName: resolved.project.name,
      environment: envName,
      appService,
      installSlug,
      currentSiteDomain,
      plannedSiteDomain,
      stagingHost: isDeployWizardReaveStagingHost(currentSiteDomain),
      features: parseFeaturesJson(vars.variables.FEATURES),
      extras: inferExtras(resolved.services.map((s) => s.name)),
      postAlias: (vars.variables.POST_ALIAS ?? 'project').trim() || 'project',
      companyName: (vars.variables.COMPANY_NAME ?? '').trim(),
    },
  };
}

function buildGoLivePlan(ctx: GoLiveInstallContext, apex: string): DeployWizardPlan {
  return buildDeployWizardPlan({
    features: ctx.features.length ? ctx.features : [...CATALOG_BASELINE_FEATURES],
    extras: ctx.extras,
    appService: ctx.appService,
    installSlug: ctx.installSlug,
    siteDomain: apex,
    postAlias: ctx.postAlias,
    companyName: ctx.companyName,
    adminUsername: '',
    ownerFirstName: '',
    ownerLastName: '',
    ownerEmail: '',
    ownerPhone: '',
    timezone: 'America/New_York',
    seed: { industry: 'none', inbox: true, todos: true, schedule: true },
  });
}

export async function executeGoLive(opts: {
  project: string;
  environment?: string;
  domain: string;
  registrar?: GoLiveRegistrar;
  namecomUsername?: string;
  namecomToken?: string;
  onProgress?: (message: string) => void;
}): Promise<GoLiveResult> {
  const say = (message: string) => opts.onProgress?.(message);
  const steps: GoLiveStep[] = [];
  const pushStep = (step: GoLiveStep) => {
    const idx = steps.findIndex((s) => s.id === step.id);
    if (idx >= 0) steps[idx] = step;
    else steps.push(step);
  };

  if (!isCloudflareConfigured()) {
    return { ok: false, error: 'CLOUDFLARE_API_TOKEN is not set on this host', steps };
  }
  if (!isRailwayConfigured()) {
    return { ok: false, error: 'RAILWAY_API_TOKEN is not set on this host', steps };
  }

  const apex = normalizeSiteDomain(opts.domain);
  if (!apex || apex.includes('reave.app')) {
    return { ok: false, error: 'Enter the client-owned apex domain (e.g. acme.com)', steps };
  }

  pushStep({ id: 'context', label: 'Load Railway install', status: 'running' });
  say('Loading install from Railway…');
  const ctxOut = await loadGoLiveInstallContext({
    project: opts.project,
    environment: opts.environment,
  });
  if (!ctxOut.ok) {
    pushStep({ id: 'context', label: 'Load Railway install', status: 'error', detail: ctxOut.error });
    return { ok: false, error: ctxOut.error, steps };
  }
  const ctx = ctxOut.data;
  pushStep({
    id: 'context',
    label: 'Load Railway install',
    status: 'done',
    detail: `${ctx.projectName} · ${ctx.installSlug}${ctx.stagingHost ? ` (staging on ${ctx.currentSiteDomain})` : ''}`,
  });

  pushStep({ id: 'zone', label: 'Cloudflare zone', status: 'running' });
  say(`Creating Cloudflare zone for ${apex}…`);
  const zone = await ensureClientCloudflareZone(apex);
  if (!zone.ok) {
    pushStep({ id: 'zone', label: 'Cloudflare zone', status: 'error', detail: zone.error });
    return { ok: false, error: zone.error, steps };
  }
  pushStep({
    id: 'zone',
    label: 'Cloudflare zone',
    status: 'done',
    detail: zone.data.created ? `Created ${zone.data.zoneName}` : `Using existing ${zone.data.zoneName}`,
  });

  let registrarUpdated = false;
  const registrar = opts.registrar ?? 'manual';
  if (registrar === 'namecom') {
    pushStep({ id: 'registrar', label: 'Registrar nameservers', status: 'running' });
    say(`Pointing ${apex} at Cloudflare nameservers on Name.com…`);
    const ns = await provisionNamecomNameservers({
      domain: apex,
      nameservers: zone.data.nameservers,
      username: opts.namecomUsername,
      token: opts.namecomToken,
    });
    if (!ns.ok) {
      pushStep({ id: 'registrar', label: 'Registrar nameservers', status: 'error', detail: ns.error });
      return { ok: false, error: ns.error, steps };
    }
    registrarUpdated = true;
    pushStep({
      id: 'registrar',
      label: 'Registrar nameservers',
      status: 'done',
      detail: `Updated to ${zone.data.nameservers.join(', ')}`,
    });
  } else {
    pushStep({
      id: 'registrar',
      label: 'Registrar nameservers',
      status: 'skipped',
      detail: 'Copy Cloudflare nameservers at GoDaddy / your registrar (manual step)',
    });
    say('Manual registrar — copy the Cloudflare nameservers shown below.');
  }

  const plan = buildGoLivePlan(ctx, apex);
  pushStep({ id: 'dns', label: 'Railway + DNS', status: 'running' });
  say('Attaching Railway custom domains and writing Cloudflare DNS…');
  const dns = await applyDeployWizardDns({
    plan,
    project: ctx.projectId,
    environment: ctx.environment,
  }).catch((e) => ({
    ok: false,
    configured: isCloudflareConfigured(),
    rows: [],
    leftover: [e instanceof Error ? e.message : String(e)],
    summary: e instanceof Error ? e.message : String(e),
  }));
  if (!dns.ok && dns.rows.every((r) => r.action === 'error')) {
    pushStep({ id: 'dns', label: 'Railway + DNS', status: 'error', detail: dns.summary });
    return { ok: false, error: dns.summary || 'DNS apply failed', steps };
  }
  pushStep({ id: 'dns', label: 'Railway + DNS', status: 'done', detail: dns.summary });

  pushStep({ id: 'origin', label: 'Public URL', status: 'running' });
  say(`Setting PUBLIC_SITE_URL to https://${apex}…`);
  const origin = await applyDeployWizardPublicOrigin({
    project: ctx.projectId,
    environment: ctx.environment,
    plan: { ...plan, plannedSiteDomain: apex, stagingHost: false },
  });
  if (!origin.ok) {
    pushStep({ id: 'origin', label: 'Public URL', status: 'error', detail: origin.error });
    return { ok: false, error: origin.error, steps };
  }

  const resendFrom = deployWizardResendFrom(apex);
  if (resendFrom) {
    await railwaySetVariables({
      project: ctx.projectId,
      environment: ctx.environment,
      service: ctx.appService,
      variables: {
        RESEND_FROM: resendFrom,
        EMAIL_FROM: resendFrom,
        PLANNED_SITE_DOMAIN: apex,
      },
      skip_deploys: false,
    });
  }

  pushStep({
    id: 'origin',
    label: 'Public URL',
    status: 'done',
    detail: `https://${apex} · redeploy when DNS propagates`,
  });
  say('Go-live finished. DNS propagation may take up to 48 hours.');

  return {
    ok: true,
    domain: apex,
    nameservers: zone.data.nameservers,
    zoneId: zone.data.zoneId,
    plan,
    dnsSummary: dns.summary,
    registrarUpdated,
    steps,
  };
}

export function goLiveCapabilities(): {
  cloudflare: boolean;
  railway: boolean;
  namecomEnv: boolean;
} {
  return {
    cloudflare: isCloudflareConfigured(),
    railway: isRailwayConfigured(),
    namecomEnv: isNamecomConfigured(),
  };
}
