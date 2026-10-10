#!/usr/bin/env node
/**
 * Add {slug}-os-db + {slug}-app (Reave staff /card passkey login) to an existing barber Railway project.
 *
 *   RAILWAY_API_TOKEN=… GITHUB_TOKEN=… npm run add:barber-staff-app -- configs/stevendiaz.json
 */
import { randomBytes } from 'node:crypto';
import { loadBarberConfig, fail } from './barber-config.js';
import { barberNfcCardUrl } from '../src/lib/barberSetupWizard.ts';
import { upsertRailwayVars, resolveBarberSiteService } from './barber-railway-env.js';

const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';
const POSTGRES_IMAGE = 'ghcr.io/railwayapp-templates/postgres-ssl:edge';
const POSTGRES_VOLUME = '/var/lib/postgresql/data';
const REAVE_REPO = 'eliteweblabs/reave';

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
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors?.length) {
    fail(body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`);
  }
  return body.data;
}

async function resolveProject(projectRef) {
  const list = await gql(`query {
    projects(first: 100) { edges { node { id name environments { edges { node { id name } } } services { edges { node { id name } } } } } }
  }`);
  const needle = projectRef.toLowerCase();
  const hit = (list.projects?.edges ?? [])
    .map((e) => e.node)
    .find((p) => p.name.toLowerCase() === needle || p.name.toLowerCase().includes(needle));
  if (!hit) fail(`No project matching "${projectRef}"`);
  const env =
    hit.environments?.edges?.map((e) => e.node).find((e) => e.name === 'production') ??
    hit.environments?.edges?.[0]?.node;
  if (!env?.id) fail('No environment');
  return { project: hit, env };
}

async function createPostgres(projectId, environmentId, name, pgPassword) {
  const created = await gql(
    `mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }`,
    { input: { projectId, name, source: { image: POSTGRES_IMAGE } } },
  );
  const svc = created.serviceCreate;
  if (!svc?.id) fail('serviceCreate failed');
  await gql(`mutation($input: VolumeCreateInput!) { volumeCreate(input: $input) { id } }`, {
    input: { projectId, environmentId, serviceId: svc.id, mountPath: POSTGRES_VOLUME },
  });
  await gql(`mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`, {
    input: {
      projectId,
      environmentId,
      serviceId: svc.id,
      name: 'POSTGRES_PASSWORD',
      value: pgPassword,
    },
  });
  await gql(`mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`, {
    input: {
      projectId,
      environmentId,
      serviceId: svc.id,
      name: 'DATABASE_URL',
      value: `postgresql://postgres:${pgPassword}@postgres.railway.internal:5432/railway`,
    },
  });
  return svc;
}

async function createReaveApp(projectId, environmentId, name) {
  const created = await gql(
    `mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }`,
    {
      input: {
        projectId,
        name,
        source: { repo: REAVE_REPO },
        branch: 'main',
      },
    },
  );
  const svc = created.serviceCreate;
  if (!svc?.id) fail('serviceCreate reave app failed');
  return svc;
}

async function ensureDomain(projectId, environmentId, serviceId) {
  const existing = await gql(
    `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
      domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
        serviceDomains { domain }
      }
    }`,
    { projectId, environmentId, serviceId },
  );
  const d = existing.domains?.serviceDomains?.[0]?.domain;
  if (d) return d;
  const created = await gql(
    `mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }`,
    { input: { serviceId, environmentId } },
  );
  return created.serviceDomainCreate?.domain;
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) fail('Usage: add-barber-staff-app.js <config.json>');

  const cfg = loadBarberConfig(configPath, { strict: false });
  const osDbName = `${cfg.slug}-os-db`;
  const appName = `${cfg.slug}-app`;
  const { project, env } = await resolveProject(cfg.name);
  const existing = new Set((project.services?.edges ?? []).map((e) => e.node.name));

  let appDomain;
  if (existing.has(appName)) {
    console.log(`[skip] ${appName} already exists`);
    const svc = project.services.edges.map((e) => e.node).find((s) => s.name === appName);
    appDomain = await ensureDomain(project.id, env.id, svc.id);
  } else {
    if (!existing.has(osDbName)) {
      const pgPassword = randomBytes(24).toString('hex');
      console.log(`[create] ${osDbName}…`);
      await createPostgres(project.id, env.id, osDbName, pgPassword);
    }
    console.log(`[create] ${appName} from ${REAVE_REPO}…`);
    const appSvc = await createReaveApp(project.id, env.id, appName);
    appDomain = await ensureDomain(project.id, env.id, appSvc.id);
    const dbRef = `\${{ ${osDbName}.DATABASE_URL }}`;
    await upsertRailwayVars(project.id, env.id, appSvc.id, {
      INSTALL_CONFIG: 'barber-staff',
      DATABASE_URL: dbRef,
      PUBLIC_SITE_DOMAIN: appDomain,
      COMPANY_NAME: cfg.name,
      COMPANY_SUPPORT_PHONE: cfg.phone?.trim() || '',
      PORT: '4321',
    });
  }

  const appOrigin = `https://${appDomain}`;
  const siteName = `${cfg.slug}-site`;
  const { project: p2, env: e2, svc: siteSvc } = await resolveBarberSiteService(cfg.name, siteName);
  await upsertRailwayVars(p2.id, e2.id, siteSvc.id, {
    PUBLIC_STAFF_APP_URL: appOrigin,
  });

  const siteOrigin =
    cfg.site_webapp_url?.trim() || `https://${cfg.slug}-site-production.up.railway.app`;
  const nfcUrl = barberNfcCardUrl({ siteOrigin, staffAppOrigin: appOrigin });

  console.log(`
Staff app:  ${appOrigin}
NFC /card:  ${nfcUrl}  → opens ${appOrigin}/card (passkey login, same as Barry Levine)

Next:
  1. Set CLERK_* keys on ${appName} (Clerk app for this install).
  2. Open ${appOrigin}/card on your phone — OTP once, then register passkey.
  3. Program NFC to ${nfcUrl}. After passkey, only your phone opens admin; other phones won't get login.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
