/**
 * Minimal Railway public GraphQL client (account / workspace token).
 * @see https://docs.railway.com/integrations/api
 */
import { cachedCompanyBrandName } from './companyConfig';
import { isNonProductionLabel, normalizeMonitorHost } from './publicUrl';
import { serverEnv } from './serverEnv';

const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';

export type RailwayGqlError = { message: string };

export async function railwayGraphql<T>(opts: {
  query: string;
  variables?: Record<string, unknown>;
}): Promise<
  | { ok: true; data: T }
  | { ok: false; errors: RailwayGqlError[]; status?: number; raw?: string }
> {
  const token = serverEnv('RAILWAY_API_TOKEN')?.trim();
  if (!token) {
    return { ok: false, errors: [{ message: 'RAILWAY_API_TOKEN is not set on this service' }] };
  }

  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: opts.query, variables: opts.variables ?? {} }),
  });

  const raw = await res.text();
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, errors: [{ message: 'Invalid JSON from Railway' }], status: res.status, raw: raw.slice(0, 400) };
  }

  const o = body as { data?: T; errors?: RailwayGqlError[] };
  if (!res.ok) {
    return {
      ok: false,
      errors: o.errors?.length ? o.errors : [{ message: `HTTP ${res.status}` }],
      status: res.status,
      raw: raw.slice(0, 400),
    };
  }
  if (o.errors?.length) {
    return { ok: false, errors: o.errors, status: res.status, raw: raw.slice(0, 400) };
  }
  if (o.data === undefined) {
    return { ok: false, errors: [{ message: 'No data in Railway response' }], raw: raw.slice(0, 400) };
  }
  return { ok: true, data: o.data };
}

export function sanitizeRailwayProjectName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, 64);
  return s;
}

/** Empty Railway project — name only; optional workspace id in input if set in env. */
export async function createRailwayEmptyProject(name: string): Promise<
  | { ok: true; id: string; name: string }
  | { ok: false; message: string }
> {
  const dryRaw = serverEnv('RAILWAY_DRY_RUN');
  const dry = dryRaw === '1' || dryRaw === 'true';
  const clean = sanitizeRailwayProjectName(name);
  if (!clean) {
    return { ok: false, message: 'Project name is empty.' };
  }

  if (dry) {
    return { ok: true, id: '(dry-run)', name: clean };
  }

  const workspaceId = serverEnv('RAILWAY_WORKSPACE_ID')?.trim();
  const prefix = serverEnv('RAILWAY_PROJECT_DESCRIPTION_PREFIX')?.trim() || cachedCompanyBrandName();
  const input: Record<string, string> = { name: clean };
  if (prefix) input.description = `${prefix} (via admin agent)`;
  if (workspaceId) input.workspaceId = workspaceId;

  const query = `
    mutation ProjectCreate($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        name
      }
    }
  `;

  const result = await railwayGraphql<{
    projectCreate?: { id: string; name: string } | null;
  }>({ query, variables: { input } });

  if (!result.ok) {
    const msg = result.errors.map((e) => e.message).join('; ') || 'Railway GraphQL error';
    return { ok: false, message: msg };
  }

  const row = result.data.projectCreate;
  if (!row?.id) {
    return { ok: false, message: 'projectCreate returned no id (check workspace / token scope).' };
  }
  return { ok: true, id: row.id, name: row.name };
}

export function isRailwayConfigured(): boolean {
  return Boolean(serverEnv('RAILWAY_API_TOKEN')?.trim());
}

function defaultProjectRef(): string {
  return serverEnv('RAILWAY_PROJECT_ID')?.trim() || `${cachedCompanyBrandName()} App`;
}

type GqlEdge<T> = { node: T };
type GqlConnection<T> = { edges: GqlEdge<T>[] };

type RailwayService = { id: string; name: string; icon?: string | null };
type RailwayEnvironment = { id: string; name: string };

type ServiceDomain = {
  id: string;
  domain: string;
  suffix?: string | null;
  targetPort?: number | null;
};

type CustomDomainDnsRecord = {
  hostlabel?: string | null;
  requiredValue?: string | null;
  currentValue?: string | null;
  status?: string | null;
};

type CustomDomain = {
  id: string;
  domain: string;
  status?: {
    verificationToken?: string | null;
    certificateStatus?: string | null;
    dnsRecords?: CustomDomainDnsRecord[] | null;
  } | null;
};

export type RailwayServiceNetworking = {
  service_id: string;
  service_name: string;
  railway_domains: ServiceDomain[];
  custom_domains: CustomDomain[];
};

export type RailwayProjectNetworking = {
  project_id: string;
  project_name: string;
  environment_id: string;
  environment_name: string;
  services: RailwayServiceNetworking[];
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function railwayListProjectNames(): Promise<
  { ok: true; projects: { id: string; name: string }[] } | { ok: false; error: string }
> {
  const result = await railwayGraphql<{
    projects?: GqlConnection<{ id: string; name: string }>;
  }>({
    query: `query {
      projects {
        edges {
          node { id name }
        }
      }
    }`,
  });
  if (!result.ok) {
    return { ok: false, error: result.errors.map((e) => e.message).join('; ') };
  }
  const projects = (result.data.projects?.edges ?? []).map((e) => e.node);
  return { ok: true, projects };
}

async function railwayResolveProject(projectRef: string): Promise<
  | {
      ok: true;
      project: { id: string; name: string };
      services: RailwayService[];
      environments: RailwayEnvironment[];
    }
  | { ok: false; error: string }
> {
  const ref = projectRef.trim();
  if (!ref) return { ok: false, error: 'project is required' };

  if (isUuid(ref)) {
    const result = await railwayGraphql<{
      project?: {
        id: string;
        name: string;
        services?: GqlConnection<RailwayService>;
        environments?: GqlConnection<RailwayEnvironment>;
      } | null;
    }>({
      query: `query project($id: String!) {
        project(id: $id) {
          id name
          services { edges { node { id name icon } } }
          environments { edges { node { id name } } }
        }
      }`,
      variables: { id: ref },
    });
    if (!result.ok) return { ok: false, error: result.errors.map((e) => e.message).join('; ') };
    const p = result.data.project;
    if (!p) return { ok: false, error: `Project not found: ${ref}` };
    return {
      ok: true,
      project: { id: p.id, name: p.name },
      services: (p.services?.edges ?? []).map((e) => e.node),
      environments: (p.environments?.edges ?? []).map((e) => e.node),
    };
  }

  const listed = await railwayListProjectNames();
  if (!listed.ok) return { ok: false, error: listed.error };
  const needle = ref.toLowerCase();
  const match =
    listed.projects.find((p) => p.name.toLowerCase() === needle) ??
    listed.projects.find((p) => p.name.toLowerCase().includes(needle));
  if (!match) {
    const names = listed.projects.map((p) => p.name).slice(0, 12);
    return {
      ok: false,
      error: `No project matching "${ref}". Available: ${names.join(', ') || '(none)'}`,
    };
  }
  return railwayResolveProject(match.id);
}

async function railwayGetServiceDomains(opts: {
  projectId: string;
  environmentId: string;
  serviceId: string;
}): Promise<
  | { ok: true; serviceDomains: ServiceDomain[]; customDomains: CustomDomain[] }
  | { ok: false; error: string }
> {
  const result = await railwayGraphql<{
    domains?: {
      serviceDomains?: ServiceDomain[] | null;
      customDomains?: CustomDomain[] | null;
    } | null;
  }>({
    query: `query domains($projectId: String!, $environmentId: String!, $serviceId: String!) {
      domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
        serviceDomains { id domain suffix targetPort }
        customDomains {
          id domain
          status {
            verificationToken
            certificateStatus
            dnsRecords { hostlabel requiredValue currentValue status }
          }
        }
      }
    }`,
    variables: opts,
  });
  if (!result.ok) return { ok: false, error: result.errors.map((e) => e.message).join('; ') };
  const d = result.data.domains;
  return {
    ok: true,
    serviceDomains: d?.serviceDomains ?? [],
    customDomains: d?.customDomains ?? [],
  };
}

function pickRailwayEnvironment(
  environments: RailwayEnvironment[],
  preferredName = 'production',
): RailwayEnvironment | null {
  if (!environments.length) return null;
  const needle = preferredName.trim().toLowerCase();
  const exact =
    environments.find((e) => e.name.toLowerCase() === needle) ??
    environments.find((e) => e.name.toLowerCase() === 'prod') ??
    environments.find((e) => e.name.toLowerCase().includes(needle));
  if (exact) return exact;
  if (environments.length === 1) return environments[0]!;
  const nonStaging = environments.find(
    (e) => !isNonProductionLabel(e.name),
  );
  return nonStaging ?? environments[0]!;
}

/** List Railway *.up.railway.app domains + custom domains / CNAME targets for a project. */
export async function railwayListProjectNetworking(opts: {
  project?: string;
  environment?: string;
  service?: string;
} = {}): Promise<{ ok: true; data: RailwayProjectNetworking } | { ok: false; error: string }> {
  if (!isRailwayConfigured()) {
    return { ok: false, error: 'RAILWAY_API_TOKEN is not set on this service' };
  }

  const projectRef = opts.project?.trim() || defaultProjectRef();
  const resolved = await railwayResolveProject(projectRef);
  if (!resolved.ok) return resolved;

  const envName = (opts.environment?.trim() || 'production').toLowerCase();
  const environment = pickRailwayEnvironment(resolved.environments, envName);
  if (!environment) {
    return { ok: false, error: `No environments found for project ${resolved.project.name}` };
  }

  const serviceFilter = opts.service?.trim().toLowerCase();
  const services = serviceFilter
    ? resolved.services.filter((s) => s.name.toLowerCase().includes(serviceFilter))
    : resolved.services;

  if (serviceFilter && !services.length) {
    const names = resolved.services.map((s) => s.name).join(', ') || '(none)';
    return { ok: false, error: `No service matching "${opts.service}". Available: ${names}` };
  }

  const networking: RailwayServiceNetworking[] = [];
  for (const svc of services) {
    if (isNonProductionLabel(svc.name)) continue;
    const domains = await railwayGetServiceDomains({
      projectId: resolved.project.id,
      environmentId: environment.id,
      serviceId: svc.id,
    });
    if (!domains.ok) {
      console.warn('[railway-sync] service domains skipped', {
        project: resolved.project.name,
        service: svc.name,
        error: domains.error,
      });
      continue;
    }
    networking.push({
      service_id: svc.id,
      service_name: svc.name,
      railway_domains: domains.serviceDomains,
      custom_domains: domains.customDomains,
    });
  }

  return {
    ok: true,
    data: {
      project_id: resolved.project.id,
      project_name: resolved.project.name,
      environment_id: environment.id,
      environment_name: environment.name,
      services: networking,
    },
  };
}

/** Connectivity check — lists project names the token can read. */
export async function railwayPing(): Promise<
  { ok: true; project_count: number; projects: { id: string; name: string }[] } | { ok: false; error: string }
> {
  if (!isRailwayConfigured()) {
    return { ok: false, error: 'RAILWAY_API_TOKEN is not set on this service' };
  }
  const listed = await railwayListProjectNames();
  if (!listed.ok) return { ok: false, error: listed.error };
  return { ok: true, project_count: listed.projects.length, projects: listed.projects };
}

/** Compact summary from railwayListProjectNetworking(). */
export function formatRailwayNetworkingSummary(data: RailwayProjectNetworking): string {
  const lines: string[] = [
    `Project: ${data.project_name} (${data.project_id})`,
    `Environment: ${data.environment_name}`,
    '',
  ];

  for (const svc of data.services) {
    lines.push(`▸ ${svc.service_name}`);
    for (const rd of svc.railway_domains) {
      lines.push(`  railway: ${rd.domain}`);
    }
    if (!svc.railway_domains.length) lines.push('  railway: (none)');
    for (const cd of svc.custom_domains) {
      lines.push(`  custom: ${cd.domain}`);
      for (const rec of cd.status?.dnsRecords ?? []) {
        if (rec.requiredValue) {
          lines.push(`    CNAME ${rec.hostlabel ?? cd.domain} → ${rec.requiredValue} (${rec.status ?? '?'})`);
        }
      }
      if (cd.status?.verificationToken) {
        lines.push(`    TXT _railway-verify → ${cd.status.verificationToken}`);
      }
      if (cd.status?.certificateStatus) {
        lines.push(`    cert: ${cd.status.certificateStatus}`);
      }
    }
    if (!svc.custom_domains.length) lines.push('  custom: (none)');
    lines.push('');
  }

  return lines.join('\n').trim();
}

/** Public URLs from Railway production domains across all projects. */
export async function railwayCollectMonitorUrls(): Promise<
  | { ok: true; urls: Array<{ url: string; friendlyName: string }>; warnings: string[] }
  | { ok: false; error: string }
> {
  if (!isRailwayConfigured()) {
    return { ok: false, error: 'RAILWAY_API_TOKEN is not set' };
  }

  const listed = await railwayListProjectNames();
  if (!listed.ok) return { ok: false, error: listed.error };

  const urls: Array<{ url: string; friendlyName: string }> = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const project of listed.projects) {
    const net = await railwayListProjectNetworking({ project: project.id, environment: 'production' });
    if (!net.ok) {
      warnings.push(`${project.name}: ${net.error}`);
      continue;
    }

    for (const svc of net.data.services) {
      const domains = [
        ...svc.custom_domains.map((d) => d.domain),
        ...svc.railway_domains.map((d) => d.domain),
      ];
      for (const domain of domains) {
        const trimmed = domain?.trim();
        if (!trimmed) continue;
        const key = normalizeMonitorHost(trimmed);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        urls.push({
          url: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
          friendlyName: `${project.name} / ${svc.service_name}`,
        });
      }
    }
  }

  console.info('[railway-sync] monitor urls', {
    projects: listed.projects.length,
    urls: urls.length,
    warnings: warnings.length,
  });

  return { ok: true, urls, warnings };
}
