/**
 * Deploy wizard → Cloudflare DNS.
 * Attach Railway custom hosts, then upsert CNAME + _railway-verify TXT.
 * Resend inbound MX is synced the same way. Clerk CNAMEs stay optional (`/__clerk` proxy).
 */
import {
  cloudflareFindZone,
  cloudflareListDnsRecords,
  cloudflareUpsertDnsRecord,
  cloudflareZoneName,
  ensureFqdnTrailingDotRedirect,
  isCloudflareConfigured,
} from './cloudflareClient';
import {
  deployWizardDnsKind,
  type DeployWizardDnsKind,
  type DeployWizardPlan,
  type DeployWizardPlanDomain,
} from './deployWizardCatalog';
import { deployWizardDnsDomainsForApply } from './deployWizardStaging';
import {
  isResendConfigured,
  resendCreateDomain,
  resendGetDomainByName,
  syncResendDnsToCloudflare,
} from './resendDnsSync';
import {
  pickRailwayEnvironment,
  railwayEnsureCustomDomain,
  railwayResolveProject,
  railwayResolveService,
  type RailwayCustomDomain,
} from './railwayClient';

export type DeployWizardDnsRow = {
  host: string;
  fqdn: string;
  kind: DeployWizardDnsKind;
  action: 'created' | 'updated' | 'unchanged' | 'skipped' | 'error';
  detail: string;
};

export type DeployWizardDnsResult = {
  ok: boolean;
  configured: boolean;
  zone?: string;
  rows: DeployWizardDnsRow[];
  leftover: string[];
  summary: string;
};

function railwayVerifyTxtName(fqdn: string): string {
  return `_railway-verify.${fqdn.replace(/\.$/, '')}`;
}

function railwayVerifyTxtValue(token: string): string {
  const t = token.trim();
  if (!t) return '';
  return t.startsWith('railway-verify=') ? t : t;
}

function cnameTarget(custom: RailwayCustomDomain): string | null {
  for (const rec of custom.status?.dnsRecords ?? []) {
    const value = rec.requiredValue?.trim();
    if (value) return value.replace(/\.$/, '');
  }
  return null;
}

async function upsertCf(
  zoneId: string,
  expected: { type: string; name: string; content: string; priority?: number },
): Promise<{ action: 'created' | 'updated' | 'unchanged'; error?: undefined } | { action: 'error'; error: string }> {
  const listed = await cloudflareListDnsRecords(zoneId, {
    name: expected.name,
    type: expected.type,
  });
  if (!listed.ok) return { action: 'error', error: listed.error };
  const out = await cloudflareUpsertDnsRecord(zoneId, { ...expected, ttl: 1 }, listed.data);
  if (!out.ok) return { action: 'error', error: out.error };
  return { action: out.data.action };
}

async function applyRailwayHost(opts: {
  domain: DeployWizardPlanDomain;
  zoneId: string;
  projectId: string;
  environmentId: string;
  services: { id: string; name: string }[];
}): Promise<DeployWizardDnsRow> {
  const { domain, zoneId, projectId, environmentId, services } = opts;
  const resolved = railwayResolveService(services, domain.target);
  if (!resolved.ok) {
    return {
      host: domain.host,
      fqdn: domain.fqdn,
      kind: 'railway',
      action: 'error',
      detail: resolved.error,
    };
  }

  const attached = await railwayEnsureCustomDomain({
    projectId,
    environmentId,
    serviceId: resolved.service.id,
    domain: domain.fqdn,
  });
  if (!attached.ok) {
    return {
      host: domain.host,
      fqdn: domain.fqdn,
      kind: 'railway',
      action: 'error',
      detail: attached.error,
    };
  }

  const target = cnameTarget(attached.domain);
  if (!target) {
    return {
      host: domain.host,
      fqdn: domain.fqdn,
      kind: 'railway',
      action: 'error',
      detail: `Railway attached ${domain.fqdn} but did not return a CNAME target yet — retry Apply.`,
    };
  }

  const cname = await upsertCf(zoneId, {
    type: 'CNAME',
    name: domain.fqdn,
    content: target,
  });
  if (cname.action === 'error') {
    return {
      host: domain.host,
      fqdn: domain.fqdn,
      kind: 'railway',
      action: 'error',
      detail: cname.error,
    };
  }

  const token = attached.domain.status?.verificationToken?.trim();
  let txtAction: DeployWizardDnsRow['action'] = cname.action;
  const parts = [
    attached.created ? `Railway attached ${domain.fqdn}` : `Railway already had ${domain.fqdn}`,
    `CNAME → ${target} (${cname.action})`,
  ];
  if (token) {
    const txt = await upsertCf(zoneId, {
      type: 'TXT',
      name: railwayVerifyTxtName(domain.fqdn),
      content: railwayVerifyTxtValue(token),
    });
    if (txt.action === 'error') {
      return {
        host: domain.host,
        fqdn: domain.fqdn,
        kind: 'railway',
        action: 'error',
        detail: `${parts.join(' · ')}; TXT failed: ${txt.error}`,
      };
    }
    txtAction = txt.action === 'created' || cname.action === 'created' ? 'created' : txt.action === 'updated' || cname.action === 'updated' ? 'updated' : 'unchanged';
    parts.push(`TXT _railway-verify (${txt.action})`);
  }

  return {
    host: domain.host,
    fqdn: domain.fqdn,
    kind: 'railway',
    action: txtAction,
    detail: parts.join(' · '),
  };
}

async function applyResendInbound(domain: DeployWizardPlanDomain): Promise<DeployWizardDnsRow> {
  if (!isResendConfigured()) {
    return {
      host: domain.host,
      fqdn: domain.fqdn,
      kind: 'resend',
      action: 'skipped',
      detail: 'RESEND_API_KEY is not set on this host — add inbound MX in Resend, then re-apply.',
    };
  }

  const existing = await resendGetDomainByName(domain.fqdn);
  if (!existing.ok) {
    const created = await resendCreateDomain(domain.fqdn);
    if (!created.ok) {
      return {
        host: domain.host,
        fqdn: domain.fqdn,
        kind: 'resend',
        action: 'error',
        detail: created.error,
      };
    }
  }

  const sync = await syncResendDnsToCloudflare(domain.fqdn);
  if (!sync.ok) {
    return {
      host: domain.host,
      fqdn: domain.fqdn,
      kind: 'resend',
      action: 'error',
      detail: sync.error,
    };
  }
  const changed = sync.rows.filter((r) => r.action === 'created' || r.action === 'updated');
  const errors = sync.rows.filter((r) => r.action === 'error');
  if (errors.length) {
    return {
      host: domain.host,
      fqdn: domain.fqdn,
      kind: 'resend',
      action: 'error',
      detail: errors.map((e) => e.detail || e.name).join('; '),
    };
  }
  return {
    host: domain.host,
    fqdn: domain.fqdn,
    kind: 'resend',
    action: changed.length ? 'created' : 'unchanged',
    detail: sync.summary.split('\n')[0] || 'Resend inbound records synced.',
  };
}

export async function applyDeployWizardDns(opts: {
  plan: DeployWizardPlan;
  project: string;
  environment?: string;
}): Promise<DeployWizardDnsResult> {
  const leftover: string[] = [];
  const rows: DeployWizardDnsRow[] = [];
  const apex = opts.plan.siteDomain.trim();

  if (!apex) {
    return {
      ok: true,
      configured: isCloudflareConfigured(),
      rows: [],
      leftover: ['Enter a site domain to auto-write Cloudflare DNS.'],
      summary: 'DNS skipped — no site domain.',
    };
  }

  if (!isCloudflareConfigured()) {
    return {
      ok: false,
      configured: false,
      rows: [],
      leftover: ['Set CLOUDFLARE_API_TOKEN on this host to auto-write DNS.'],
      summary: 'DNS skipped — Cloudflare is not configured.',
    };
  }

  const zoneName = cloudflareZoneName(apex);
  const zone = await cloudflareFindZone(zoneName);
  if (!zone.ok) {
    return {
      ok: false,
      configured: true,
      zone: zoneName,
      rows: [],
      leftover: [zone.error],
      summary: zone.error,
    };
  }

  const resolved = await railwayResolveProject(opts.project);
  if (!resolved.ok) {
    return {
      ok: false,
      configured: true,
      zone: zoneName,
      rows: [],
      leftover: [resolved.error],
      summary: resolved.error,
    };
  }
  const environment = pickRailwayEnvironment(resolved.environments, opts.environment || 'production');
  if (!environment) {
    return {
      ok: false,
      configured: true,
      zone: zoneName,
      rows: [],
      leftover: ['No Railway environment found.'],
      summary: 'No Railway environment found.',
    };
  }

  for (const domain of deployWizardDnsDomainsForApply(opts.plan)) {
    if (!domain.fqdn || domain.fqdn.includes('{apex}')) {
      rows.push({
        host: domain.host,
        fqdn: domain.fqdn,
        kind: deployWizardDnsKind(domain),
        action: 'skipped',
        detail: 'FQDN is incomplete.',
      });
      continue;
    }

    const kind = deployWizardDnsKind(domain);
    if (kind === 'skip') {
      rows.push({
        host: domain.host,
        fqdn: domain.fqdn,
        kind,
        action: 'skipped',
        detail: 'Not required — the Railway public domain is enough for the booking API.',
      });
      continue;
    }
    if (kind === 'clerk') {
      leftover.push(
        `${domain.fqdn} — optional. Production sign-in uses /__clerk; add this CNAME only if you are not using the proxy.`,
      );
      rows.push({
        host: domain.host,
        fqdn: domain.fqdn,
        kind,
        action: 'skipped',
        detail: 'Optional Clerk CNAME. Production installs proxy Frontend API at /__clerk.',
      });
      continue;
    }
    if (kind === 'resend') {
      rows.push(await applyResendInbound(domain));
      continue;
    }

    rows.push(
      await applyRailwayHost({
        domain,
        zoneId: zone.data.id,
        projectId: resolved.project.id,
        environmentId: environment.id,
        services: resolved.services,
      }),
    );
  }

  const fqdnRedirect = await ensureFqdnTrailingDotRedirect(zone.data.id);
  if (!fqdnRedirect.ok) {
    leftover.push(`FQDN trailing-dot redirect: ${fqdnRedirect.error}`);
  }

  const errors = rows.filter((r) => r.action === 'error');
  const wrote = rows.filter((r) => r.action === 'created' || r.action === 'updated');
  const summary = errors.length
    ? `DNS: ${wrote.length} written, ${errors.length} failed.`
    : wrote.length
      ? `DNS: wrote ${wrote.length} Cloudflare record group(s) on ${zoneName}.`
      : `DNS: Cloudflare already matched the plan for ${zoneName}.`;

  return {
    ok: errors.length === 0,
    configured: true,
    zone: zoneName,
    rows,
    leftover,
    summary,
  };
}
