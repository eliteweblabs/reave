#!/usr/bin/env node
/**
 * Find the Luxe Cleaning (formerly Maid & Marble) Railway project, apply install
 * + Vapi vars, redeploy, and optionally verify build logs / Vapi assistant.
 *
 * Uses RAILWAY_API_TOKEN (GraphQL) — no Railway CLI or MCP required.
 *
 * Usage:
 *   RAILWAY_API_TOKEN=… npm run configure:luxe-cleaning-railway -- --discover
 *   RAILWAY_API_TOKEN=… VAPI_API_KEY=… PUBLIC_VAPI_PUBLIC_KEY=… npm run configure:luxe-cleaning-railway
 *   … --dry-run          # print planned changes only
 *   … --skip-redeploy    # set vars without redeploy
 *   … --skip-vapi-provision  # do not pre-create assistant locally
 *   … --wire-inbound     # Resend inbound + owner email + Clerk domain (see below)
 *   … --skip-clerk       # with --wire-inbound, skip Clerk domain migration
 *
 * --wire-inbound provisions what the deploy wizard Apply does for mail:
 *   inbound.{apex} in Resend, MX/TXT in Cloudflare, email.received webhook,
 *   RESEND_FROM / EMAIL_FROM / RESEND_WEBHOOK_SECRET, OWNER_EMAIL, Clerk apex.
 *
 * Env overrides:
 *   LUXE_CLEANING_RAILWAY_PROJECT  — project id or name (skip auto-discovery)
 *   LUXE_CLEANING_RAILWAY_SERVICE  — service name (default: auto)
 *   LUXE_CLEANING_RAILWAY_ENV      — environment (default: production)
 *   PUBLIC_SITE_DOMAIN             — apex domain (default: detected or maidandmarble.com)
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';
const REAVE_APP_PROJECT_ID = 'af65eb9a-b11c-4c1c-8030-66b4347dcf71';
const DOMAIN_NEEDLES = ['lux.cleaning', 'luxecleaning.com', 'maidandmarble.com'];
const PROJECT_NAME_NEEDLES = ['maid', 'marble', 'luxe cleaning', 'luxe-cleaning'];
const INFRA_SERVICE_RE = /postgres|redis|contact-api|inventory|materials|crater|calcom|fleet|booking|wizard|inbound|stats|plausible/i;
const VAPI_PHONE = process.env.VAPI_PHONE_NUMBER?.trim() || '+15089558850';
const OWNER_EMAIL = process.env.OWNER_EMAIL?.trim() || 'felicia@lux.cleaning';
const OWNER_FIRST_NAME = process.env.OWNER_FIRST_NAME?.trim() || 'Felicia';
const OWNER_LAST_NAME = process.env.OWNER_LAST_NAME?.trim() || 'Tracy';
const OWNER_PHONE = process.env.OWNER_PHONE?.trim() || '+17744524319';

type DiscoveredTarget = {
  projectId: string;
  projectName: string;
  serviceId: string;
  serviceName: string;
  environment: string;
  environmentId: string;
  apexDomain: string;
  reason: string;
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const discoverOnly = args.has('--discover');
const skipRedeploy = args.has('--skip-redeploy');
const skipVapiProvision = args.has('--skip-vapi-provision');
const skipLogWait = args.has('--skip-log-wait');
const wireInbound = args.has('--wire-inbound');
const skipClerk = args.has('--skip-clerk');

function log(msg: string) {
  console.log(msg);
}

function fail(msg: string): never {
  console.error(`[luxe-railway] ${msg}`);
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function token(): string {
  const t = process.env.RAILWAY_API_TOKEN?.trim();
  if (!t) {
    fail(
      'RAILWAY_API_TOKEN is not set. Add it to Cloud Agent secrets and start a new agent.',
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

function pickAstroService(
  services: Array<{ id: string; name: string }>,
  preferred?: string,
): { id: string; name: string } | null {
  if (preferred) {
    const needle = preferred.toLowerCase();
    const hit =
      services.find((s) => s.name.toLowerCase() === needle) ??
      services.find((s) => s.name.toLowerCase().includes(needle));
    if (hit) return hit;
  }
  for (const rank of ['reave', 'astro', 'web', 'app']) {
    const hit = services.find((s) => s.name.toLowerCase() === rank);
    if (hit) return hit;
  }
  const candidates = services.filter((s) => !INFRA_SERVICE_RE.test(s.name));
  if (candidates.length === 1) return candidates[0]!;
  return candidates[0] ?? null;
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
  services: Array<{ id: string; name: string }>;
  environments: Array<{ id: string; name: string }>;
}> {
  if (isUuid(ref)) {
    const data = await gql<{
      project?: {
        id: string;
        name: string;
        deletedAt?: string | null;
        services?: { edges: Array<{ node: { id: string; name: string } }> };
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
    fail(`No project matching "${ref}". Available: ${projects.map((p) => p.name).slice(0, 12).join(', ')}`);
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

async function discoverTarget(): Promise<DiscoveredTarget | null> {
  const explicitProject = process.env.LUXE_CLEANING_RAILWAY_PROJECT?.trim();
  const envName = process.env.LUXE_CLEANING_RAILWAY_ENV?.trim() || 'production';
  const servicePref = process.env.LUXE_CLEANING_RAILWAY_SERVICE?.trim();

  if (explicitProject) {
    const resolved = await resolveProject(explicitProject);
    const environment = pickEnvironment(resolved.environments, envName);
    if (!environment) fail(`No environment "${envName}" in ${resolved.project.name}`);

    const service = pickAstroService(resolved.services, servicePref);
    if (!service) {
      fail(
        `No Astro-like service in ${resolved.project.name}. Services: ${resolved.services.map((s) => s.name).join(', ')}`,
      );
    }

    const domains = await listServiceDomains({
      projectId: resolved.project.id,
      environmentId: environment.id,
      serviceId: service.id,
    });

    return {
      projectId: resolved.project.id,
      projectName: resolved.project.name,
      serviceId: service.id,
      serviceName: service.name,
      environment: environment.name,
      environmentId: environment.id,
      apexDomain:
        process.env.PUBLIC_SITE_DOMAIN?.trim() || domainMatches(domains) || 'lux.cleaning',
      reason: `explicit LUXE_CLEANING_RAILWAY_PROJECT=${explicitProject}`,
    };
  }

  const projects = await listProjects();
  const candidates: DiscoveredTarget[] = [];

  for (const project of projects) {
    if (project.id === REAVE_APP_PROJECT_ID) continue;
    if (!projectNameMatches(project.name)) {
      // Still check domain-only match below.
    }

    const resolved = await resolveProject(project.id);
    const environment = pickEnvironment(resolved.environments, envName);
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

      const service = pickAstroService(resolved.services, servicePref || svc.name);
      if (!service) continue;

      candidates.push({
        projectId: project.id,
        projectName: project.name,
        serviceId: service.id,
        serviceName: service.name,
        environment: environment.name,
        environmentId: environment.id,
        apexDomain:
          process.env.PUBLIC_SITE_DOMAIN?.trim() || domainHit || 'lux.cleaning',
        reason: domainHit
          ? `custom domain ${domainHit}`
          : `project name matches "${project.name}"`,
      });
      break;
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aDomain = DOMAIN_NEEDLES.some((d) => a.apexDomain.includes(d)) ? 0 : 1;
    const bDomain = DOMAIN_NEEDLES.some((d) => b.apexDomain.includes(d)) ? 0 : 1;
    return aDomain - bDomain;
  });
  return candidates[0]!;
}

function normalizeApex(raw: string): string {
  return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

function inboundMailHost(apex: string): string {
  return `inbound.${normalizeApex(apex)}`;
}

function resendFromAddress(apex: string): string {
  return `noreply@${inboundMailHost(apex)}`;
}

function seedVendorEnvFromRailway(existing: Record<string, string>): void {
  if (!process.env.RESEND_API_KEY?.trim() && existing.RESEND_API_KEY?.trim()) {
    process.env.RESEND_API_KEY = existing.RESEND_API_KEY.trim();
  }
  if (!process.env.CLOUDFLARE_API_TOKEN?.trim() && existing.CLOUDFLARE_API_TOKEN?.trim()) {
    process.env.CLOUDFLARE_API_TOKEN = existing.CLOUDFLARE_API_TOKEN.trim();
  }
  if (!process.env.CLERK_SECRET_KEY?.trim() && existing.CLERK_SECRET_KEY?.trim()) {
    process.env.CLERK_SECRET_KEY = existing.CLERK_SECRET_KEY.trim();
  }
}

function buildVariablePatch(apexDomain: string, assistantId?: string): Record<string, string> {
  const apex = normalizeApex(apexDomain);
  const vars: Record<string, string> = {
    INSTALL_CONFIG: 'luxe-cleaning',
    PUBLIC_SITE_DOMAIN: apex,
    PUBLIC_SITE_URL: `https://${apex}`,
    COMPANY_DOMAIN: apex,
    COMPANY_LOGO_URL: `https://${apex}/sites/luxe-cleaning/logo.png`,
    EMAIL_FROM_NAME: 'Felicia Tracy · lux cleaning',
    EMAIL_FROM: resendFromAddress(apex),
    RESEND_FROM: resendFromAddress(apex),
    OWNER_EMAIL,
    OWNER_FIRST_NAME,
    OWNER_LAST_NAME,
    OWNER_PHONE,
    ADMIN_USERNAME: `${OWNER_FIRST_NAME} ${OWNER_LAST_NAME}`,
    PUBLIC_INSTALL_HOMEPAGE_VOICE: '1',
    COMPANY_NAME: 'lux cleaning',
    COMPANY_DESCRIPTION:
      'Woman-owned premium house cleaning in Central Massachusetts.',
    COMPANY_SUPPORT_PHONE: VAPI_PHONE,
    VAPI_PHONE_NUMBER: VAPI_PHONE,
    VAPI_CREATE_IF_MISSING: '1',
  };
  const vapiKey = process.env.VAPI_API_KEY?.trim();
  const publicKey = process.env.PUBLIC_VAPI_PUBLIC_KEY?.trim();
  if (vapiKey) vars.VAPI_API_KEY = vapiKey;
  if (publicKey) vars.PUBLIC_VAPI_PUBLIC_KEY = publicKey;
  if (assistantId) vars.PUBLIC_VAPI_ASSISTANT_ID = assistantId;
  if (process.env.VAPI_PHONE_NUMBER_ID?.trim()) {
    vars.VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID.trim();
  }
  return vars;
}

function provisionAssistantIfNeeded(): string | undefined {
  if (skipVapiProvision) return process.env.PUBLIC_VAPI_ASSISTANT_ID?.trim();
  if (!process.env.VAPI_API_KEY?.trim()) {
    log('[luxe-railway] skip local Vapi provision — VAPI_API_KEY not set');
    return process.env.PUBLIC_VAPI_ASSISTANT_ID?.trim();
  }

  const child = spawnSync(
    'node',
    ['--experimental-strip-types', 'scripts/provision-vapi-assistant.ts', '--print-id'],
    {
      cwd: root,
      env: {
        ...process.env,
        INSTALL_CONFIG: 'luxe-cleaning',
        COMPANY_NAME: 'lux cleaning',
        COMPANY_DESCRIPTION:
          'Woman-owned premium house cleaning in Central Massachusetts.',
        VAPI_PHONE_NUMBER: VAPI_PHONE,
        VAPI_CREATE_IF_MISSING: '1',
      },
      encoding: 'utf8',
    },
  );

  if (child.status !== 0) {
    log(`[luxe-railway] Vapi provision warning: ${child.stderr || child.stdout}`);
    return process.env.PUBLIC_VAPI_ASSISTANT_ID?.trim();
  }

  const assistantId = (child.stdout ?? '').trim();
  if (assistantId) log(`[luxe-railway] Vapi assistant id: ${assistantId}`);
  return assistantId || process.env.PUBLIC_VAPI_ASSISTANT_ID?.trim();
}

async function setVariables(
  target: DiscoveredTarget,
  patch: Record<string, string>,
): Promise<string[]> {
  const updated: string[] = [];
  for (const [name, value] of Object.entries(patch)) {
    await gql(
      `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
      {
        input: {
          projectId: target.projectId,
          environmentId: target.environmentId,
          serviceId: target.serviceId,
          name,
          value: String(value),
        },
      },
    );
    updated.push(name);
  }
  return updated;
}

async function listVariables(target: DiscoveredTarget): Promise<Record<string, string>> {
  const data = await gql<{ variables?: Record<string, string> | null }>(
    `query($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    {
      projectId: target.projectId,
      environmentId: target.environmentId,
      serviceId: target.serviceId,
    },
  );
  return data.variables ?? {};
}

async function redeploy(target: DiscoveredTarget): Promise<void> {
  await gql(
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId: target.serviceId, environmentId: target.environmentId },
  );
}

async function listLatestDeployment(
  target: DiscoveredTarget,
): Promise<{ id: string; status: string } | null> {
  const data = await gql<{
    deployments?: {
      edges: Array<{ node: { id: string; status: string } }>;
    } | null;
  }>(
    `query($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges { node { id status } }
      }
    }`,
    {
      input: {
        projectId: target.projectId,
        environmentId: target.environmentId,
        serviceId: target.serviceId,
      },
      first: 3,
    },
  );
  const node = data.deployments?.edges[0]?.node;
  return node ? { id: node.id, status: node.status } : null;
}

async function waitForDeploy(
  target: DiscoveredTarget,
  previousDeploymentId?: string,
): Promise<string | null> {
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    const latest = await listLatestDeployment(target);
    if (!latest) {
      await sleep(15_000);
      continue;
    }
    if (previousDeploymentId && latest.id === previousDeploymentId) {
      await sleep(15_000);
      continue;
    }
    log(`[luxe-railway] deployment ${latest.id}: ${latest.status}`);
    const status = latest.status.toUpperCase();
    if (['SUCCESS', 'FAILED', 'CRASHED', 'REMOVED'].includes(status)) {
      return latest.id;
    }
    await sleep(15_000);
  }
  return null;
}

async function verifyBuildLogs(deploymentId: string): Promise<boolean> {
  const data = await gql<{ buildLogs?: Array<{ message: string }> }>(
    `query($deploymentId: String!, $limit: Int, $filter: String) {
      buildLogs(deploymentId: $deploymentId, limit: $limit, filter: $filter) {
        message
      }
    }`,
    { deploymentId, limit: 500, filter: 'vapi-sync' },
  );
  const lines = data.buildLogs ?? [];
  const text = lines.map((l) => l.message).join('\n');
  if (text.includes('[vapi-sync] Created assistant')) {
    log('[luxe-railway] ✓ build logs contain [vapi-sync] Created assistant');
    return true;
  }
  if (text.includes('[vapi-sync] Updated assistant')) {
    log('[luxe-railway] ✓ build logs contain [vapi-sync] Updated assistant');
    return true;
  }
  if (text.includes('[vapi-sync] skipped')) {
    log('[luxe-railway] ⚠ build logs show [vapi-sync] skipped');
    return false;
  }
  for (const row of lines.slice(-20)) log(`  ${row.message}`);
  return false;
}

async function resendEnableReceiving(domainId: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  const res = await fetch(`https://api.resend.com/domains/${domainId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      capabilities: { sending: 'enabled', receiving: 'enabled' },
    }),
  });
  return res.ok;
}

function clerkPublishableKeyForDomain(apex: string): string | undefined {
  const host = normalizeApex(apex).toLowerCase();
  if (!host || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)) return undefined;
  return `pk_live_${Buffer.from(`clerk.${host}$`).toString('base64')}`;
}

async function clerkMigratePrimaryDomain(apex: string): Promise<{
  ok: boolean;
  skipped?: boolean;
  publishableKey?: string;
  error?: string;
}> {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) return { ok: false, skipped: true, error: 'CLERK_SECRET_KEY not configured' };

  const host = normalizeApex(apex).toLowerCase();
  if (!host) return { ok: false, error: 'invalid apex' };

  const proxyUrl = `https://${host}/__clerk`;
  const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };

  const listed = await fetch('https://api.clerk.com/v1/domains', { headers });
  if (!listed.ok) {
    return { ok: false, error: `Clerk domains HTTP ${listed.status}` };
  }
  const body = (await listed.json()) as {
    data?: Array<{ id: string; name: string; is_satellite?: boolean; proxy_url?: string }>;
  };
  const rows = body.data ?? [];
  const primary = rows.find((row) => row.is_satellite === false) ?? rows[0];
  if (!primary?.id) return { ok: false, error: 'no Clerk domain to migrate' };

  const primaryName = (primary.name ?? '').replace(/^www\./, '').toLowerCase();
  if (primaryName === host && (primary.proxy_url ?? '').replace(/\/+$/, '') === proxyUrl) {
    return { ok: true, skipped: true, publishableKey: clerkPublishableKeyForDomain(host) };
  }

  const patched = await fetch(`https://api.clerk.com/v1/domains/${primary.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: host, proxy_url: proxyUrl }),
  });
  if (!patched.ok) {
    return { ok: false, error: `Clerk domain patch HTTP ${patched.status}` };
  }

  const changed = await fetch('https://api.clerk.com/v1/instance/change_domain', {
    method: 'POST',
    headers,
    body: JSON.stringify({ home_url: `https://${host}` }),
  });
  if (!changed.ok && changed.status !== 202) {
    return { ok: false, error: `Clerk change_domain HTTP ${changed.status}` };
  }

  return { ok: true, publishableKey: clerkPublishableKeyForDomain(host) };
}

async function clerkEnsureOwnerEmail(userId: string, email: string): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret || !userId || !email) return;

  const userRes = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!userRes.ok) {
    log(`[luxe-railway] ⚠ Clerk user fetch failed: HTTP ${userRes.status}`);
    return;
  }
  const user = (await userRes.json()) as {
    email_addresses?: Array<{ id: string; email_address: string }>;
    primary_email_address_id?: string;
  };
  const needle = email.toLowerCase();
  const existing = (user.email_addresses ?? []).find(
    (row) => row.email_address?.toLowerCase() === needle,
  );
  if (existing) {
    if (user.primary_email_address_id !== existing.id) {
      const patch = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ primary_email_address_id: existing.id }),
      });
      log(
        patch.ok
          ? `[luxe-railway] ✓ Clerk primary email → ${email}`
          : `[luxe-railway] ⚠ Clerk primary email patch failed: HTTP ${patch.status}`,
      );
    } else {
      log(`[luxe-railway] ✓ Clerk already has ${email} as primary`);
    }
    return;
  }

  const add = await fetch('https://api.clerk.com/v1/email_addresses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId, email_address: email }),
  });
  if (!add.ok) {
    log(`[luxe-railway] ⚠ Clerk add email failed: HTTP ${add.status}`);
    return;
  }
  const created = (await add.json()) as { id?: string };
  if (created.id) {
    await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ primary_email_address_id: created.id }),
    });
  }
  log(`[luxe-railway] ✓ Clerk added ${email} to owner user`);
}

async function wireInboundInstall(
  target: DiscoveredTarget,
  existing: Record<string, string>,
): Promise<Record<string, string>> {
  const apex = normalizeApex(target.apexDomain);
  const inbound = inboundMailHost(apex);
  const from = resendFromAddress(apex);
  const webhookUrl = `https://${apex}/api/email/inbound`;
  const patch: Record<string, string> = {
    OWNER_EMAIL,
    OWNER_FIRST_NAME,
    OWNER_LAST_NAME,
    OWNER_PHONE,
    ADMIN_USERNAME: `${OWNER_FIRST_NAME} ${OWNER_LAST_NAME}`,
    RESEND_FROM: from,
    EMAIL_FROM: from,
  };

  if (dryRun) {
    log('[luxe-railway] --wire-inbound (dry run):');
    log(`  Resend domain: ${inbound}`);
    log(`  Cloudflare DNS sync for ${inbound}`);
    log(`  Webhook: POST ${webhookUrl}`);
    log(`  OWNER_EMAIL=${OWNER_EMAIL}`);
    log(`  RESEND_FROM=${from}`);
    if (!skipClerk) log(`  Clerk primary domain → ${apex}`);
    return patch;
  }

  const {
    resendCreateDomain,
    resendGetDomainByName,
    syncResendDnsToCloudflare,
    resendEnsureInboundWebhook,
    isResendConfigured,
  } = await import('../src/lib/resendDnsSync.ts');

  if (!isResendConfigured()) {
    fail(
      'RESEND_API_KEY is not set (Railway service or local env). Required for --wire-inbound.',
    );
  }

  log(`[luxe-railway] Resend inbound domain: ${inbound}`);
  let domain = await resendGetDomainByName(inbound);
  if (!domain.ok) {
    const created = await resendCreateDomain(inbound);
    if (!created.ok) fail(`Resend create ${inbound}: ${created.error}`);
    log(`[luxe-railway] ✓ created Resend domain ${inbound} (${created.status})`);
    domain = await resendGetDomainByName(inbound);
    if (!domain.ok) fail(`Resend domain missing after create: ${inbound}`);
  } else {
    log(`[luxe-railway] ✓ Resend domain ${domain.detail.name} (${domain.detail.status})`);
  }

  if (domain.detail.capabilities?.receiving !== 'enabled') {
    const ok = await resendEnableReceiving(domain.detail.id);
    log(ok ? '[luxe-railway] ✓ enabled Resend receiving' : '[luxe-railway] ⚠ receiving enable failed');
  }

  const dns = await syncResendDnsToCloudflare(inbound);
  if (!dns.ok) {
    log(`[luxe-railway] ⚠ Cloudflare DNS sync: ${dns.error}`);
  } else {
    log(`[luxe-railway] ✓ ${dns.summary.split('\n')[0]}`);
  }

  const hook = await resendEnsureInboundWebhook(webhookUrl);
  if (!hook.ok) fail(`Resend webhook: ${hook.error}`);
  patch.RESEND_WEBHOOK_SECRET = hook.signingSecret;
  log(
    `[luxe-railway] ✓ Resend webhook ${hook.created ? 'created' : 'reused'} → ${webhookUrl}`,
  );

  if (!skipClerk && process.env.CLERK_SECRET_KEY?.trim()) {
    const clerk = await clerkMigratePrimaryDomain(apex);
    if (!clerk.ok && !clerk.skipped) {
      log(`[luxe-railway] ⚠ Clerk domain: ${clerk.error}`);
    } else if (clerk.skipped) {
      log(`[luxe-railway] ✓ Clerk domain already ${apex}`);
    } else {
      log(`[luxe-railway] ✓ Clerk primary domain → ${apex}`);
    }
    const pk = clerk.publishableKey;
    if (pk) {
      patch.PUBLIC_CLERK_PUBLISHABLE_KEY = pk;
      patch.PUBLIC_CLERK_PROXY_URL = `https://${apex}/__clerk`;
    }

    const ownerId = (existing.AGENT_ALERT_USER_ID ?? '')
      .split(',')
      .map((s) => s.trim())
      .find(Boolean);
    if (ownerId) await clerkEnsureOwnerEmail(ownerId, OWNER_EMAIL);
  } else if (!skipClerk) {
    log('[luxe-railway] skip Clerk — CLERK_SECRET_KEY not available');
  }

  return patch;
}

async function verifyVapiAssistant(assistantId?: string): Promise<boolean> {
  const apiKey = process.env.VAPI_API_KEY?.trim();
  if (!apiKey) {
    log('[luxe-railway] skip Vapi verify — VAPI_API_KEY not set');
    return false;
  }
  const id = assistantId?.trim();
  if (!id) {
    log('[luxe-railway] skip Vapi verify — no assistant id');
    return false;
  }

  const res = await fetch(`https://api.vapi.ai/assistant/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    log(`[luxe-railway] Vapi assistant fetch failed: HTTP ${res.status}`);
    return false;
  }
  const assistant = (await res.json()) as { name?: string };
  log(`[luxe-railway] ✓ Vapi assistant "${assistant.name ?? id}" (${id})`);

  const phones = await fetch('https://api.vapi.ai/phone-number', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!phones.ok) return false;
  const phoneRows = (await phones.json()) as Array<{
    number?: string;
    assistantId?: string;
  }>;
  const targetDigits = VAPI_PHONE.replace(/\D/g, '');
  const phone = phoneRows.find((p) => {
    const digits = (p.number ?? '').replace(/\D/g, '');
    return digits === targetDigits || digits.endsWith(targetDigits.slice(-10));
  });
  if (!phone) {
    log(`[luxe-railway] ⚠ Vapi phone ${VAPI_PHONE} not found`);
    return false;
  }
  if (phone.assistantId === id) {
    log(`[luxe-railway] ✓ phone ${phone.number} linked to assistant`);
    return true;
  }
  log(`[luxe-railway] ⚠ phone ${phone.number} not linked to ${id}`);
  return false;
}

async function main() {
  const me = await gql<{ me?: { email: string } | null }>(`query { me { email } }`);
  if (me.me?.email) log(`[luxe-railway] Railway account: ${me.me.email}`);

  const target = await discoverTarget();
  if (!target) {
    fail(
      'Could not find Maid & Marble / Luxe Cleaning Railway project. Set LUXE_CLEANING_RAILWAY_PROJECT.',
    );
  }

  log('');
  log('Discovered target:');
  log(`  Project: ${target.projectName} (${target.projectId})`);
  log(`  Service: ${target.serviceName} (${target.serviceId})`);
  log(`  Environment: ${target.environment}`);
  log(`  Apex domain: ${target.apexDomain}`);
  log(`  Match: ${target.reason}`);
  log('');

  if (discoverOnly) {
    log('Document for deploy:');
    log(`  LUXE_CLEANING_RAILWAY_PROJECT=${target.projectId}`);
    log(`  LUXE_CLEANING_RAILWAY_SERVICE=${target.serviceName}`);
    return;
  }

  const before = await listVariables(target);
  seedVendorEnvFromRailway(before);
  log(`Current INSTALL_CONFIG: ${before.INSTALL_CONFIG ?? '(unset)'}`);

  const assistantId = provisionAssistantIfNeeded();
  let patch = buildVariablePatch(target.apexDomain, assistantId);

  if (wireInbound) {
    log('');
    log('Wiring inbound email + owner identity…');
    patch = { ...patch, ...(await wireInboundInstall(target, before)) };
  }

  log('Variables to apply:');
  for (const key of Object.keys(patch).sort()) {
    const hidden = key.includes('KEY') || key.includes('TOKEN') || key.includes('SECRET');
    log(`  ${key}=${hidden ? '(set)' : patch[key]}`);
  }
  log('');

  if (dryRun) {
    log('[luxe-railway] dry run — no Railway changes');
    return;
  }

  const updated = await setVariables(target, patch);
  log(`[luxe-railway] ✓ updated ${updated.length} variables on ${target.serviceName}`);

  if (skipRedeploy) return;

  const prev = await listLatestDeployment(target);
  await redeploy(target);
  log(`[luxe-railway] ✓ redeploy triggered for ${target.serviceName}`);

  if (skipLogWait) return;

  log('[luxe-railway] waiting for deployment (up to 12 min)…');
  const deploymentId = await waitForDeploy(target, prev?.id);
  if (!deploymentId) {
    log('[luxe-railway] deploy wait timed out');
    return;
  }

  await verifyBuildLogs(deploymentId);
  await verifyVapiAssistant(assistantId || patch.PUBLIC_VAPI_ASSISTANT_ID);

  log('');
  log('Document for future runs:');
  log(`  LUXE_CLEANING_RAILWAY_PROJECT=${target.projectId}`);
  log(`  LUXE_CLEANING_RAILWAY_SERVICE=${target.serviceName}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
