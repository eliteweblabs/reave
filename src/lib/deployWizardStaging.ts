/**
 * Staging on the Railway *.up.railway.app URL when the client apex is not ready.
 * Go-live later moves DNS + PUBLIC_SITE_URL to PLANNED_SITE_DOMAIN.
 */
import {
  buildDeployWizardPlan,
  deployWizardCalAllowedHostnames,
  deployWizardSchedulingPublicUrl,
  isDeployWizardPublicHost,
  isDeployWizardRailwayPublicHost,
  normalizeSiteDomain,
  type DeployWizardDnsAccess,
  type DeployWizardPlan,
  type DeployWizardPlanDomain,
  type DeployWizardPlanInput,
} from './deployWizardCatalog';
import { cloudflareFindZone, cloudflareZoneName } from './cloudflareClient';
import { resolveNamecomCredentials } from './namecomClient';
import { resolveGoDaddyCredentials } from './godaddyClient';
import {
  pickRailwayEnvironment,
  railwayEnsurePublicDomain,
  railwayResolveProject,
  railwayResolveService,
} from './railwayClient';
import { railwaySetVariables } from './railwayAgentApi';
import {
  CANONICAL_PUBLIC_BRAND_DOMAIN,
  LEGACY_PUBLIC_BRAND_DOMAIN,
} from './legacyBrandDomain';

/** Official zone used for wizard staging subdomains (canonical). */
export const REAVE_STAGING_PARENT = CANONICAL_PUBLIC_BRAND_DOMAIN;

export function isDeployWizardReaveStagingHost(raw: string | undefined): boolean {
  const host = normalizeSiteDomain(raw);
  if (!host) return false;
  if (isDeployWizardRailwayPublicHost(host)) return true;
  if (host === CANONICAL_PUBLIC_BRAND_DOMAIN || host === LEGACY_PUBLIC_BRAND_DOMAIN) {
    return false;
  }
  return (
    host.endsWith(`.${CANONICAL_PUBLIC_BRAND_DOMAIN}`) ||
    host.endsWith(`.${LEGACY_PUBLIC_BRAND_DOMAIN}`)
  );
}

const RAILWAY_STAGING_NOTE =
  'Preview on the Railway service URL after Apply — no rekko.studio subdomain DNS.';

function railwayStagingNote(planned: string): string {
  return `Saved ${planned} for Go live — ${RAILWAY_STAGING_NOTE}`;
}

/** Read (or create) the app service public *.up.railway.app hostname. */
export async function resolveDeployWizardAppRailwayPublicHost(opts: {
  project: string;
  environment?: string;
  appService: string;
}): Promise<{ ok: true; host: string } | { ok: false; error: string }> {
  const resolved = await railwayResolveProject(opts.project.trim());
  if (!resolved.ok) return resolved;

  const environment = pickRailwayEnvironment(resolved.environments, opts.environment || 'production');
  if (!environment) return { ok: false, error: 'No Railway environment found.' };

  const service = railwayResolveService(resolved.services, opts.appService);
  if (!service.ok) return { ok: false, error: service.error };

  const pub = await railwayEnsurePublicDomain({
    projectId: resolved.project.id,
    environmentId: environment.id,
    serviceId: service.service.id,
  });
  if (!pub.ok) return pub;

  const host = normalizeSiteDomain(pub.domain);
  if (!host) {
    return { ok: false, error: 'Railway did not return a public service domain yet — retry Apply.' };
  }
  return { ok: true, host };
}

/** After the stack exists, set plan.siteDomain to the Railway preview hostname. */
export async function ensureDeployWizardStagingRailwayPlan(opts: {
  plan: DeployWizardPlan;
  project: string;
  environment?: string;
  onProgress?: (message: string) => void;
}): Promise<{ ok: true; plan: DeployWizardPlan } | { ok: false; error: string }> {
  if (!opts.plan.stagingHost) return { ok: true, plan: opts.plan };

  const current = normalizeSiteDomain(opts.plan.siteDomain);
  if (current && isDeployWizardRailwayPublicHost(current)) {
    return { ok: true, plan: opts.plan };
  }
  if (current && !isDeployWizardReaveStagingHost(current)) {
    return { ok: true, plan: opts.plan };
  }

  const railway = await resolveDeployWizardAppRailwayPublicHost({
    project: opts.project,
    environment: opts.environment,
    appService: opts.plan.appService,
  });
  if (!railway.ok) return railway;

  opts.onProgress?.(`Staging URL: https://${railway.host}`);
  return { ok: true, plan: { ...opts.plan, siteDomain: railway.host } };
}

export type DeployWizardSiteResolution = {
  siteDomain: string;
  plannedSiteDomain: string;
  stagingHost: boolean;
  provisionOnApply: boolean;
  dnsAccess: DeployWizardDnsAccess;
  note: string;
};

function hasNamecomCreds(input: Pick<DeployWizardPlanInput, 'dnsAccess' | 'namecomUsername' | 'namecomToken'>): boolean {
  if (input.dnsAccess !== 'namecom') return false;
  return Boolean(resolveNamecomCredentials({ username: input.namecomUsername, token: input.namecomToken }));
}

function hasGoDaddyCreds(input: Pick<DeployWizardPlanInput, 'dnsAccess' | 'godaddyToken'>): boolean {
  if (input.dnsAccess !== 'godaddy') return false;
  return Boolean(resolveGoDaddyCredentials({ token: input.godaddyToken }));
}

/** Pick the public host Apply should wire today. */
export async function resolveDeployWizardSiteDomain(opts: {
  installSlug: string;
  plannedSiteDomain?: string;
  dnsAccess?: DeployWizardDnsAccess;
  namecomUsername?: string;
  namecomToken?: string;
  godaddyToken?: string;
}): Promise<DeployWizardSiteResolution> {
  const planned = normalizeSiteDomain(opts.plannedSiteDomain);
  const dnsAccess: DeployWizardDnsAccess = opts.dnsAccess ?? 'skip';

  if (!planned) {
    return {
      siteDomain: '',
      plannedSiteDomain: '',
      stagingHost: true,
      provisionOnApply: false,
      dnsAccess: 'skip',
      note: RAILWAY_STAGING_NOTE,
    };
  }

  if (isDeployWizardReaveStagingHost(planned)) {
    return {
      siteDomain: '',
      plannedSiteDomain: '',
      stagingHost: true,
      provisionOnApply: false,
      dnsAccess: 'skip',
      note: RAILWAY_STAGING_NOTE,
    };
  }

  const zoneName = cloudflareZoneName(planned);
  const zone = await cloudflareFindZone(zoneName);
  if (zone.ok) {
    return {
      siteDomain: planned,
      plannedSiteDomain: planned,
      stagingHost: false,
      provisionOnApply: false,
      dnsAccess: dnsAccess === 'cloudflare' ? 'cloudflare' : 'skip',
      note: `Cloudflare zone ${zoneName} is ready — wiring ${planned} on Apply.`,
    };
  }

  if (dnsAccess === 'namecom' && hasNamecomCreds(opts)) {
    return {
      siteDomain: planned,
      plannedSiteDomain: planned,
      stagingHost: false,
      provisionOnApply: true,
      dnsAccess: 'namecom',
      note: `Apply creates the Cloudflare zone for ${planned} and updates Name.com nameservers — one-shot go-live.`,
    };
  }

  if (dnsAccess === 'godaddy' && hasGoDaddyCreds(opts)) {
    return {
      siteDomain: planned,
      plannedSiteDomain: planned,
      stagingHost: false,
      provisionOnApply: true,
      dnsAccess: 'godaddy',
      note: `Apply creates the Cloudflare zone for ${planned} and updates GoDaddy nameservers — one-shot go-live.`,
    };
  }

  if (dnsAccess === 'namecom') {
    return {
      siteDomain: '',
      plannedSiteDomain: planned,
      stagingHost: true,
      provisionOnApply: false,
      dnsAccess: 'namecom',
      note: `Enter Name.com credentials to wire ${planned} on Apply — otherwise ${RAILWAY_STAGING_NOTE}`,
    };
  }

  if (dnsAccess === 'godaddy') {
    return {
      siteDomain: '',
      plannedSiteDomain: planned,
      stagingHost: true,
      provisionOnApply: false,
      dnsAccess: 'godaddy',
      note: `Enter a GoDaddy PAT (domains.nameserver:update) to wire ${planned} on Apply — otherwise ${RAILWAY_STAGING_NOTE}`,
    };
  }

  if (dnsAccess === 'cloudflare') {
    return {
      siteDomain: '',
      plannedSiteDomain: planned,
      stagingHost: true,
      provisionOnApply: false,
      dnsAccess: 'cloudflare',
      note: `${planned} is not in Cloudflare yet — ${RAILWAY_STAGING_NOTE} Add the zone or use Name.com credentials.`,
    };
  }

  return {
    siteDomain: '',
    plannedSiteDomain: planned,
    stagingHost: true,
    provisionOnApply: false,
    dnsAccess: 'skip',
    note: railwayStagingNote(planned),
  };
}

export async function buildDeployWizardPlanResolved(
  input: DeployWizardPlanInput,
): Promise<DeployWizardPlan> {
  const installSlug = (input.installSlug ?? 'demo').trim() || 'demo';
  const resolved = await resolveDeployWizardSiteDomain({
    installSlug,
    plannedSiteDomain: input.siteDomain,
    dnsAccess: input.dnsAccess,
    namecomUsername: input.namecomUsername,
    namecomToken: input.namecomToken,
    godaddyToken: input.godaddyToken,
  });

  const plan = buildDeployWizardPlan({
    ...input,
    installSlug,
    siteDomain: resolved.siteDomain,
  });

  const patched: DeployWizardPlan = {
    ...plan,
    plannedSiteDomain: resolved.plannedSiteDomain,
    stagingHost: resolved.stagingHost,
    provisionOnApply: resolved.provisionOnApply,
    dnsAccess: resolved.dnsAccess,
    stagingNote: resolved.note,
  };

  if (resolved.stagingHost) {
    for (const variable of patched.variables) {
      if (variable.name === 'PLANNED_SITE_DOMAIN' && resolved.plannedSiteDomain) {
        variable.filled = resolved.plannedSiteDomain;
        variable.value = resolved.plannedSiteDomain;
      }
      if (variable.name === 'RESEND_FROM' || variable.name === 'EMAIL_FROM') {
        variable.filled = 'noreply@inbound.rekko.studio';
        variable.value = 'noreply@inbound.rekko.studio';
        variable.inheritFromHost = false;
      }
    }
  }

  return patched;
}

/** Railway staging — no Cloudflare rows until Go live wires the client apex. */
export function deployWizardDnsDomainsForApply(plan: DeployWizardPlan): DeployWizardPlanDomain[] {
  if (plan.stagingHost) return [];
  return plan.domains;
}

export async function provisionDeployWizardClientDomain(opts: {
  apex: string;
  dnsAccess: DeployWizardDnsAccess;
  namecomUsername?: string;
  namecomToken?: string;
  godaddyToken?: string;
  onProgress?: (message: string) => void;
}): Promise<{ ok: true; nameservers: string[] } | { ok: false; error: string }> {
  const say = (message: string) => opts.onProgress?.(message);
  const { ensureClientCloudflareZone, provisionNamecomNameservers, provisionGoDaddyNameservers } =
    await import('./clientDomainProvision');

  say(`Ensuring Cloudflare zone for ${opts.apex}…`);
  const zone = await ensureClientCloudflareZone(opts.apex);
  if (!zone.ok) return zone;

  if (opts.dnsAccess === 'namecom') {
    say('Updating Name.com nameservers…');
    const ns = await provisionNamecomNameservers({
      domain: opts.apex,
      nameservers: zone.data.nameservers,
      username: opts.namecomUsername,
      token: opts.namecomToken,
    });
    if (!ns.ok) return ns;
    say(`Name.com now points ${opts.apex} at Cloudflare.`);
  }

  if (opts.dnsAccess === 'godaddy') {
    say('Updating GoDaddy nameservers…');
    const ns = await provisionGoDaddyNameservers({
      domain: opts.apex,
      nameservers: zone.data.nameservers,
      token: opts.godaddyToken,
    });
    if (!ns.ok) return ns;
    say(
      ns.async
        ? `GoDaddy accepted the nameserver change for ${opts.apex} (registry propagation may take a few minutes).`
        : `GoDaddy now points ${opts.apex} at Cloudflare.`,
    );
  }

  return { ok: true, nameservers: zone.data.nameservers };
}

export async function applyDeployWizardPublicOrigin(opts: {
  project: string;
  environment?: string;
  plan: DeployWizardPlan;
}): Promise<{ ok: true; updated: string[] } | { ok: false; error: string }> {
  const host = normalizeSiteDomain(opts.plan.siteDomain);
  if (!host) return { ok: false, error: 'siteDomain is empty' };

  const origin = `https://${host}`;
  const vars: Record<string, string> = {
    PUBLIC_SITE_URL: origin,
    PUBLIC_SITE_DOMAIN: host,
    COMPANY_DOMAIN: host,
  };
  if (opts.plan.plannedSiteDomain) {
    vars.PLANNED_SITE_DOMAIN = opts.plan.plannedSiteDomain;
  }

  const reave = await railwaySetVariables({
    project: opts.project,
    environment: opts.environment,
    service: opts.plan.appService,
    variables: vars,
    skip_deploys: false,
  });
  if (!reave.ok) return reave;

  const contact = await railwaySetVariables({
    project: opts.project,
    environment: opts.environment,
    service: 'contact-api',
    variables: { ALLOWED_ORIGINS: origin },
    skip_deploys: false,
  });
  if (!contact.ok) {
    return { ok: true, updated: reave.updated };
  }

  return { ok: true, updated: [...reave.updated, ...contact.updated.map((n) => `contact-api:${n}`)] };
}

/** Flip Cal.com public URLs from Railway → `cal.{apex}` after DNS is wired. */
export async function applyDeployWizardSchedulingOrigin(opts: {
  project: string;
  environment?: string;
  plan: DeployWizardPlan;
}): Promise<{ ok: true; updated: string[] } | { ok: false; error: string }> {
  if (!opts.plan.features.includes('scheduling') || opts.plan.stagingHost) {
    return { ok: true, updated: [] };
  }
  const apex = normalizeSiteDomain(opts.plan.siteDomain);
  if (!apex || !isDeployWizardPublicHost(apex)) {
    return { ok: false, error: 'siteDomain is not a public apex' };
  }
  const origin = deployWizardSchedulingPublicUrl(apex);
  if (!origin) return { ok: false, error: 'cal host could not be derived' };

  const calcom = await railwaySetVariables({
    project: opts.project,
    environment: opts.environment,
    service: 'calcom-web-app',
    variables: {
      NEXT_PUBLIC_WEBAPP_URL: origin,
      NEXTAUTH_URL: origin,
      ALLOWED_HOSTNAMES: deployWizardCalAllowedHostnames(apex),
    },
    skip_deploys: false,
  });
  if (!calcom.ok) return calcom;

  const reave = await railwaySetVariables({
    project: opts.project,
    environment: opts.environment,
    service: opts.plan.appService,
    variables: {
      CALCOM_WEBAPP_URL: origin,
      PUBLIC_CALCOM_WEBAPP_URL: origin,
    },
    skip_deploys: false,
  });
  if (!reave.ok) {
    return { ok: true, updated: calcom.updated.map((n) => `calcom-web-app:${n}`) };
  }

  return {
    ok: true,
    updated: [
      ...calcom.updated.map((n) => `calcom-web-app:${n}`),
      ...reave.updated.map((n) => `${opts.plan.appService}:${n}`),
    ],
  };
}
