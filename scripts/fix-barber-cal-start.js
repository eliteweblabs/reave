#!/usr/bin/env node
/**
 * Cal.com on Railway must use the image entrypoint (/calcom/scripts/start.sh).
 * A custom "yarn start" start command crashes with MODULE_NOT_FOUND server.js.
 *
 * Usage:
 *   RAILWAY_API_TOKEN=… npm run fix:barber-cal -- configs/stevendiaz.json
 *   RAILWAY_API_TOKEN=… node scripts/fix-barber-cal-start.js "Steven Diaz" stevendiaz-cal
 */
import { loadBarberConfig } from './barber-config.js';

const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';
const CALCOM_START = '/calcom/scripts/start.sh';

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function token() {
  const t = process.env.RAILWAY_API_TOKEN?.trim();
  if (!t) fail('RAILWAY_API_TOKEN is not set');
  return t;
}

async function gql(query, variables) {
  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
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

async function resolveProject(ref) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(ref);
  if (isUuid) {
    const data = await gql(
      `query($id: String!) {
        project(id: $id) {
          id name
          environments { edges { node { id name } } }
          services { edges { node { id name } } }
        }
      }`,
      { id: ref },
    );
    return data.project;
  }
  const list = await gql(
    `query {
      projects(first: 100, includeDeleted: false) {
        edges { node { id name } }
      }
    }`,
  );
  const needle = ref.toLowerCase();
  const hit = (list.projects?.edges ?? [])
    .map((e) => e.node)
    .find((p) => p.name.toLowerCase() === needle || p.name.toLowerCase().includes(needle));
  if (!hit) fail(`No project matching "${ref}"`);
  const data = await gql(
    `query($id: String!) {
      project(id: $id) {
        id name
        environments { edges { node { id name } } }
        services { edges { node { id name } } }
      }
    }`,
    { id: hit.id },
  );
  return data.project;
}

async function main() {
  let projectRef;
  let serviceName;
  const a = process.argv[2];
  const b = process.argv[3];
  if (a?.endsWith('.json')) {
    const cfg = loadBarberConfig(a, { strict: false });
    projectRef = cfg.name;
    serviceName = `${cfg.slug}-cal`;
  } else {
    projectRef = a;
    serviceName = b || fail('Usage: fix-barber-cal-start.js <config.json> OR <project> <service>');
  }

  const project = await resolveProject(projectRef);
  const env =
    (project.environments?.edges ?? []).map((e) => e.node).find((e) => e.name === 'production') ??
    project.environments?.edges?.[0]?.node;
  const svc = (project.services?.edges ?? [])
    .map((e) => e.node)
    .find((s) => s.name === serviceName);
  if (!env || !svc) fail(`Missing production env or service ${serviceName}`);

  console.log(`[fix] ${project.name} / ${svc.name} → startCommand ${CALCOM_START}`);
  await gql(
    `mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }`,
    {
      serviceId: svc.id,
      environmentId: env.id,
      input: { startCommand: CALCOM_START },
    },
  );
  await gql(
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId: svc.id, environmentId: env.id },
  );
  console.log('[fix] ✓ start command updated and redeploy triggered');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
