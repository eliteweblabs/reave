/**
 * Railway Public API — MCP-parity operations for the in-app agent.
 * @see https://docs.railway.com/integrations/api
 */
import {
  isRailwayConfigured,
  pickRailwayEnvironment,
  railwayDefaultProjectRef,
  railwayGraphql,
  railwayResolveProject,
  railwayResolveService,
  type RailwayEnvironment,
  type RailwayService,
} from './railwayClient';

export type RailwayResolvedScope = {
  project: { id: string; name: string };
  environment: RailwayEnvironment;
  service?: RailwayService;
  services: RailwayService[];
};

export type RailwayDeploymentRow = {
  id: string;
  status: string;
  service_id: string;
  service_name?: string;
  environment_id: string;
  created_at: string;
  url?: string | null;
  meta?: Record<string, unknown> | null;
};

export type RailwayLogEntry = {
  timestamp: string;
  message: string;
  severity?: string | null;
};

export type RailwayServiceConfig = {
  service_id: string;
  service_name: string;
  environment_id: string;
  environment_name: string;
  build_command?: string | null;
  start_command?: string | null;
  root_directory?: string | null;
  healthcheck_path?: string | null;
  num_replicas?: number | null;
  region?: string | null;
  source?: { repo?: string | null; image?: string | null; branch?: string | null } | null;
};

function gqlError(result: { ok: false; errors: { message: string }[] }): string {
  return result.errors.map((e) => e.message).join('; ');
}

function requireRailway(): { ok: true } | { ok: false; error: string } {
  if (!isRailwayConfigured()) {
    return { ok: false, error: 'RAILWAY_API_TOKEN is not set on this service' };
  }
  return { ok: true };
}

export async function railwayResolveScope(opts: {
  project?: string;
  environment?: string;
  service?: string;
  requireService?: boolean;
}): Promise<{ ok: true; data: RailwayResolvedScope } | { ok: false; error: string }> {
  const gate = requireRailway();
  if (!gate.ok) return gate;

  const projectRef = opts.project?.trim() || railwayDefaultProjectRef();
  const resolved = await railwayResolveProject(projectRef);
  if (!resolved.ok) return resolved;

  const envName = (opts.environment?.trim() || 'production').toLowerCase();
  const environment = pickRailwayEnvironment(resolved.environments, envName);
  if (!environment) {
    return { ok: false, error: `No environments found for project ${resolved.project.name}` };
  }

  const serviceRef = opts.service?.trim();
  if (!serviceRef && opts.requireService) {
    return { ok: false, error: 'service is required' };
  }

  let service: RailwayService | undefined;
  if (serviceRef) {
    const svc = railwayResolveService(resolved.services, serviceRef);
    if (!svc.ok) return svc;
    service = svc.service;
  }

  return {
    ok: true,
    data: {
      project: resolved.project,
      environment,
      service,
      services: resolved.services,
    },
  };
}

export async function railwayWhoami(): Promise<
  | { ok: true; user: { id: string; name?: string | null; email: string } }
  | { ok: false; error: string }
> {
  const gate = requireRailway();
  if (!gate.ok) return gate;

  const result = await railwayGraphql<{
    me?: { id: string; name?: string | null; email: string } | null;
  }>({
    query: `query { me { id name email } }`,
  });
  if (!result.ok) return { ok: false, error: gqlError(result) };
  const me = result.data.me;
  if (!me) return { ok: false, error: 'Railway me query returned no user' };
  return { ok: true, user: me };
}

export async function railwayListWorkspaces(): Promise<
  | { ok: true; workspaces: Array<{ id: string; name: string }> }
  | { ok: false; error: string }
> {
  const gate = requireRailway();
  if (!gate.ok) return gate;

  const result = await railwayGraphql<{
    workspaces?: Array<{ id: string; name: string }> | null;
  }>({
    query: `query { workspaces { id name } }`,
  });
  if (!result.ok) return { ok: false, error: gqlError(result) };
  return { ok: true, workspaces: result.data.workspaces ?? [] };
}

export async function railwayListServices(opts: { project?: string } = {}): Promise<
  | {
      ok: true;
      project: { id: string; name: string };
      environments: RailwayEnvironment[];
      services: RailwayService[];
    }
  | { ok: false; error: string }
> {
  const gate = requireRailway();
  if (!gate.ok) return gate;

  const projectRef = opts.project?.trim() || railwayDefaultProjectRef();
  const resolved = await railwayResolveProject(projectRef);
  if (!resolved.ok) return resolved;

  return {
    ok: true,
    project: resolved.project,
    environments: resolved.environments,
    services: resolved.services,
  };
}

export async function railwayListVariables(opts: {
  project?: string;
  environment?: string;
  service?: string;
  names_only?: boolean;
}): Promise<
  | {
      ok: true;
      project_id: string;
      project_name: string;
      environment_id: string;
      environment_name: string;
      service_id?: string;
      service_name?: string;
      variables: Record<string, string>;
      variable_names: string[];
    }
  | { ok: false; error: string }
> {
  const scope = await railwayResolveScope({ ...opts, requireService: false });
  if (!scope.ok) return scope;

  const { project, environment, service } = scope.data;
  const variables: Record<string, unknown> = {};

  const rendered = await railwayGraphql<{ variables?: Record<string, string> | null }>({
    query: `query vars($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    variables: {
      projectId: project.id,
      environmentId: environment.id,
      serviceId: service?.id ?? null,
    },
  });
  if (!rendered.ok) return { ok: false, error: gqlError(rendered) };
  Object.assign(variables, rendered.data.variables ?? {});

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    out[key] = opts.names_only ? '(hidden)' : String(value ?? '');
  }

  return {
    ok: true,
    project_id: project.id,
    project_name: project.name,
    environment_id: environment.id,
    environment_name: environment.name,
    service_id: service?.id,
    service_name: service?.name,
    variables: out,
    variable_names: Object.keys(out).sort(),
  };
}

export async function railwaySetVariables(opts: {
  project?: string;
  environment?: string;
  service?: string;
  variables: Record<string, string>;
  skip_deploys?: boolean;
}): Promise<
  | {
      ok: true;
      project_id: string;
      environment_id: string;
      service_id?: string;
      updated: string[];
      skip_deploys: boolean;
    }
  | { ok: false; error: string }
> {
  const gate = requireRailway();
  if (!gate.ok) return gate;

  const entries = Object.entries(opts.variables ?? {}).filter(([k]) => k.trim());
  if (!entries.length) return { ok: false, error: 'variables object is empty' };

  const scope = await railwayResolveScope({ ...opts, requireService: false });
  if (!scope.ok) return scope;
  const { project, environment, service } = scope.data;

  const updated: string[] = [];

  for (const [name, value] of entries) {
    const result = await railwayGraphql<{ variableUpsert?: boolean | null }>({
      query: `mutation upsert($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }`,
      variables: {
        input: {
          projectId: project.id,
          environmentId: environment.id,
          serviceId: service?.id ?? null,
          name,
          value: String(value),
        },
      },
    });
    if (!result.ok) return { ok: false, error: gqlError(result) };
    updated.push(name);
  }

  return {
    ok: true,
    project_id: project.id,
    environment_id: environment.id,
    service_id: service?.id,
    updated,
    skip_deploys: opts.skip_deploys === true,
  };
}

export async function railwayDeleteVariable(opts: {
  project?: string;
  environment?: string;
  service?: string;
  name: string;
}): Promise<
  | { ok: true; deleted: string; project_id: string; environment_id: string; service_id?: string }
  | { ok: false; error: string }
> {
  const gate = requireRailway();
  if (!gate.ok) return gate;

  const name = opts.name?.trim();
  if (!name) return { ok: false, error: 'name is required' };

  const scope = await railwayResolveScope({ ...opts, requireService: false });
  if (!scope.ok) return scope;
  const { project, environment, service } = scope.data;

  const result = await railwayGraphql<{ variableDelete?: boolean | null }>({
    query: `mutation del($projectId: String!, $environmentId: String!, $serviceId: String, $name: String!) {
      variableDelete(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, name: $name)
    }`,
    variables: {
      projectId: project.id,
      environmentId: environment.id,
      serviceId: service?.id ?? null,
      name,
    },
  });
  if (!result.ok) return { ok: false, error: gqlError(result) };

  return {
    ok: true,
    deleted: name,
    project_id: project.id,
    environment_id: environment.id,
    service_id: service?.id,
  };
}

export async function railwayGetServiceConfig(opts: {
  project?: string;
  environment?: string;
  service: string;
}): Promise<{ ok: true; config: RailwayServiceConfig } | { ok: false; error: string }> {
  const scope = await railwayResolveScope({ ...opts, requireService: true });
  if (!scope.ok) return scope;

  const { environment, service } = scope.data;
  if (!service) return { ok: false, error: 'service is required' };

  const result = await railwayGraphql<{
    serviceInstance?: {
      buildCommand?: string | null;
      startCommand?: string | null;
      rootDirectory?: string | null;
      healthcheckPath?: string | null;
      numReplicas?: number | null;
      region?: string | null;
      source?: { repo?: string | null; image?: string | null; branch?: string | null } | null;
    } | null;
  }>({
    query: `query cfg($serviceId: String!, $environmentId: String!) {
      serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
        buildCommand startCommand rootDirectory healthcheckPath numReplicas region
        source { repo image branch }
      }
    }`,
    variables: { serviceId: service.id, environmentId: environment.id },
  });
  if (!result.ok) return { ok: false, error: gqlError(result) };

  const inst = result.data.serviceInstance;
  if (!inst) return { ok: false, error: `No service instance for ${service.name} in ${environment.name}` };

  return {
    ok: true,
    config: {
      service_id: service.id,
      service_name: service.name,
      environment_id: environment.id,
      environment_name: environment.name,
      build_command: inst.buildCommand,
      start_command: inst.startCommand,
      root_directory: inst.rootDirectory,
      healthcheck_path: inst.healthcheckPath,
      num_replicas: inst.numReplicas,
      region: inst.region,
      source: inst.source,
    },
  };
}

export async function railwayListDeployments(opts: {
  project?: string;
  environment?: string;
  service?: string;
  status?: string;
  limit?: number;
}): Promise<
  | {
      ok: true;
      project_id: string;
      project_name: string;
      deployments: RailwayDeploymentRow[];
    }
  | { ok: false; error: string }
> {
  const scope = await railwayResolveScope({ ...opts, requireService: false });
  if (!scope.ok) return scope;

  const { project, environment, service, services } = scope.data;
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const serviceById = new Map(services.map((s) => [s.id, s.name]));

  const input: Record<string, string> = { projectId: project.id };
  if (environment.id) input.environmentId = environment.id;
  if (service?.id) input.serviceId = service.id;
  if (opts.status?.trim()) input.status = opts.status.trim().toUpperCase();

  const result = await railwayGraphql<{
    deployments?: {
      edges: Array<{
        node: {
          id: string;
          status: string;
          serviceId: string;
          environmentId: string;
          createdAt: string;
          url?: string | null;
          meta?: Record<string, unknown> | null;
        };
      }>;
    } | null;
  }>({
    query: `query deps($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges {
          node {
            id status serviceId environmentId createdAt url meta
          }
        }
      }
    }`,
    variables: { input, first: limit },
  });
  if (!result.ok) return { ok: false, error: gqlError(result) };

  const deployments = (result.data.deployments?.edges ?? []).map(({ node }) => ({
    id: node.id,
    status: node.status,
    service_id: node.serviceId,
    service_name: serviceById.get(node.serviceId),
    environment_id: node.environmentId,
    created_at: node.createdAt,
    url: node.url,
    meta: node.meta ?? null,
  }));

  return {
    ok: true,
    project_id: project.id,
    project_name: project.name,
    deployments,
  };
}

export async function railwayGetProjectStatus(opts: {
  project?: string;
  environment?: string;
}): Promise<
  | {
      ok: true;
      project: { id: string; name: string };
      environment: RailwayEnvironment;
      services: Array<{
        id: string;
        name: string;
        latest_deployment?: {
          id: string;
          status: string;
          created_at: string;
          url?: string | null;
        } | null;
      }>;
    }
  | { ok: false; error: string }
> {
  const scope = await railwayResolveScope({ ...opts, requireService: false });
  if (!scope.ok) return scope;

  const { project, environment, services } = scope.data;
  const out: Array<{
    id: string;
    name: string;
    latest_deployment?: {
      id: string;
      status: string;
      created_at: string;
      url?: string | null;
    } | null;
  }> = [];

  for (const svc of services) {
    const dep = await railwayListDeployments({
      project: project.id,
      environment: environment.name,
      service: svc.id,
      limit: 1,
    });
    out.push({
      id: svc.id,
      name: svc.name,
      latest_deployment: dep.ok ? dep.deployments[0] ?? null : null,
    });
  }

  return {
    ok: true,
    project,
    environment,
    services: out,
  };
}

async function railwayFetchLogs(opts: {
  deploymentId: string;
  type: 'build' | 'deploy' | 'http';
  limit?: number;
  filter?: string;
}): Promise<{ ok: true; logs: RailwayLogEntry[] } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const filterArg = opts.filter?.trim() ? `, filter: $filter` : '';
  const filterVars = opts.filter?.trim() ? { filter: opts.filter.trim() } : {};

  const field =
    opts.type === 'build' ? 'buildLogs' : opts.type === 'http' ? 'httpLogs' : 'deploymentLogs';

  const result = await railwayGraphql<{
    buildLogs?: RailwayLogEntry[];
    deploymentLogs?: RailwayLogEntry[];
    httpLogs?: RailwayLogEntry[];
  }>({
    query: `query logs($deploymentId: String!, $limit: Int${opts.filter?.trim() ? ', $filter: String' : ''}) {
      ${field}(deploymentId: $deploymentId, limit: $limit${filterArg}) {
        timestamp message severity
      }
    }`,
    variables: { deploymentId: opts.deploymentId, limit, ...filterVars },
  });
  if (!result.ok) return { ok: false, error: gqlError(result) };

  const logs = result.data[field] ?? [];
  return { ok: true, logs };
}

export async function railwayGetLogs(opts: {
  project?: string;
  environment?: string;
  service?: string;
  deployment_id?: string;
  types?: Array<'build' | 'deploy' | 'http'>;
  limit?: number;
  filter?: string;
}): Promise<
  | {
      ok: true;
      deployment_id: string;
      streams: Record<string, RailwayLogEntry[]>;
    }
  | { ok: false; error: string }
> {
  const gate = requireRailway();
  if (!gate.ok) return gate;

  let deploymentId = opts.deployment_id?.trim();
  if (!deploymentId) {
    const deps = await railwayListDeployments({
      project: opts.project,
      environment: opts.environment,
      service: opts.service,
      limit: 1,
    });
    if (!deps.ok) return deps;
    deploymentId = deps.deployments[0]?.id;
    if (!deploymentId) {
      return { ok: false, error: 'No deployment found — pass deployment_id or service' };
    }
  }

  const types = opts.types?.length ? opts.types : (['deploy'] as const);
  const streams: Record<string, RailwayLogEntry[]> = {};

  for (const type of types) {
    const logs = await railwayFetchLogs({
      deploymentId,
      type,
      limit: opts.limit,
      filter: opts.filter,
    });
    if (!logs.ok) return logs;
    streams[type] = logs.logs;
  }

  return { ok: true, deployment_id: deploymentId, streams };
}

export async function railwayRedeployService(opts: {
  project?: string;
  environment?: string;
  service: string;
}): Promise<
  | { ok: true; service_id: string; service_name: string; environment_id: string }
  | { ok: false; error: string }
> {
  const scope = await railwayResolveScope({ ...opts, requireService: true });
  if (!scope.ok) return scope;

  const { environment, service } = scope.data;
  if (!service) return { ok: false, error: 'service is required' };

  const result = await railwayGraphql<{ serviceInstanceRedeploy?: boolean | null }>({
    query: `mutation redeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    variables: { serviceId: service.id, environmentId: environment.id },
  });
  if (!result.ok) return { ok: false, error: gqlError(result) };

  return {
    ok: true,
    service_id: service.id,
    service_name: service.name,
    environment_id: environment.id,
  };
}

export async function railwayUpdateService(opts: {
  project?: string;
  environment?: string;
  service: string;
  build_command?: string;
  start_command?: string;
  root_directory?: string;
  healthcheck_path?: string;
}): Promise<{ ok: true; service_id: string; updated: string[] } | { ok: false; error: string }> {
  const scope = await railwayResolveScope({ ...opts, requireService: true });
  if (!scope.ok) return scope;

  const { environment, service } = scope.data;
  if (!service) return { ok: false, error: 'service is required' };

  const input: Record<string, string> = {};
  const updated: string[] = [];
  if (opts.build_command !== undefined) {
    input.buildCommand = opts.build_command;
    updated.push('build_command');
  }
  if (opts.start_command !== undefined) {
    input.startCommand = opts.start_command;
    updated.push('start_command');
  }
  if (opts.root_directory !== undefined) {
    input.rootDirectory = opts.root_directory;
    updated.push('root_directory');
  }
  if (opts.healthcheck_path !== undefined) {
    input.healthcheckPath = opts.healthcheck_path;
    updated.push('healthcheck_path');
  }
  if (!updated.length) return { ok: false, error: 'No fields to update' };

  const result = await railwayGraphql<{ serviceInstanceUpdate?: boolean | null }>({
    query: `mutation update($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }`,
    variables: { serviceId: service.id, environmentId: environment.id, input },
  });
  if (!result.ok) return { ok: false, error: gqlError(result) };

  return { ok: true, service_id: service.id, updated };
}

/** Simple docs search — fetches Railway docs index pages matching a query. */
export async function railwaySearchDocs(query: string): Promise<
  | { ok: true; query: string; results: Array<{ title: string; url: string; snippet: string }> }
  | { ok: false; error: string }
> {
  const q = query.trim();
  if (!q) return { ok: false, error: 'query is required' };

  const seeds = [
    'https://docs.railway.com/guides/variables',
    'https://docs.railway.com/guides/deployments',
    'https://docs.railway.com/reference/public-api',
    'https://docs.railway.com/guides/services',
    'https://docs.railway.com/guides/environments',
    'https://docs.railway.com/guides/domains',
  ];

  const needle = q.toLowerCase();
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  for (const url of seeds) {
    try {
      const res = await fetch(url, { headers: { Accept: 'text/html' } });
      if (!res.ok) continue;
      const html = await res.text();
      if (!html.toLowerCase().includes(needle)) continue;
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch?.[1]?.trim() || url;
      const idx = html.toLowerCase().indexOf(needle);
      const snippet = html.slice(Math.max(0, idx - 80), idx + 120).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      results.push({ title, url, snippet: snippet.slice(0, 240) });
    } catch {
      // skip unreachable doc pages
    }
  }

  return { ok: true, query: q, results };
}

export function formatRailwayVariablesSummary(data: {
  project_name: string;
  environment_name: string;
  service_name?: string;
  variable_names: string[];
}): string {
  const lines = [
    `Project: ${data.project_name}`,
    `Environment: ${data.environment_name}`,
    data.service_name ? `Service: ${data.service_name}` : 'Scope: shared environment variables',
    `Count: ${data.variable_names.length}`,
    '',
    ...data.variable_names.map((n) => `- ${n}`),
  ];
  return lines.join('\n').trim();
}

export function formatRailwayStatusSummary(data: {
  project: { name: string };
  environment: { name: string };
  services: Array<{
    name: string;
    latest_deployment?: { status: string; created_at: string } | null;
  }>;
}): string {
  const lines = [
    `Project: ${data.project.name}`,
    `Environment: ${data.environment.name}`,
    '',
  ];
  for (const svc of data.services) {
    const dep = svc.latest_deployment;
    lines.push(
      dep
        ? `▸ ${svc.name}: ${dep.status} (${dep.created_at})`
        : `▸ ${svc.name}: (no deployments)`,
    );
  }
  return lines.join('\n').trim();
}

export function formatRailwayLogsSummary(streams: Record<string, RailwayLogEntry[]>, limit = 40): string {
  const lines: string[] = [];
  for (const [type, entries] of Object.entries(streams)) {
    lines.push(`=== ${type} logs ===`);
    const slice = entries.slice(-limit);
    if (!slice.length) lines.push('(empty)');
    for (const row of slice) {
      const tsRaw = row.timestamp != null ? String(row.timestamp) : '';
      const ts = tsRaw.length >= 19 ? tsRaw.slice(11, 19) : tsRaw || '??:??:??';
      lines.push(`${ts} ${row.severity ?? 'INFO'} ${row.message}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}
