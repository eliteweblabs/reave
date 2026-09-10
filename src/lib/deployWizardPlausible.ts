/**
 * Register the client apex in Plausible during deploy wizard Apply / go-live.
 */
import { hostnameFromWebsite, isPlausibleConfigured, plausibleCreateSite, plausibleSitesNewUrl } from './plausibleClient';
import { isApexPublicWebsiteHost, normalizeMonitorHost } from './publicUrl';
import { normalizeSiteDomain } from './deployWizardCatalog';

export type DeployWizardPlausibleResult = {
  ok: boolean;
  skipped: boolean;
  domain: string;
  created?: boolean;
  alreadyExisted?: boolean;
  manualUrl?: string;
  error?: string;
};

/** Best-effort Plausible site registration for a client apex domain. */
export async function registerDeployWizardPlausibleSite(opts: {
  domain: string;
  timezone?: string;
}): Promise<DeployWizardPlausibleResult> {
  const domain =
    normalizeMonitorHost(hostnameFromWebsite(normalizeSiteDomain(opts.domain))) ||
    hostnameFromWebsite(normalizeSiteDomain(opts.domain));
  if (!domain) {
    return { ok: false, skipped: true, domain: '', error: 'domain is required' };
  }
  if (!isApexPublicWebsiteHost(domain)) {
    return { ok: true, skipped: true, domain, error: 'not an apex public website host' };
  }
  if (!isPlausibleConfigured()) {
    return { ok: true, skipped: true, domain, error: 'Plausible is not configured on this host' };
  }

  const timezone = (opts.timezone?.trim() || 'America/New_York').slice(0, 64);
  const out = await plausibleCreateSite(domain, timezone);
  if (out.ok) {
    return {
      ok: true,
      skipped: false,
      domain,
      created: out.created,
      alreadyExisted: out.alreadyExisted,
    };
  }

  const manualUrl = plausibleSitesNewUrl() || undefined;
  return {
    ok: false,
    skipped: false,
    domain,
    manualUrl,
    error: out.error,
  };
}

export function formatDeployWizardPlausibleNote(result: DeployWizardPlausibleResult): string {
  if (result.skipped) {
    if (result.error === 'Plausible is not configured on this host') return '';
    if (result.error === 'not an apex public website host') return '';
    return result.error || '';
  }
  if (result.created) return `Registered ${result.domain} in Plausible.`;
  if (result.alreadyExisted) return `Plausible already had ${result.domain}.`;
  if (result.manualUrl) {
    return `Add ${result.domain} in Plausible manually: ${result.manualUrl}`;
  }
  return result.error ? `Plausible: ${result.error}` : '';
}
