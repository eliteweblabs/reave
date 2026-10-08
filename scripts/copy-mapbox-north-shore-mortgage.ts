#!/usr/bin/env node
/**
 * Copy PUBLIC_MAPBOX_ACCESS_TOKEN from official reave.app Automation → reave service
 * to the North Shore Mortgage client install (Tony Barletta Jr. / tonybarlettajr.com).
 *
 * Uses RAILWAY_API_TOKEN (GraphQL) — no Railway MCP or CLI required.
 *
 * Usage:
 *   RAILWAY_API_TOKEN=… npm run copy:mapbox:north-shore-mortgage
 *   … --discover     # list matching client projects only
 *   … --dry-run      # print planned changes
 *   … --skip-redeploy
 *
 * Env overrides:
 *   REAVE_APP_PROJECT_ID   — default af65eb9a-b11c-4c1c-8030-66b4347dcf71
 *   REAVE_APP_SERVICE      — default reave
 *   NORTH_SHORE_RAILWAY_PROJECT — project id or name (skip auto-discovery)
 *   NORTH_SHORE_RAILWAY_SERVICE — Astro service name (default: auto)
 *   RAILWAY_ENV            — default production
 */
const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';
const REAVE_APP_PROJECT_ID =
  process.env.REAVE_APP_PROJECT_ID?.trim() || 'af65eb9a-b11c-4c1c-8030-66b4347dcf71';
const REAVE_APP_SERVICE = process.env.REAVE_APP_SERVICE?.trim() || 'reave';
const ENV_NAME = process.env.RAILWAY_ENV?.trim() || 'production';

const DOMAIN_NEEDLES = ['tonybarlettajr.com', 'northshoremortgage', 'northshore-mortgage'];
const PROJECT_NAME_NEEDLES = [
  'north shore mortgage',
  'northshore mortgage',
  'tony barletta',
  'tonybarlettajr',
];

const INFRA_SERVICE_RE =
  /postgres|redis|contact-api|inventory|materials|crater|calcom|fleet|booking|wizard|inbound|stats|plausible/i;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const discoverOnly = args.has('--discover');
const skipRedeploy = args.has('--skip-redeploy');

type ServiceRef = { id: string; name: string };
type Target = {
  projectId: string;
  projectName: string;
  serviceId: string;
  serviceName: string;
  environment: string;
  environmentId: string;
  reason: string;
};

function log(msg: string) {
  console.log(msg);
}

function fail(msg: string): never {
  console.error(`[mapbox-copy] ${msg}`);
  process.exit(1);
}

function token(): string {
  const t = process.env.RAILWAY_API_TOKEN?.trim();
  if (!t) {
    fail(
      'RAILWAY_API_TOKEN is not set. Add it to Cloud Agent secrets (or export locally) and retry.',
    );
  }
  return t;
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  const raw = await res.text();
  let body: { data?: T; errors?: Array<{ message: string }> };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    fail(`Invalid JSON from Railway: ${raw.slice(0, 200)}`);
  }
  if (!res.ok || body.errors?.length) {
    fail(body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`);
  }
  if (body.data === undefined) fail('No data in Railway response');
  return body.data;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function pickEnvironment(
  envs: Array<{ id: string; name: string }>,
  preferred: string,
): { id: string; name: string } | null {
  const needle = preferred.toLowerCase();
  return (
    envs.find((e) => e.name.toLowerCase() === needle) ??
    envs.find((e) => e.name.toLowerCase().includes(needle)) ??
    envs[0] ??
    null
  );
}

function pickAppService(
  services: ServiceRef[],
  preferred?: string,
): ServiceRef | null {
  if (preferred) {
    const needle = preferred.toLowerCase();
    const hit =
      services.find((s) => s.name.toLowerCase() === needle) ??
      services.find((s) => s.name.toLowerCase().includes(needle));
    if (hit) return hit;
  }
  for (const rank of ['tonybarlettajr', 'reave', 'astro', 'web', 'app']) {
    const hit = services.find((s) => s.name.toLowerCase() === rank);
    if (hit) return hit;
  }
  const candidates = services.filter((s) => !INFRA_SERVICE_RE.test(s.name));
  if (candidates.length === 1) return candidates[0]!;
  return candidates[0] ?? null;
}

function projectNameMatches(name: string): boolean {
  const n = name.toLowerCase();
  return PROJECT_NAME_NEEDLES.some((needle) => n.includes(needle));
}

function domainMatches(domains: string[]): string | null {
  for (const needle of DOMAIN_NEEDLES) {
    const hit = domains.find((d) => d.toLowerCase().includes(needle));
    if (hit) return hit.replace(/^www\./, '');
  }
  return null;
}

async function listProjects(): Promise<Array<{ id: string; name: string }>> {
  const projects: Array<{ id: string; name: string }> = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const data = await gql<{
      projects?: {
        edges: Array<{ node: { id: string; name: string; deletedAt?: string | null } }>;
        pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
      };
    }>(
      `query($after: String) {
        projects(first: 100, after: $after, includeDeleted: false) {
          edges { node { id name deletedAt } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after },
    );
    for (const edge of data.projects?.edges ?? []) {
      if (edge.node.deletedAt) continue;
      projects.push({ id: edge.node.id, name: edge.node.name });
    }
    const pi = data.projects?.pageInfo;
    if (!pi?.hasNextPage || !pi.endCursor) break;
    after = pi.endCursor;
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveProject(ref: string): Promise<{
  project: { id: string; name: string };
  services: ServiceRef[];
  environments: Array<{ id: string; name: string }>;
}> {
  if (isUuid(ref)) {
    const data = await gql<{
      project?: {
        id: string;
        name: string;
        deletedAt?: string | null;
        services?: { edges: Array<{ node: ServiceRef }> };
        environments?: { edges: Array<{ node: { id: string; name: string } }> };
      } | null;
    }>(
      `query($id: String!) {
        project(id: $id) {
          id name deletedAt
          services { edges { node { id name } } }
          environments { edges { node { id name } } }
        }
      }`,
      { id: ref },
    );
    if (!data.project || data.project.deletedAt) fail(`Project not found: ${ref}`);
    return {
      project: { id: data.project.id, name: data.project.name },
      services: (data.project.services?.edges ?? []).map((e) => e.node),
      environments: (data.project.environments?.edges ?? []).map((e) => e.node),
    };
  }

  const needle = ref.toLowerCase();
  const projects = await listProjects();
  const match =
    projects.find((p) => p.name.toLowerCase() === needle) ??
    projects.find((p) => p.name.toLowerCase().includes(needle));
  if (!match) {
    fail(
      `No project matching "${ref}". Available: ${projects.map((p) => p.name).slice(0, 16).join(', ')}`,
    );
  }
  return resolveProject(match.id);
}

async function listServiceDomains(opts: {
  projectId: string;
  environmentId: string;
  serviceId: string;
}): Promise<string[]> {
  const data = await gql<{
    domains?: { customDomains?: Array<{ domain: string }> | null } | null;
  }>(
    `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
      domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
        customDomains { domain }
      }
    }`,
    opts,
  );
  return (data.domains?.customDomains ?? []).map((d) => d.domain);
}

async function readServiceVariable(opts: {
  projectId: string;
  environmentId: string;
  serviceId: string;
  name: string;
}): Promise<string> {
  const data = await gql<{ variables?: Record<string, string> | null }>(
    `query($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    {
      projectId: opts.projectId,
      environmentId: opts.environmentId,
      serviceId: opts.serviceId,
    },
  );
  return (data.variables?.[opts.name] ?? '').trim();
}

async function discoverClientTarget(): Promise<Target | null> {
  const explicit = process.env.NORTH_SHORE_RAILWAY_PROJECT?.trim();
  const servicePref = process.env.NORTH_SHORE_RAILWAY_SERVICE?.trim();

  if (explicit) {
    const resolved = await resolveProject(explicit);
    const environment = pickEnvironment(resolved.environments, ENV_NAME);
    if (!environment) fail(`No environment "${ENV_NAME}" in ${resolved.project.name}`);
    const service = pickAppService(resolved.services, servicePref);
    if (!service) {
      fail(
        `No app service in ${resolved.project.name}. Services: ${resolved.services.map((s) => s.name).join(', ')}`,
      );
    }
    return {
      projectId: resolved.project.id,
      projectName: resolved.project.name,
      serviceId: service.id,
      serviceName: service.name,
      environment: environment.name,
      environmentId: environment.id,
      reason: `NORTH_SHORE_RAILWAY_PROJECT=${explicit}`,
    };
  }

  const candidates: Target[] = [];
  for (const project of await listProjects()) {
    if (project.id === REAVE_APP_PROJECT_ID) continue;

    const resolved = await resolveProject(project.id);
    const environment = pickEnvironment(resolved.environments, ENV_NAME);
    if (!environment) continue;

    for (const svc of resolved.services) {
      if (INFRA_SERVICE_RE.test(svc.name)) continue;
      const domains = await listServiceDomains({
        projectId: project.id,
        environmentId: environment.id,
        serviceId: svc.id,
      });
      const domainHit = domainMatches(domains);
      const nameHit = projectNameMatches(project.name);
      if (!domainHit && !nameHit) continue;

      const service = pickAppService(resolved.services, servicePref || svc.name);
      if (!service) continue;

      candidates.push({
        projectId: project.id,
        projectName: project.name,
        serviceId: service.id,
        serviceName: service.name,
        environment: environment.name,
        environmentId: environment.id,
        reason: domainHit ? `domain ${domainHit}` : `project name "${project.name}"`,
      });
      break;
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aTony = a.reason.includes('tonybarlettajr') ? 0 : 1;
    const bTony = b.reason.includes('tonybarlettajr') ? 0 : 1;
    return aTony - bTony;
  });
  return candidates[0]!;
}

async function upsertVariable(opts: {
  projectId: string;
  environmentId: string;
  serviceId: string;
  name: string;
  value: string;
}) {
  await gql(`mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`, {
    input: {
      projectId: opts.projectId,
      environmentId: opts.environmentId,
      serviceId: opts.serviceId,
      name: opts.name,
      value: opts.value,
    },
  });
}

async function redeploy(opts: { serviceId: string; environmentId: string }) {
  await gql(
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    opts,
  );
}

async function main() {
  const reave = await resolveProject(REAVE_APP_PROJECT_ID);
  const reaveEnv = pickEnvironment(reave.environments, ENV_NAME);
  if (!reaveEnv) fail(`No ${ENV_NAME} on reave.app project`);
  const reaveService = pickAppService(reave.services, REAVE_APP_SERVICE);
  if (!reaveService) fail(`Service "${REAVE_APP_SERVICE}" not found on reave.app project`);

  const mapbox =
    (await readServiceVariable({
      projectId: reave.project.id,
      environmentId: reaveEnv.id,
      serviceId: reaveService.id,
      name: 'PUBLIC_MAPBOX_ACCESS_TOKEN',
    })) ||
    (await readServiceVariable({
      projectId: reave.project.id,
      environmentId: reaveEnv.id,
      serviceId: reaveService.id,
      name: 'MAPBOX_ACCESS_TOKEN',
    }));

  if (!mapbox) {
    fail(
      `Neither PUBLIC_MAPBOX_ACCESS_TOKEN nor MAPBOX_ACCESS_TOKEN is set on ${REAVE_APP_SERVICE} (${reave.project.name}).`,
    );
  }

  const target = await discoverClientTarget();
  if (!target) {
    fail(
      'No North Shore Mortgage / tonybarlettajr Railway project found. Set NORTH_SHORE_RAILWAY_PROJECT.',
    );
  }

  if (discoverOnly) {
    log(
      JSON.stringify(
        {
          reave: {
            project: reave.project.name,
            service: reaveService.name,
            hasMapbox: true,
          },
          target,
        },
        null,
        2,
      ),
    );
    return;
  }

  const existing = await readServiceVariable({
    projectId: target.projectId,
    environmentId: target.environmentId,
    serviceId: target.serviceId,
    name: 'PUBLIC_MAPBOX_ACCESS_TOKEN',
  });

  log(
    `[mapbox-copy] Source: ${reave.project.name} → ${reaveService.name}\n` +
      `[mapbox-copy] Target: ${target.projectName} → ${target.serviceName} (${target.reason})\n` +
      `[mapbox-copy] Existing target value: ${existing ? '(set)' : '(empty)'}`,
  );

  if (existing === mapbox) {
    log('[mapbox-copy] Already matches reave — nothing to do.');
    return;
  }

  if (dryRun) {
    log('[mapbox-copy] dry-run — would set PUBLIC_MAPBOX_ACCESS_TOKEN on target app service');
    return;
  }

  await upsertVariable({
    projectId: target.projectId,
    environmentId: target.environmentId,
    serviceId: target.serviceId,
    name: 'PUBLIC_MAPBOX_ACCESS_TOKEN',
    value: mapbox,
  });
  log('[mapbox-copy] ✓ PUBLIC_MAPBOX_ACCESS_TOKEN written on app service');

  const booking = reave.services.find((s) => s.name === 'calcom-booking-api');
  const clientProject = await resolveProject(target.projectId);
  const clientBooking = clientProject.services.find((s) => s.name === 'calcom-booking-api');
  if (clientBooking) {
    const ref = `\${{ ${target.serviceName}.PUBLIC_MAPBOX_ACCESS_TOKEN }}`;
    for (const name of ['MAPBOX_ACCESS_TOKEN', 'MAPBOX_TOKEN'] as const) {
      await upsertVariable({
        projectId: target.projectId,
        environmentId: target.environmentId,
        serviceId: clientBooking.id,
        name,
        value: ref,
      });
    }
    log(`[mapbox-copy] ✓ calcom-booking-api MAPBOX_* pointed at ${ref}`);
  } else if (booking) {
    log('[mapbox-copy] (no calcom-booking-api on client — skipped booking MAPBOX refs)');
  }

  if (!skipRedeploy) {
    await redeploy({
      serviceId: target.serviceId,
      environmentId: target.environmentId,
    });
    log('[mapbox-copy] ✓ redeploy triggered for app service');
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
