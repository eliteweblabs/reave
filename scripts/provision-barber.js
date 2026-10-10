#!/usr/bin/env node
/**
 * Provision a solo barber stack on Railway (Postgres + Cal.com + site + contact API).
 *
 * Usage:
 *   RAILWAY_API_TOKEN=… GITHUB_TOKEN=… npm run provision:barber -- configs/stevendiaz.json
 *
 * Step 8 seeds event types via Postgres when RAILWAY_API_TOKEN or CALCOM_DATABASE_URL is set
 * (Cal.com API keys are commercial on self-hosted cal.com). Optional CALCOM_API_KEY for API path.
 */
import { randomBytes } from 'node:crypto';
import { barberNfcCardUrl, barberSetupWizardUrl } from '../src/lib/barberSetupWizard.ts';
import { createInterface } from 'node:readline';
import { loadBarberConfig, fail } from './barber-config.js';
import { syncBarberCalEventTypes } from './barber-cal-events.js';
import { syncBarberEventTypesToDatabase } from './barber-cal-db-events.js';
import { syncBarberCalPaymentMode } from './barber-cal-payments.js';
import { barberPaymentsToSiteEnv } from '../src/lib/barberPayments.ts';
import { CALCOM_IMAGE, CALCOM_START } from './barber-cal-railway.js';

const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';
const POSTGRES_IMAGE = 'ghcr.io/railwayapp-templates/postgres-ssl:edge';
const POSTGRES_VOLUME = '/var/lib/postgresql/data';
const ENV_NAME = 'production';

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function railwayRef(service, variable) {
  return `\${{ ${service}.${variable} }}`;
}

function token(name) {
  const t = process.env[name]?.trim();
  if (!t) fail(`${name} is not set`);
  return t;
}

async function gql(query, variables) {
  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token('RAILWAY_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  const raw = await res.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    fail(`Invalid JSON from Railway: ${raw.slice(0, 200)}`);
  }
  if (!res.ok || body.errors?.length) {
    fail(body.errors?.map((e) => e.message).join('; ') || `Railway HTTP ${res.status}`);
  }
  if (body.data === undefined) fail('No data in Railway response');
  return body.data;
}

async function verifyGithubRepo(repo, label) {
  const gh = process.env.GITHUB_TOKEN?.trim();
  if (!gh) fail('GITHUB_TOKEN is not set (needed to verify GitHub repos)');
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) fail(`Invalid github repo "${repo}" for ${label}`);

  const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/`, {
    headers: {
      Authorization: `Bearer ${gh}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) fail(`GitHub repo not found: ${repo} (${label})`);
  if (!res.ok) {
    const t = await res.text();
    fail(`GitHub Contents API ${res.status} for ${repo}: ${t.slice(0, 200)}`);
  }
  log('preflight', `✓ GitHub repo ${repo} (${label})`);
}

async function createProject(name, workspaceId) {
  const data = await gql(
    `mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) { id name }
    }`,
    { input: { name, workspaceId } },
  );
  const row = data.projectCreate;
  if (!row?.id) fail('projectCreate returned no id');
  return row;
}

async function resolveProject(projectId) {
  const data = await gql(
    `query($id: String!) {
      project(id: $id) {
        id name
        environments { edges { node { id name } } }
        services { edges { node { id name } } }
      }
    }`,
    { id: projectId },
  );
  if (!data.project) fail(`Project not found: ${projectId}`);
  return {
    project: { id: data.project.id, name: data.project.name },
    environments: (data.project.environments?.edges ?? []).map((e) => e.node),
    services: (data.project.services?.edges ?? []).map((e) => e.node),
  };
}

function pickEnvironment(environments) {
  const needle = ENV_NAME.toLowerCase();
  return (
    environments.find((e) => e.name.toLowerCase() === needle) ??
    environments.find((e) => e.name.toLowerCase().includes(needle)) ??
    environments[0] ??
    null
  );
}

async function serviceCreateRaw(input) {
  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token('RAILWAY_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation($input: ServiceCreateInput!) {
        serviceCreate(input: $input) { id name }
      }`,
      variables: { input },
    }),
  });
  const raw = await res.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: `Invalid JSON: ${raw.slice(0, 200)}` };
  }
  if (!res.ok || body.errors?.length) {
    return {
      ok: false,
      error: body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`,
    };
  }
  const row = body.data?.serviceCreate;
  if (!row?.id) return { ok: false, error: 'serviceCreate returned no id' };
  return { ok: true, row };
}

async function createService(projectId, name, { repo, image, branch = 'main' } = {}) {
  const source = {};
  if (repo) source.repo = repo;
  if (image) source.image = image;
  const input = { projectId, name };
  if (Object.keys(source).length) input.source = source;
  if (repo && branch) input.branch = branch;

  let created = await serviceCreateRaw(input);
  if (!created.ok && repo) {
    log('railway', `serviceCreate with repo failed (${created.error}) — empty service + serviceConnect`);
    const empty = await serviceCreateRaw({ projectId, name });
    if (!empty.ok) fail(`${name}: ${created.error}; empty: ${empty.error}`);
    await gql(
      `mutation($id: String!, $input: ServiceConnectInput!) {
        serviceConnect(id: $id, input: $input) { id name }
      }`,
      { id: empty.row.id, input: { repo, branch: 'main' } },
    );
    return empty.row;
  }
  if (!created.ok) fail(`${name}: ${created.error}`);
  return created.row;
}

async function createVolume(projectId, environmentId, serviceId, mountPath) {
  const data = await gql(
    `mutation($input: VolumeCreateInput!) {
      volumeCreate(input: $input) { id }
    }`,
    {
      input: { projectId, environmentId, serviceId, mountPath },
    },
  );
  const id = data.volumeCreate?.id;
  if (!id) fail('volumeCreate returned no id');
  return id;
}

async function upsertVariables(projectId, environmentId, serviceId, variables, skipDeploys = false) {
  for (const [name, value] of Object.entries(variables)) {
    await gql(
      `mutation($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }`,
      {
        input: {
          projectId,
          environmentId,
          serviceId,
          name,
          value: String(value),
        },
      },
    );
  }
  if (!skipDeploys) {
    // Railway redeploys on variable upsert by default — no extra call.
  }
}

async function ensurePublicDomain(projectId, environmentId, serviceId) {
  const existing = await gql(
    `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
      domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
        serviceDomains { domain }
      }
    }`,
    { projectId, environmentId, serviceId },
  );
  const domains = existing.domains?.serviceDomains ?? [];
  if (domains[0]?.domain) return domains[0].domain;

  const created = await gql(
    `mutation($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) { domain }
    }`,
    { input: { serviceId, environmentId } },
  );
  const domain = created.serviceDomainCreate?.domain;
  if (!domain) fail('serviceDomainCreate returned no domain');
  return domain;
}

async function updateStartCommand(serviceId, environmentId, startCommand) {
  await gql(
    `mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }`,
    { serviceId, environmentId, input: { startCommand } },
  );
}

async function listRenderedVariables(projectId, environmentId, serviceId) {
  const data = await gql(
    `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { projectId, environmentId, serviceId },
  );
  return data.variables ?? {};
}

async function redeployService(serviceId, environmentId) {
  await gql(
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId, environmentId },
  );
}

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

function encodePgPassword(password) {
  return encodeURIComponent(password);
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) fail('Usage: node scripts/provision-barber.js <config.json>');

  const cfg = loadBarberConfig(configPath);
  const dbName = `${cfg.slug}-db`;
  const calName = `${cfg.slug}-cal`;
  const siteName = `${cfg.slug}-site`;
  const apiName = `${cfg.slug}-api`;

  log('preflight', `Barber: ${cfg.name} (${cfg.slug})`);
  await verifyGithubRepo(cfg.github_site_repo, 'site');
  await verifyGithubRepo(cfg.github_api_repo, 'api');

  log('STEP 1', `Creating Railway project "${cfg.name}"…`);
  const project = await createProject(cfg.name, cfg.railway_workspace_id);
  log('STEP 1', `✓ project id ${project.id}`);

  const resolved = await resolveProject(project.id);
  const environment = pickEnvironment(resolved.environments);
  if (!environment) fail('No environment found on new project');
  const { id: environmentId } = environment;

  log('STEP 2', `Provisioning Postgres "${dbName}"…`);
  const dbSvc = await createService(project.id, dbName, { image: POSTGRES_IMAGE });
  await createVolume(project.id, environmentId, dbSvc.id, POSTGRES_VOLUME);
  const pgPassword = randomBytes(24).toString('hex');
  await upsertVariables(project.id, environmentId, dbSvc.id, {
    POSTGRES_USER: 'postgres',
    POSTGRES_DB: 'railway',
    POSTGRES_PASSWORD: pgPassword,
    PGDATA: '/var/lib/postgresql/data/pgdata',
    DATABASE_URL:
      'postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{POSTGRES_DB}}',
  });
  const dbRef = railwayRef(dbName, 'DATABASE_URL');
  log('STEP 2', `✓ Postgres service ${dbSvc.id}; DATABASE_URL ref ${dbRef}`);

  log('STEP 3', `Creating Cal.com "${calName}"…`);
  const calSvc = await createService(project.id, calName, { image: CALCOM_IMAGE });
  let calDomain = await ensurePublicDomain(project.id, environmentId, calSvc.id);
  const calBase = `https://${calDomain}`;
  const nextAuthSecret = randomBytes(32).toString('hex');
  const encryptionKey = randomBytes(32).toString('hex');
  const setupWizardSecret = randomBytes(24).toString('hex');

  const calPublic = `https://\${{ ${calName}.RAILWAY_PUBLIC_DOMAIN }}`;
  const sitePublic = `https://\${{ ${siteName}.RAILWAY_PUBLIC_DOMAIN }}`;
  await upsertVariables(project.id, environmentId, calSvc.id, {
    DATABASE_URL: dbRef,
    DATABASE_DIRECT_URL: '',
    NEXTAUTH_SECRET: nextAuthSecret,
    CALENDSO_ENCRYPTION_KEY: encryptionKey,
    NEXTAUTH_URL: calPublic,
    NEXT_PUBLIC_WEBAPP_URL: calPublic,
    WEBAPP_URL: calPublic,
    NEXT_PUBLIC_WEBSITE_URL: sitePublic,
    NEXT_PUBLIC_APP_NAME: `${cfg.name} Bookings`,
    NEXT_PUBLIC_LICENSE_CONSENT: 'agree',
    LICENSE: 'agree',
    PRISMA_GENERATE_DATAPROXY: 'false',
    ALLOWED_HOSTNAMES: `["\${{ ${calName}.RAILWAY_PUBLIC_DOMAIN }}"]`,
    PORT: '3000',
  });
  await updateStartCommand(calSvc.id, environmentId, CALCOM_START);
  log('STEP 3', `✓ Cal.com at ${calBase} (start: ${CALCOM_START})`);

  log('STEP 4', `Creating site "${siteName}" from ${cfg.github_site_repo}…`);
  const siteSvc = await createService(project.id, siteName, {
    repo: cfg.github_site_repo,
    branch: 'main',
  });
  const siteDomain = await ensurePublicDomain(project.id, environmentId, siteSvc.id);
  const siteBase = `https://${siteDomain}`;
  await upsertVariables(project.id, environmentId, siteSvc.id, {
    PUBLIC_CALCOM_BASE: `${calPublic}/${cfg.slug}`,
    PUBLIC_CALCOM_USERNAME: cfg.slug,
    PORT: '3000',
    ...barberPaymentsToSiteEnv(cfg.payments),
    SETUP_WIZARD_SECRET: setupWizardSecret,
    PUBLIC_SHOW_SETUP_BANNER: 'true',
    PUBLIC_BARBER_NAME: cfg.name,
    PUBLIC_CAL_WEBAPP_URL: calPublic,
    BARBER_SETUP_PROJECT_NAME: cfg.name,
    BARBER_SETUP_SITE_SERVICE: siteName,
  });
  log('STEP 4', `✓ Site at ${siteBase}`);

  log('STEP 5', `Creating contact API "${apiName}" from ${cfg.github_api_repo}…`);
  const apiSvc = await createService(project.id, apiName, {
    repo: cfg.github_api_repo,
    branch: 'main',
  });
  await upsertVariables(project.id, environmentId, apiSvc.id, {
    DATABASE_URL: dbRef,
    PORT: '3000',
  });
  log('STEP 5', `✓ API service ${apiSvc.id} (no public domain)`);

  let staffAppBase = '';
  const staffEnabled = cfg.staff_app?.enabled !== false;
  if (staffEnabled) {
    const osDbName = `${cfg.slug}-os-db`;
    const appName = `${cfg.slug}-app`;
    log('STEP 5b', `Staff app (NFC /card passkey) — ${osDbName} + ${appName}…`);
    const osDbSvc = await createService(project.id, osDbName, { image: POSTGRES_IMAGE });
    await createVolume(project.id, environmentId, osDbSvc.id, POSTGRES_VOLUME);
    const osPgPassword = randomBytes(24).toString('hex');
    const osDbRef = railwayRef(osDbName, 'DATABASE_URL');
    await upsertVariables(project.id, environmentId, osDbSvc.id, {
      POSTGRES_USER: 'postgres',
      POSTGRES_DB: 'railway',
      POSTGRES_PASSWORD: osPgPassword,
      PGDATA: '/var/lib/postgresql/data/pgdata',
      DATABASE_URL:
        'postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{POSTGRES_DB}}',
    });
    const appSvc = await createService(project.id, appName, {
      repo: 'eliteweblabs/reave',
      branch: 'main',
    });
    const appDomain = await ensurePublicDomain(project.id, environmentId, appSvc.id);
    staffAppBase = `https://${appDomain}`;
    const appPublicRef = `https://\${{ ${appName}.RAILWAY_PUBLIC_DOMAIN }}`;
    await upsertVariables(project.id, environmentId, appSvc.id, {
      INSTALL_CONFIG: 'barber-staff',
      DATABASE_URL: osDbRef,
      PUBLIC_SITE_DOMAIN: `\${{ ${appName}.RAILWAY_PUBLIC_DOMAIN }}`,
      COMPANY_NAME: cfg.name,
      COMPANY_SUPPORT_PHONE: cfg.phone?.trim() || '',
      PORT: '4321',
    });
    await upsertVariables(project.id, environmentId, siteSvc.id, {
      PUBLIC_STAFF_APP_URL: appPublicRef,
    });
    log('STEP 5b', `✓ Staff app ${staffAppBase}/card (set Clerk keys on ${appName})`);
  }

  console.log(`
╔══════════════════════════════════════════════════╗
║  MANUAL STEP REQUIRED — 30 seconds               ║
║                                                  ║
║  1. Open Railway dashboard                       ║
║  2. Project: ${cfg.name.padEnd(33)}║
║  3. Service: ${dbName.padEnd(33)}║
║  4. Settings → Networking → Create TCP Proxy     ║
║  5. Press ENTER here when done                   ║
╚══════════════════════════════════════════════════╝`);
  await waitForEnter();

  log('STEP 7', `Reading TCP proxy variables on ${dbName}…`);
  const dbVars = await listRenderedVariables(project.id, environmentId, dbSvc.id);
  const tcpDomain = dbVars.RAILWAY_TCP_PROXY_DOMAIN?.trim();
  const tcpPort = dbVars.RAILWAY_TCP_PROXY_PORT?.trim();
  const password = (dbVars.PGPASSWORD || dbVars.POSTGRES_PASSWORD || '').trim();
  if (!tcpDomain || !tcpPort || !password) {
    fail(
      `Missing TCP proxy vars on ${dbName}. Need RAILWAY_TCP_PROXY_DOMAIN, RAILWAY_TCP_PROXY_PORT, and PGPASSWORD/POSTGRES_PASSWORD. Found keys: ${Object.keys(dbVars).join(', ')}`,
    );
  }
  const directUrl = `postgresql://postgres:${encodePgPassword(password)}@${tcpDomain}:${tcpPort}/railway`;
  await upsertVariables(project.id, environmentId, calSvc.id, {
    DATABASE_DIRECT_URL: directUrl,
  });
  log('STEP 7', `✓ DATABASE_DIRECT_URL set on ${calName}`);

  log('STEP 8', 'Waiting 10s for Cal.com first deploy…');
  await sleep(10_000);
  const apiKey = process.env.CALCOM_API_KEY?.trim();
  let seeded = false;
  if (!process.env.CALCOM_FORCE_API?.trim()) {
    try {
      const dbSeed = await syncBarberEventTypesToDatabase(directUrl, cfg);
      seeded = true;
      log('STEP 8', `✓ DB seed: ${dbSeed.created} event type(s), ${dbSeed.skipped.length} skipped`);
      try {
        const pay = await syncBarberCalPaymentMode(directUrl, cfg);
        log('STEP 8', `✓ payments: ${pay.mode} on ${pay.updated} event type(s)`);
      } catch (e) {
        log('STEP 8', `payment metadata skipped (${e.message})`);
      }
    } catch (e) {
      log('STEP 8', `DB seed skipped (${e.message}) — run add:barber-events after Cal signup`);
    }
  }
  if (!seeded && apiKey) {
    const sync = await syncBarberCalEventTypes(calBase, apiKey, cfg.name, cfg.services);
    if (!sync.ok) {
      log('STEP 8', sync.unauthorized ? sync.message : `⚠ ${sync.message}`);
    } else {
      for (const row of sync.created ?? []) {
        log('STEP 8', `✓ event type ${row.slug} → id ${row.id}`);
      }
      for (const slug of sync.skipped ?? []) {
        log('STEP 8', `skip (exists): ${slug}`);
      }
    }
  } else if (!seeded) {
    log(
      'STEP 8',
      'After Cal onboarding: RAILWAY_API_TOKEN=… npm run add:barber-events -- <config.json>',
    );
  }

  log('STEP 9', `Redeploying ${calName} and ${siteName}…`);
  await redeployService(calSvc.id, environmentId);
  await redeployService(siteSvc.id, environmentId);
  log('STEP 9', '✓ redeploy triggered');

  console.log(`
══════════════════════════════════════════════════
  Project:     ${cfg.name}
  Website:     ${siteBase}
  Calendar:    ${calBase}
  API:         private (${apiName})
  DB:          private (${dbName})
  Setup:       ${barberSetupWizardUrl(siteBase, setupWizardSecret)}
  NFC /card:   ${barberNfcCardUrl({ siteOrigin: siteBase, staffAppOrigin: staffAppBase || null })}
  Next:        Finish setup wizard; program NFC; first /card visit registers passkey (Barry Levine flow)
══════════════════════════════════════════════════`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
