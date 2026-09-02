/**
 * Best-effort wiring for Sites fleet gaps — Plausible registration + GSC properties.
 */
import { agencySubject, getIntegrationToken } from './integrationTokens';
import {
  GOOGLE_WEBMASTER_PROVIDER,
  isGoogleWebmasterOAuthConfigured,
} from './googleWebmasterAuth';
import { gscAddSite, gscPropertyCandidates } from './googleSearchConsoleClient';
import { plausibleCreateSite, isPlausibleConfigured, hostnameFromWebsite } from './plausibleClient';
import { normalizeMonitorHost } from './publicUrl';
import type { SiteHealthCardInput } from './siteHealthGrade';
import type { SiteHealthFleet, SiteHealthIssueCode } from './siteHealthScore';

export type SiteWireActionResult = {
  siteId: string;
  plausible?: { ok: boolean; created?: boolean; alreadyExisted?: boolean; error?: string };
  gsc?: { ok: boolean; siteUrl?: string; error?: string };
};

export type SiteWireFleetResult = {
  ok: boolean;
  wired: number;
  attempted: number;
  results: SiteWireActionResult[];
  errors: string[];
};

function siteHost(card: SiteHealthCardInput): string {
  return (
    hostnameFromWebsite(card.website || '') ||
    hostnameFromWebsite(card.siteId) ||
    normalizeMonitorHost(card.siteId) ||
    card.siteId
  );
}

function issueCodes(
  siteHealth: SiteHealthFleet | null,
  siteId: string,
): Set<SiteHealthIssueCode> {
  const row = siteHealth?.sites?.[siteId];
  if (!row?.issues?.length) return new Set();
  return new Set(row.issues.map((i) => i.code));
}

async function agencyGoogleConnected(): Promise<boolean> {
  if (!isGoogleWebmasterOAuthConfigured()) return false;
  try {
    const token = await getIntegrationToken(agencySubject(), GOOGLE_WEBMASTER_PROVIDER);
    return Boolean(token?.accessToken || token?.refreshToken);
  } catch {
    return false;
  }
}

/** Register Plausible + add GSC property for sites flagged unwired in health data. */
export async function wireFleetSites(
  cards: SiteHealthCardInput[],
  siteHealth: SiteHealthFleet | null,
): Promise<SiteWireFleetResult> {
  const results: SiteWireActionResult[] = [];
  const errors: string[] = [];
  let wired = 0;
  let attempted = 0;

  const plausibleReady = isPlausibleConfigured();
  const googleReady = await agencyGoogleConnected();

  for (const card of cards) {
    const host = siteHost(card);
    if (!host) continue;

    const codes = issueCodes(siteHealth, host);
    const needsPlausible =
      codes.has('plausible_unregistered') || card.analytics?.registered === false;
    const needsGsc = codes.has('gsc_missing');

    if (!needsPlausible && !needsGsc) continue;

    attempted += 1;
    const row: SiteWireActionResult = { siteId: host };
    let siteWired = false;

    if (needsPlausible && plausibleReady) {
      const out = await plausibleCreateSite(host);
      if (out.ok) {
        row.plausible = {
          ok: true,
          created: out.created,
          alreadyExisted: out.alreadyExisted,
        };
        if (out.created || out.alreadyExisted) siteWired = true;
      } else {
        row.plausible = { ok: false, error: out.error };
        if (out.error) errors.push(`${host} Plausible: ${out.error}`);
      }
    }

    if (needsGsc && googleReady) {
      const siteUrl = gscPropertyCandidates(host).find((c) => c.startsWith('sc-domain:')) || '';
      if (siteUrl) {
        try {
          await gscAddSite(siteUrl, agencySubject());
          row.gsc = { ok: true, siteUrl };
          siteWired = true;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          row.gsc = { ok: false, siteUrl, error: message };
          errors.push(`${host} GSC: ${message}`);
        }
      }
    }

    if (siteWired) wired += 1;
    results.push(row);
  }

  return {
    ok: wired > 0 || (attempted === 0 && errors.length === 0),
    wired,
    attempted,
    results,
    errors,
  };
}
