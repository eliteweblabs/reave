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
