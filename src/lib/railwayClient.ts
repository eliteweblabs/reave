/**
 * Minimal Railway public GraphQL client (account / workspace token).
 * @see https://docs.railway.com/integrations/api
 */
import { cachedCompanyBrandName } from './companyConfig';
import { isInternalInfraService, isNonProductionLabel, isPublicWebsiteHost, normalizeMonitorHost } from './publicUrl';
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
  }>({
    query,
    variables: { input },
  });

  if (!result.ok) {
    const msg = result.errors.map((e) => e.message).join('; ');
    return { ok: false, message: msg };
  }

  const created = result.data.projectCreate;
  if (!created) {
    return { ok: false, message: 'projectCreate returned null' };
  }

  return { ok: true, id: created.id, name: created.name };
}

export type RailwayProject = { id: string; name: string };
export type RailwayEnvironment = { id: string; name: string };
export type RailwayService = { id: string; name: string; custom_domains: Array<{ domain?: string }> };

export async function railwayResolveProject(
  projectRef?: string,
): Promise<
  | {
      ok: true;
      project: RailwayProject;
      environments: RailwayEnvironment[];
      services: RailwayService[];
    }
  | { ok: false; errors: RailwayGqlError[] }
> {
  const result = await railwayGraphql<{
    projects?: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          environments: Array<{ id: string; name: string }>;
          services: Array<{
            id: string;
            name: string;
            serviceInstances: Array<{
              customDomains: Array<{ domain?: string }>;
            }>;
          }>;
        };
      }>;
    };
  }>({
    query: `query {
      projects {
        edges {
          node {
            id name
            environments { id name }
            services {
              id name
              serviceInstances { customDomains { domain } }
            }
          }
        }
      }
    }`,
  });

  if (!result.ok) {
    return result;
  }

  const edge = result.data.projects?.edges?.find((e) => {
    const p = e.node;
    if (!p) return false;
    return projectRef ? p.id === projectRef || p.name === projectRef : true;
  });

  if (!edge?.node) {
    return {
      ok: false,
      errors: [
        {
          message: projectRef
            ? `Project not found: ${projectRef}`
            : 'No projects found in Railway account',
        },
      ],
    };
  }

  const p = edge.node;
  const services: RailwayService[] = (p.services ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    custom_domains: (s.serviceInstances ?? []).flatMap((si) => si.customDomains ?? []),
  }));

  return {
    ok: true,
    project: { id: p.id, name: p.name },
    environments: p.environments ?? [],
    services,
  };
}

export function isRailwayConfigured(): boolean {
  return !!serverEnv('RAILWAY_API_TOKEN')?.trim();
}

export function railwayDefaultProjectRef(): string {
  return serverEnv('RAILWAY_PROJECT_ID')?.trim() || 'REΛVE Automation App';
}

export function pickRailwayEnvironment(envs: RailwayEnvironment[], name: string): RailwayEnvironment | undefined {
  if (!envs.length) return undefined;
  const exact = envs.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  return envs[0];
}

export function railwayResolveService(
  services: RailwayService[],
  ref: string,
): { ok: true; service: RailwayService } | { ok: false; errors: RailwayGqlError[] } {
  const exact = services.find((s) => s.id === ref || s.name === ref);
  if (exact) return { ok: true, service: exact };
  const iMatch = services.find((s) => s.id.includes(ref));
  if (iMatch) return { ok: true, service: iMatch };
  const nMatch = services.find((s) => s.name.toLowerCase().includes(ref.toLowerCase()));
  if (nMatch) return { ok: true, service: nMatch };
  return {
    ok: false,
    errors: [
      {
        message: `Service not found: ${ref}\nAvailable: ${services.map((s) => s.name).join(', ')}`,
      },
    ],
  };
}

/**
 * Fetch all Railway projects (possibly paginated) with limited fields.
 * Used by deployments watchdog (monitor page/UptimeRobot sync) to rebuild the
 * project / service / domain map once daily.
 */
export async function railwayListAllProjects(opts: { skip?: number; first?: number } = {}): Promise<
  | {
      ok: true;
      projects: Array<{
        id: string;
        name: string;
        environments: Array<{ id: string; name: string }>;
        services: Array<{
          id: string;
          name: string;
          custom_domains: Array<{ domain?: string }>;
        }>;
      }>;
    }
  | { ok: false; errors: RailwayGqlError[] }
> {
  const skip = Math.max(opts.skip ?? 0, 0);
  const first = Math.min(Math.max(opts.first ?? 50, 1), 100);

  const result = await railwayGraphql<{
    projects?: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          environments: Array<{ id: string; name: string }>;
          services: Array<{
            id: string;
            name: string;
            serviceInstances: Array<{
              customDomains: Array<{ domain?: string }>;
            }>;
          }>;
        };
      }>;
    };
  }>({
    query: `query AllProjects($skip: Int, $first: Int) {
      projects(skip: $skip, first: $first) {
        edges {
          node {
            id name
            environments { id name }
            services {
              id name
              serviceInstances { customDomains { domain } }
            }
          }
        }
      }
    }`,
    variables: { skip, first },
  });

  if (!result.ok) {
    return result;
  }

  const projects = (result.data.projects?.edges ?? []).map((e) => {
    const p = e.node;
    return {
      id: p.id,
      name: p.name,
      environments: p.environments ?? [],
      services: (p.services ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        custom_domains: (s.serviceInstances ?? []).flatMap((si) => si.customDomains ?? []),
      })),
    };
  });

  return { ok: true, projects };
}

/**
 * Fetch Railway monitoring URLs — custom domains on prod services.
 * Used to register external monitors (UptimeRobot, etc.) once, indexed by hostname.
 */
export async function railwayListMonitorUrls(): Promise<
  | {
      ok: true;
      urls: Array<{ url: string; friendlyName: string }>;
      warnings: string[];
    }
  | { ok: false; errors: RailwayGqlError[] }
> {
  const result = await railwayListAllProjects({ first: 100 });
  if (!result.ok) {
    return result;
  }

  const urls: Array<{ url: string; friendlyName: string }> = [];
  const seen = new Set<string>();
  const warnings: string[] = [];

  const listed = result;

  for (const project of listed.projects) {
    for (const net of project.environments) {
      if (isNonProductionLabel(net.name)) {
        // Skip test/review/staging envs unless they define their own hosts
        continue;
      }

      for (const svc of net.services) {
        if (isNonProductionLabel(svc.name)) continue;
        if (isInternalInfraService(svc.name)) continue;

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
            friendlyName: `${project.name} / ${svc.name}`,
          });
        }
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

export async function railwayListDomains(): Promise<
  | {
      ok: true;
      domains: Array<{
        id: string;
        domain: string;
        createdAt?: string;
        expiry?: string;
        registrar?: string;
      }>;
    }
  | { ok: false; errors: RailwayGqlError[] }
> {
  const token = serverEnv('RAILWAY_API_TOKEN')?.trim();
  if (!token) {
    return { ok: false, errors: [{ message: 'RAILWAY_API_TOKEN is not set' }] };
  }

  const query = `query {
    account {
      domains {
        edges {
          node {
            id
            domain
            createdAt
            expiry
            registrar
          }
        }
      }
    }
  }`;

  const result = await railwayGraphql<{
    account?: {
      domains?: {
        edges?: Array<{
          node?: {
            id: string;
            domain: string;
            createdAt?: string;
            expiry?: string;
            registrar?: string;
          };
        }>;
      };
    };
  }>({
    query,
  });

  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }

  const edges = result.data.account?.domains?.edges ?? [];
  const domains = edges
    .map((e) => e.node)
    .filter((n): n is NonNullable<typeof n> => !!n);

  return { ok: true, domains };
}
