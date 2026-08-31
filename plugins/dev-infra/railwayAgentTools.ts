/**
 * Railway agent tools — MCP-parity for the in-app admin agent (dev_infra).
 */
import { cachedCompanyBrandName } from '../../src/lib/companyConfig';
import { createRailwayEmptyProject, formatRailwayNetworkingSummary, isRailwayConfigured, railwayEnsureCustomDomain, railwayListProjectNetworking, railwayListProjects, railwayResolveProject, railwayResolveService, pickRailwayEnvironment } from '../../src/lib/railwayClient';
import {
  formatRailwayLogsSummary,
  formatRailwayStatusSummary,
  formatRailwayVariablesSummary,
  railwayDeleteVariable,
  railwayGetLogs,
  railwayGetProjectStatus,
  railwayGetServiceConfig,
  railwayListDeployments,
  railwayListServices,
  railwayListVariables,
  railwayListWorkspaces,
  railwayRedeployService,
  railwaySearchDocs,
  railwaySetVariables,
  railwayUpdateService,
  railwayWhoami,
} from '../../src/lib/railwayAgentApi';
import type { AgentToolDef, ToolContext, ToolHandler } from '../../src/lib/agentTools/types';
import { getAgentContext } from '../../src/lib/agentContext';
import {
  DEPLOY_FAILURE_MAX_RAILWAY_VAR_REDEPLOYS,
  isDockerImageRailwayService,
} from '../../src/lib/agentSituationalContext';

function railwayGate(): string | null {
  if (!isRailwayConfigured()) {
    return JSON.stringify({ error: 'RAILWAY_API_TOKEN is not set on this service' });
  }
  return null;
}

function strArg(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function parseVariablesArg(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return Object.keys(out).length ? out : null;
}

/** Block redeploy loops during auto-repair on docker-image Railway services. */
function repairDockerRedeployBlocked(service: string | undefined): string | null {
  const ctx = getAgentContext();
  if (!ctx.repairRun) return null;
  const svc = service || ctx.repairDeployService;
  if (!isDockerImageRailwayService(svc)) return null;
  const store = ctx as ReturnType<typeof getAgentContext> & { _repairRailwayVarSets?: number };
  store._repairRailwayVarSets = (store._repairRailwayVarSets ?? 0) + 1;
  if (store._repairRailwayVarSets > DEPLOY_FAILURE_MAX_RAILWAY_VAR_REDEPLOYS) {
    return JSON.stringify({
      error: `Repair guardrail: already triggered ${DEPLOY_FAILURE_MAX_RAILWAY_VAR_REDEPLOYS} redeploys on docker-image service "${svc ?? '?'}" in this Session. Mark 🚨 UNRESOLVED — pin the image digest or fix env in Railway manually.`,
    });
  }
  return null;
}

async function handle_list_railway_projects(_args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const result = await railwayListProjects();
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, count: result.projects.length, projects: result.projects });
}

async function handle_railway_whoami(_args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const result = await railwayWhoami();
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, user: result.user });
}

async function handle_list_railway_workspaces(_args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const result = await railwayListWorkspaces();
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, workspaces: result.workspaces });
}

async function handle_list_railway_services(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const result = await railwayListServices({ project: strArg(args, 'project') });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    project: result.project,
    environments: result.environments,
    services: result.services,
  });
}

async function handle_list_railway_domains(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const result = await railwayListProjectNetworking({
    project: strArg(args, 'project'),
    environment: strArg(args, 'environment'),
    service: strArg(args, 'service'),
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    summary: formatRailwayNetworkingSummary(result.data),
    data: result.data,
  });
}

async function handle_add_railway_domain(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;

  const domain = strArg(args, 'domain');
  if (!domain) return JSON.stringify({ error: 'domain is required' });
  const service = strArg(args, 'service');
  if (!service) return JSON.stringify({ error: 'service is required' });

  const projectRef = strArg(args, 'project');
  const envName = (strArg(args, 'environment') || 'production').toLowerCase();

  const resolved = await railwayResolveProject(projectRef ?? '');
  if (!resolved.ok) return JSON.stringify({ error: resolved.error });

  const environment = pickRailwayEnvironment(resolved.environments, envName);
  if (!environment) return JSON.stringify({ error: `Environment "${envName}" not found in project ${resolved.project.name}` });

  const svcResult = railwayResolveService(resolved.services, service);
  if (!svcResult.ok) return JSON.stringify({ error: svcResult.error });

  const result = await railwayEnsureCustomDomain({
    projectId: resolved.project.id,
    environmentId: environment.id,
    serviceId: svcResult.service.id,
    domain,
  });

  if (!result.ok) return JSON.stringify({ error: result.error });

  const d = result.domain;
  const dnsRecords = d.status?.dnsRecords ?? [];
  const verificationToken = d.status?.verificationToken ?? null;

  return JSON.stringify({
    ok: true,
    created: result.created,
    domain: d.domain,
    id: d.id,
    certificateStatus: d.status?.certificateStatus ?? null,
    verificationToken,
    dnsRecords,
    hint: result.created
      ? `Domain "${d.domain}" added to Railway. Set a CNAME DNS record pointing to ${dnsRecords[0]?.requiredValue ?? '<railway-cname>'} (DNS-only, no proxy) and a TXT record _railway-verify with value ${verificationToken ?? '<token>'}.`
      : `Domain "${d.domain}" was already registered on this service.`,
  });
}

async function handle_list_railway_variables(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const result = await railwayListVariables({
    project: strArg(args, 'project'),
    environment: strArg(args, 'environment'),
    service: strArg(args, 'service'),
    names_only: args.names_only === true,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ...result,
    summary: formatRailwayVariablesSummary(result),
    hint: 'Values may contain secrets — do not paste full values in chat unless the owner explicitly asks.',
  });
}

async function handle_set_railway_variables(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const variables = parseVariablesArg(args.variables);
  if (!variables) return JSON.stringify({ error: 'variables object is required, e.g. {"NODE_ENV":"production"}' });
  if (args.skip_deploys !== true) {
    const repairBlock = repairDockerRedeployBlocked(strArg(args, 'service'));
    if (repairBlock) return repairBlock;
  }
  const result = await railwaySetVariables({
    project: strArg(args, 'project'),
    environment: strArg(args, 'environment'),
    service: strArg(args, 'service'),
    variables,
    skip_deploys: args.skip_deploys === true,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ...result,
    hint: result.skip_deploys
      ? 'Variables saved without redeploy — call redeploy_railway_service when ready.'
      : 'Variables saved — affected service(s) will redeploy.',
  });
}

async function handle_delete_railway_variable(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const name = strArg(args, 'name');
  if (!name) return JSON.stringify({ error: 'name is required' });
  const result = await railwayDeleteVariable({
    project: strArg(args, 'project'),
    environment: strArg(args, 'environment'),
    service: strArg(args, 'service'),
    name,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result);
}

async function handle_get_railway_service_config(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const service = strArg(args, 'service');
  if (!service) return JSON.stringify({ error: 'service is required' });
  const result = await railwayGetServiceConfig({
    project: strArg(args, 'project'),
    environment: strArg(args, 'environment'),
    service,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, config: result.config });
}

async function handle_get_railway_status(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const result = await railwayGetProjectStatus({
    project: strArg(args, 'project'),
    environment: strArg(args, 'environment'),
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ...result,
    summary: formatRailwayStatusSummary(result),
  });
}

async function handle_list_railway_deployments(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const result = await railwayListDeployments({
    project: strArg(args, 'project'),
    environment: strArg(args, 'environment'),
    service: strArg(args, 'service'),
    status: strArg(args, 'status'),
    limit: typeof args.limit === 'number' ? args.limit : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result);
}

async function handle_get_railway_logs(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const typesRaw = args.types;
  const types = Array.isArray(typesRaw)
    ? typesRaw.filter((t): t is 'build' | 'deploy' | 'http' => t === 'build' || t === 'deploy' || t === 'http')
    : undefined;
  const result = await railwayGetLogs({
    project: strArg(args, 'project'),
    environment: strArg(args, 'environment'),
    service: strArg(args, 'service'),
    deployment_id: strArg(args, 'deployment_id'),
    types,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
    filter: strArg(args, 'filter'),
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    deployment_id: result.deployment_id,
    summary: formatRailwayLogsSummary(result.streams),
    streams: result.streams,
  });
}

async function handle_redeploy_railway_service(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const service = strArg(args, 'service');
  if (!service) return JSON.stringify({ error: 'service is required' });
  if (args.confirmed !== true) {
    return JSON.stringify({
      blocked: true,
      reason: 'confirmation_required',
      service,
      warning: `Redeploy Railway service "${service}"? This triggers a new deployment.`,
      hint: 'Re-call redeploy_railway_service with the same service and confirmed:true after the owner approves.',
    });
  }
  const repairBlock = repairDockerRedeployBlocked(service);
  if (repairBlock) return repairBlock;
  const result = await railwayRedeployService({
    project: strArg(args, 'project'),
    environment: strArg(args, 'environment'),
    service,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result);
}

async function handle_update_railway_service(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const service = strArg(args, 'service');
  if (!service) return JSON.stringify({ error: 'service is required' });
  const result = await railwayUpdateService({
    project: strArg(args, 'project'),
    environment: strArg(args, 'environment'),
    service,
    build_command: strArg(args, 'build_command'),
    start_command: strArg(args, 'start_command'),
    root_directory: strArg(args, 'root_directory'),
    healthcheck_path: strArg(args, 'healthcheck_path'),
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ...result,
    hint: 'Config saved — call redeploy_railway_service to apply on a running service.',
  });
}

async function handle_create_railway_project(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const blocked = railwayGate();
  if (blocked) return blocked;
  const name = strArg(args, 'name');
  if (!name) return JSON.stringify({ error: 'name is required' });
  const result = await createRailwayEmptyProject(name);
  if (!result.ok) return JSON.stringify({ error: result.message });
  return JSON.stringify({ ok: true, id: result.id, name: result.name });
}

async function handle_search_railway_docs(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const query = strArg(args, 'query');
  if (!query) return JSON.stringify({ error: 'query is required' });
  const result = await railwaySearchDocs(query);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result);
}

export function railwayAgentToolDefinitions(ctx: ToolContext): AgentToolDef[] {
  const brand = ctx.brand;
  const projectDefault = brand.projectLabel || cachedCompanyBrandName();

  return [
    {
      type: 'function',
      function: {
        name: 'list_railway_projects',
        description: 'List live Railway projects the token can access (excludes deleted/temp). Requires RAILWAY_API_TOKEN.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'railway_whoami',
        description: 'Get the authenticated Railway account (id, name, email). Requires RAILWAY_API_TOKEN.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_railway_workspaces',
        description: 'List Railway workspaces for project creation. Requires RAILWAY_API_TOKEN.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_railway_services',
        description: `List services and environments in a Railway project. Defaults to "${projectDefault}". Requires RAILWAY_API_TOKEN.`,
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Project name or UUID' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_railway_domains',
        description:
          `Read Railway networking: *.up.railway.app domains, custom domains, CNAME targets, verification TXT. Defaults to "${projectDefault}" / production. Requires RAILWAY_API_TOKEN.`,
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Project name or UUID' },
            environment: { type: 'string', description: 'Environment name (default: production)' },
            service: { type: 'string', description: 'Optional service name filter, e.g. "reave"' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_railway_domain',
        description:
          'Add a custom domain to a Railway service in a specific project and environment. Creates the domain if it does not already exist and returns the CNAME target and _railway-verify TXT token needed for DNS. Requires RAILWAY_API_TOKEN.',
        parameters: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: 'Custom hostname to add, e.g. capcofire.com or www.capcofire.com' },
            project: { type: 'string', description: 'Project name or UUID' },
            environment: { type: 'string', description: 'Environment name (default: production)' },
            service: { type: 'string', description: 'Service name or UUID' },
          },
          required: ['domain', 'service'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_railway_variables',
        description:
          'Read Railway environment variables (rendered values; reference vars like ${{Postgres.DATABASE_URL}} are resolved). Omit service for shared environment variables. Use names_only:true to list keys without values. Never paste secret values in chat unless the owner asks. Requires RAILWAY_API_TOKEN.',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Project name or UUID' },
            environment: { type: 'string', description: 'Environment name (default: production)' },
            service: { type: 'string', description: 'Service name or UUID; omit for shared vars' },
            names_only: { type: 'boolean', description: 'Return variable names only (default false)' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'set_railway_variables',
        description:
          'Set one or more Railway environment variables. Overwrites existing keys; others unchanged. Reference syntax ${{Service.VAR}} supported. Triggers redeploy unless skip_deploys:true. Requires RAILWAY_API_TOKEN.',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            environment: { type: 'string' },
            service: { type: 'string', description: 'Omit for shared environment variables' },
            variables: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Key/value pairs, e.g. {"NODE_ENV":"production"}',
            },
            skip_deploys: { type: 'boolean', description: 'Save without triggering redeploy (default false)' },
          },
          required: ['variables'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_railway_variable',
        description: 'Delete a Railway environment variable by name. Requires RAILWAY_API_TOKEN.',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            environment: { type: 'string' },
            service: { type: 'string' },
            name: { type: 'string', description: 'Variable name to delete' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_railway_service_config',
        description:
          'Read a service build/deploy config (start command, healthcheck, repo/image source, replicas). Requires RAILWAY_API_TOKEN.',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            environment: { type: 'string' },
            service: { type: 'string', description: 'Service name or UUID' },
          },
          required: ['service'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_railway_status',
        description:
          `Deployment status for every service in a project environment (latest deployment status per service). Defaults to "${projectDefault}" / production. Requires RAILWAY_API_TOKEN.`,
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            environment: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_railway_deployments',
        description:
          'List recent Railway deployments, optionally filtered by service or status (SUCCESS, FAILED, CRASHED, BUILDING, etc.). Requires RAILWAY_API_TOKEN.',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            environment: { type: 'string' },
            service: { type: 'string' },
            status: { type: 'string', description: 'Filter by deployment status' },
            limit: { type: 'integer', description: 'Max results (1-50, default 10)' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_railway_logs',
        description:
          'Fetch Railway build, runtime (deploy), or HTTP logs for a deployment. Pass deployment_id or service (uses latest deployment). Requires RAILWAY_API_TOKEN.',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            environment: { type: 'string' },
            service: { type: 'string', description: 'Service name — used when deployment_id omitted' },
            deployment_id: { type: 'string' },
            types: {
              type: 'array',
              items: { type: 'string', enum: ['build', 'deploy', 'http'] },
              description: 'Log streams (default: ["deploy"])',
            },
            limit: { type: 'integer', description: 'Max lines per stream (1-500, default 100)' },
            filter: { type: 'string', description: 'Loki-style filter expression' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'redeploy_railway_service',
        description:
          'Trigger a Railway service redeploy. Destructive — requires confirmed:true after owner approval. Requires RAILWAY_API_TOKEN.',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            environment: { type: 'string' },
            service: { type: 'string', description: 'Service name or UUID' },
            confirmed: { type: 'boolean', description: 'Must be true after explicit owner confirmation' },
          },
          required: ['service'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_railway_service',
        description:
          'Update Railway service build/deploy settings (start command, healthcheck path, root directory). Applies on next deploy — call redeploy_railway_service to apply immediately. Requires RAILWAY_API_TOKEN.',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            environment: { type: 'string' },
            service: { type: 'string' },
            build_command: { type: 'string' },
            start_command: { type: 'string' },
            root_directory: { type: 'string' },
            healthcheck_path: { type: 'string' },
          },
          required: ['service'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_railway_project',
        description: 'Create an empty Railway project. Requires RAILWAY_API_TOKEN; optional RAILWAY_WORKSPACE_ID.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Project display name' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_railway_docs',
        description: 'Search Railway documentation (docs.railway.com) for guides and API reference.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search terms, e.g. "environment variables"' },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
  ];
}

export const railwayAgentToolHandlers: Record<string, ToolHandler> = {
  list_railway_projects: handle_list_railway_projects,
  railway_whoami: handle_railway_whoami,
  list_railway_workspaces: handle_list_railway_workspaces,
  list_railway_services: handle_list_railway_services,
  list_railway_domains: handle_list_railway_domains,
  add_railway_domain: handle_add_railway_domain,
  list_railway_variables: handle_list_railway_variables,
  set_railway_variables: handle_set_railway_variables,
  delete_railway_variable: handle_delete_railway_variable,
  get_railway_service_config: handle_get_railway_service_config,
  get_railway_status: handle_get_railway_status,
  list_railway_deployments: handle_list_railway_deployments,
  get_railway_logs: handle_get_railway_logs,
  redeploy_railway_service: handle_redeploy_railway_service,
  update_railway_service: handle_update_railway_service,
  create_railway_project: handle_create_railway_project,
  search_railway_docs: handle_search_railway_docs,
};
