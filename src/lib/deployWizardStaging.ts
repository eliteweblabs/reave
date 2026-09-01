/**
 * Staging hosts on reave.app when the client apex is not in Cloudflare yet.
 * Go-live later moves DNS + PUBLIC_SITE_URL to PLANNED_SITE_DOMAIN.
 */
import {
  buildDeployWizardPlan,
  deployWizardStagingHost,
  DEPLOY_APP_SERVICE,
  normalizeSiteDomain,
  type DeployWizardPlan,
  type DeployWizardPlanDomain,
  type DeployWizardPlanInput,
} from './deployWizardCatalog';
import { cloudflareFindZone, cloudflareZoneName } from './cloudflareClient';
import { railwaySetVariables } from './railwayAgentApi';

export const REAVE_STAGING_PARENT = 'reave.app';

export function isDeployWizardReaveStagingHost(raw: string | undefined): boolean {
  const host = normalizeSiteDomain(raw);
  if (!host || host === REAVE_STAGING_PARENT) return false;
  return host.endsWith(`.${REAVE_STAGING_PARENT}`);
}

export type DeployWizardSiteResolution = {
  siteDomain: string;
  plannedSiteDomain: string;
  stagingHost: boolean;
  note: string;
};

/** Pick the public host Apply should wire today. */
export async function resolveDeployWizardSiteDomain(opts: {
  installSlug: string;
  plannedSiteDomain?: string;
}): Promise<DeployWizardSiteResolution> {
  const slug = (opts.installSlug ?? '').trim() || 'demo';
  const planned = normalizeSiteDomain(opts.plannedSiteDomain);
  const stagingDefault = deployWizardStagingHost(slug);

  if (!planned) {
    return {
      siteDomain: stagingDefault,
      plannedSiteDomain: '',
      stagingHost: true,
      note: `No client domain yet — staging at ${stagingDefault}.`,
    };
  }

  if (isDeployWizardReaveStagingHost(planned)) {
    return {
      siteDomain: planned,
      plannedSiteDomain: '',
      stagingHost: true,
      note: `Using REΛVE staging host ${planned}.`,
    };
  }

  const zoneName = cloudflareZoneName(planned);
  const zone = await cloudflareFindZone(zoneName);
  if (zone.ok) {
    return {
      siteDomain: planned,
      plannedSiteDomain: planned,
      stagingHost: false,
      note: `Cloudflare zone ${zoneName} is ready — wiring ${planned}.`,
    };
  }

  return {
    siteDomain: stagingDefault,
    plannedSiteDomain: planned,
    stagingHost: true,
    note: `${planned} is not in Cloudflare yet — staging at ${stagingDefault}. Go live when DNS is ready.`,
  };
}

export async function buildDeployWizardPlanResolved(
  input: DeployWizardPlanInput,
): Promise<DeployWizardPlan> {
  const installSlug = (input.installSlug ?? 'demo').trim() || 'demo';
  const resolved = await resolveDeployWizardSiteDomain({
    installSlug,
    plannedSiteDomain: input.siteDomain,
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
    stagingNote: resolved.note,
  };

  if (resolved.stagingHost) {
    for (const variable of patched.variables) {
      if (variable.name === 'PLANNED_SITE_DOMAIN' && resolved.plannedSiteDomain) {
        variable.filled = resolved.plannedSiteDomain;
        variable.value = resolved.plannedSiteDomain;
      }
      if (variable.name === 'RESEND_FROM' || variable.name === 'EMAIL_FROM') {
        variable.filled = 'noreply@inbound.reave.app';
        variable.value = 'noreply@inbound.reave.app';
        variable.inheritFromHost = false;
      }
    }
  }

  return patched;
}

/** Staging demos only need the app host on Railway — skip ap/cal/inbound until go-live. */
export function deployWizardDnsDomainsForApply(plan: DeployWizardPlan): DeployWizardPlanDomain[] {
  if (!plan.stagingHost) return plan.domains;
  return plan.domains.filter(
    (d) => d.host === '@' && (d.target === plan.appService || d.target === DEPLOY_APP_SERVICE),
  );
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
