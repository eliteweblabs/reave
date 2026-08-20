/**
 * Minimal Railway public GraphQL client (account / workspace token).
 * @see https://docs.railway.com/integrations/api
 */
import { cachedCompanyBrandName } from './companyConfig';
import { isInternalInfraService, isNonProductionLabel, isPublicWebsiteHost, normalizeMonitorHost } from './publicUrl';
import { isActiveRailwayProject, type RailwayProjectListNode } from './railwayProjectList';
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
export async function createRailwayEmptyProject(
  name: string,
  opts?: { description?: string },
): Promise<
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
  const description = opts?.description?.trim() || (prefix ? `${prefix} (via admin agent)` : '');
  if (description) input.description = description;
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

export function railwayDefaultProjectRef(): string {
  return serverEnv('RAILWAY_PROJECT_ID')?.trim() || `${cachedCompanyBrandName()} App`;
}

type GqlEdge<T> = { node: T };
type GqlConnection<T> = { edges: GqlEdge<T>[] };

export type RailwayService = { id: string; name: string; icon?: string | null };
export type RailwayEnvironment = { id: string; name: string };

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

export type RailwayCustomDomain = {
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
  custom_domains: RailwayCustomDomain[];
};

export type RailwayProjectNetworking = {
  project_id: string;
  project_name: string;
  environment_id: string;
  environment_name: string;
  services: RailwayServiceNetworking[];
};

export function isRailwayUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isUuid(value: string): boolean {
  return isRailwayUuid(value);
}

function railwayGqlError(result: { errors: RailwayGqlError[] }): string {
  return result.errors.map((e) => e.message).join('; ') || 'Railway GraphQL error';
}

export const RAILWAY_POSTGRES_IMAGE = 'ghcr.io/railwayapp-templates/postgres-ssl:16';
export const RAILWAY_POSTGRES_VOLUME = '/var/lib/postgresql/data';

export async function railwayCreateService(opts: {
  projectId: string;
  name: string;
  repo?: string;
  image?: string;
  branch?: string;
}): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const name = opts.name.trim();
  if (!name) return { ok: false, error: 'service name is required' };

  const source: Record<string, string> = {};
  if (opts.repo?.trim()) source.repo = opts.repo.trim();
  if (opts.image?.trim()) source.image = opts.image.trim();

  const input: Record<string, unknown> = {
    projectId: opts.projectId,
    name,
  };
  if (Object.keys(source).length) input.source = source;
  if (opts.branch?.trim() && source.repo) input.branch = opts.branch.trim();

  const result = await railwayGraphql<{ serviceCreate?: { id: string; name: string } | null }>({
    query: `mutation serviceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) { id name }
    }`,
    variables: { input },
  });
  if (!result.ok) return { ok: false, error: railwayGqlError(result) };
  const row = result.data.serviceCreate;
  if (!row?.id) return { ok: false, error: `serviceCreate returned no id for ${name}` };
  return { ok: true, id: row.id, name: row.name };
}

export async function railwayConnectServiceSource(opts: {
  serviceId: string;
  repo?: string;
  image?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const input: Record<string, string> = {};
  if (opts.repo?.trim()) input.repo = opts.repo.trim();
  if (opts.image?.trim()) input.image = opts.image.trim();
  if (!Object.keys(input).length) return { ok: false, error: 'repo or image is required' };

  const result = await railwayGraphql<{ serviceConnect?: { id: string } | null }>({
    query: `mutation serviceConnect($id: String!, $input: ServiceSourceInput!) {
      serviceConnect(id: $id, input: $input) { id }
    }`,
    variables: { id: opts.serviceId, input },
  });
  if (!result.ok) return { ok: false, error: railwayGqlError(result) };
  return { ok: true };
}

export async function railwayCreateVolume(opts: {
  projectId: string;
  environmentId: string;
  serviceId: string;
  mountPath: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const result = await railwayGraphql<{ volumeCreate?: { id: string } | null }>({
    query: `mutation volumeCreate($input: VolumeCreateInput!) {
      volumeCreate(input: $input) { id }
    }`,
    variables: {
      input: {
        projectId: opts.projectId,
        environmentId: opts.environmentId,
        serviceId: opts.serviceId,
        mountPath: opts.mountPath,
      },
    },
  });
  if (!result.ok) return { ok: false, error: railwayGqlError(result) };
  const id = result.data.volumeCreate?.id;
  if (!id) return { ok: false, error: 'volumeCreate returned no id' };
  return { ok: true, id };
}

export async function railwayServiceInstanceSource(opts: {
  serviceId: string;
  environmentId: string;
}): Promise<
  | { ok: true; repo?: string | null; image?: string | null }
  | { ok: false; error: string }
> {
  const result = await railwayGraphql<{
    serviceInstance?: { source?: { repo?: string | null; image?: string | null } | null } | null;
  }>({
    query: `query instance($serviceId: String!, $environmentId: String!) {
      serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
        source { repo image }
      }
    }`,
    variables: { serviceId: opts.serviceId, environmentId: opts.environmentId },
  });
  if (!result.ok) return { ok: false, error: railwayGqlError(result) };
  const source = result.data.serviceInstance?.source;
  return { ok: true, repo: source?.repo ?? null, image: source?.image ?? null };
}

export async function railwayEnsurePublicDomain(opts: {
  projectId: string;
  environmentId: string;
  serviceId: string;
}): Promise<{ ok: true; domain?: string; created: boolean } | { ok: false; error: string }> {
  const existing = await railwayGetServiceDomains(opts);
  if (!existing.ok) return existing;
  const already = existing.serviceDomains[0]?.domain;
  if (already) return { ok: true, domain: already, created: false };

  const created = await railwayGraphql<{
    serviceDomainCreate?: { id: string; domain?: string | null } | null;
  }>({
    query: `mutation serviceDomainCreate($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) { id domain }
    }`,
    variables: {
      input: {
        serviceId: opts.serviceId,
        environmentId: opts.environmentId,
      },
    },
  });
  if (!created.ok) return { ok: false, error: railwayGqlError(created) };
  return { ok: true, domain: created.data.serviceDomainCreate?.domain ?? undefined, created: true };
}

type RailwayProjectsPage = {
  projects?: {
    edges: GqlEdge<RailwayProjectListNode>[];
    pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
  };
};

export async function railwayListProjects(): Promise<
  { ok: true; projects: { id: string; name: string }[] } | { ok: false; error: string }
> {
  const workspaceId = serverEnv('RAILWAY_WORKSPACE_ID')?.trim();
  const projects: { id: string; name: string }[] = [];
  let after: string | undefined;

  for (let page = 0; page < 20; page++) {
    const result = await railwayGraphql<RailwayProjectsPage>({
      query: workspaceId
        ? `query($after: String, $workspaceId: String) {
            projects(first: 100, after: $after, includeDeleted: false, workspaceId: $workspaceId) {
              edges { node { id name deletedAt expiredAt isTempProject } }
              pageInfo { hasNextPage endCursor }
            }
          }`
        : `query($after: String) {
            projects(first: 100, after: $after, includeDeleted: false) {
              edges { node { id name deletedAt expiredAt isTempProject } }
              pageInfo { hasNextPage endCursor }
            }
          }`,
      variables: workspaceId ? { after, workspaceId } : { after },
    });
    if (!result.ok) {
      return { ok: false, error: result.errors.map((e) => e.message).join('; ') };
    }

    for (const edge of result.data.projects?.edges ?? []) {
      if (!isActiveRailwayProject(edge.node)) continue;
      projects.push({ id: edge.node.id, name: edge.node.name });
    }

    const pageInfo = result.data.projects?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  projects.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { ok: true, projects };
}

export async function railwayResolveProject(projectRef: string): Promise<
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
        deletedAt?: string | null;
        services?: GqlConnection<RailwayService>;
        environments?: GqlConnection<RailwayEnvironment>;
      } | null;
    }>({
      query: `query project($id: String!) {
        project(id: $id) {
          id name deletedAt
          services { edges { node { id name icon } } }
          environments { edges { node { id name } } }
        }
      }`,
      variables: { id: ref },
    });
    if (!result.ok) return { ok: false, error: result.errors.map((e) => e.message).join('; ') };
    const p = result.data.project;
    if (!p || p.deletedAt) return { ok: false, error: `Project not found: ${ref}` };
    return {
      ok: true,
      project: { id: p.id, name: p.name },
      services: (p.services?.edges ?? []).map((e) => e.node),
      environments: (p.environments?.edges ?? []).map((e) => e.node),
    };
  }

  const listed = await railwayListProjects();
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

/** Resolve a service by UUID or name within a project. */
export function railwayResolveService(
  services: RailwayService[],
  serviceRef?: string,
): { ok: true; service: RailwayService } | { ok: false; error: string } {
  const ref = serviceRef?.trim();
  if (!ref) {
    if (services.length === 1) return { ok: true, service: services[0]! };
    const names = services.map((s) => s.name).join(', ') || '(none)';
    return { ok: false, error: `service is required — project has: ${names}` };
  }
  if (isUuid(ref)) {
    const match = services.find((s) => s.id === ref);
    if (!match) return { ok: false, error: `Service not found: ${ref}` };
    return { ok: true, service: match };
  }
  const needle = ref.toLowerCase();
  const match =
    services.find((s) => s.name.toLowerCase() === needle) ??
    services.find((s) => s.name.toLowerCase().includes(needle));
  if (!match) {
    const names = services.map((s) => s.name).join(', ') || '(none)';
    return { ok: false, error: `No service matching "${ref}". Available: ${names}` };
  }
  return { ok: true, service: match };
}

async function railwayGetServiceDomains(opts: {
  projectId: string;
  environmentId: string;
  serviceId: string;
}): Promise<
  | { ok: true; serviceDomains: ServiceDomain[]; customDomains: RailwayCustomDomain[] }
  | { ok: false; error: string }
> {
  const result = await railwayGraphql<{
    domains?: {
      serviceDomains?: ServiceDomain[] | null;
      customDomains?: RailwayCustomDomain[] | null;
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

function findCustomDomain(
  domains: RailwayCustomDomain[],
  fqdn: string,
): RailwayCustomDomain | undefined {
  const needle = fqdn.trim().toLowerCase();
  return domains.find((d) => d.domain.trim().toLowerCase() === needle);
}

/** Attach a custom hostname on a Railway service, or return it if it already exists. */
export async function railwayEnsureCustomDomain(opts: {
  projectId: string;
  environmentId: string;
  serviceId: string;
  domain: string;
}): Promise<
  | { ok: true; domain: RailwayCustomDomain; created: boolean }
  | { ok: false; error: string }
> {
  const fqdn = opts.domain.trim().toLowerCase().replace(/\.$/, '');
  if (!fqdn) return { ok: false, error: 'domain is required' };

  const existing = await railwayGetServiceDomains({
    projectId: opts.projectId,
    environmentId: opts.environmentId,
    serviceId: opts.serviceId,
  });
  if (!existing.ok) return existing;
  const already = findCustomDomain(existing.customDomains, fqdn);
  if (already) return { ok: true, domain: already, created: false };

  const created = await railwayGraphql<{
    customDomainCreate?: RailwayCustomDomain | null;
  }>({
    query: `mutation customDomainCreate($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id
        domain
        status {
          verificationToken
          certificateStatus
          dnsRecords { hostlabel requiredValue currentValue status }
        }
      }
    }`,
    variables: {
      input: {
        projectId: opts.projectId,
        environmentId: opts.environmentId,
        serviceId: opts.serviceId,
        domain: fqdn,
      },
    },
  });

  if (created.ok && created.data.customDomainCreate) {
    return { ok: true, domain: created.data.customDomainCreate, created: true };
  }

  const listed = await railwayGetServiceDomains({
    projectId: opts.projectId,
    environmentId: opts.environmentId,
    serviceId: opts.serviceId,
  });
  if (listed.ok) {
    const retry = findCustomDomain(listed.customDomains, fqdn);
    if (retry) return { ok: true, domain: retry, created: false };
  }

  const err =
    (!created.ok ? created.errors.map((e) => e.message).join('; ') : null) ||
    (!listed.ok ? listed.error : null) ||
    `Could not attach ${fqdn} on Railway`;
  return { ok: false, error: err };
}

export function pickRailwayEnvironment(
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

  const projectRef = opts.project?.trim() || railwayDefaultProjectRef();
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
  const listed = await railwayListProjects();
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

  const listed = await railwayListProjects();
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
      if (isNonProductionLabel(svc.service_name)) continue;
      if (isInternalInfraService(svc.service_name)) continue;

      // Public websites only — custom domains on user-facing services (not *.up.railway.app).
      const customDomains = svc.custom_domains.map((d) => d.domain).filter(Boolean);
      if (!customDomains.length) continue;

      for (const domain of customDomains) {
        const trimmed = domain?.trim();
        if (!trimmed || !isPublicWebsiteHost(trimmed)) continue;
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
