#!/usr/bin/env node
/**
 * Repair stevendiaz-cal (or any {slug}-cal) when Railway is building from GitHub.
 * Cal must be the prebuilt Docker image — same as reave.app calcom-web-app.
 *
 * Usage:
 *   RAILWAY_API_TOKEN=… npm run fix:barber-cal -- configs/stevendiaz.json
 */
import { loadBarberConfig } from './barber-config.js';
import {
  CALCOM_IMAGE,
  CALCOM_START,
  railwayGql,
  resolveBarberCalService,
} from './barber-cal-railway.js';

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) fail('Usage: fix-barber-cal.js <config.json>');

  let projectRef;
  let serviceName;
  if (arg.endsWith('.json')) {
    const cfg = loadBarberConfig(arg, { strict: false });
    projectRef = cfg.name;
    serviceName = `${cfg.slug}-cal`;
  } else {
    projectRef = arg;
    serviceName = process.argv[3] || fail('Pass config.json or "<project>" "<service>"');
  }

  const { project, env, svc } = await resolveBarberCalService(projectRef, serviceName);

  const inst = await railwayGql(
    `query($serviceId: String!, $environmentId: String!) {
      serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
        source { repo image }
        startCommand
      }
    }`,
    { serviceId: svc.id, environmentId: env.id },
  );
  const source = inst.serviceInstance?.source;
  console.log(`[fix] ${project.name} / ${svc.name}`);
  console.log(`[fix] current source: repo=${source?.repo ?? '(none)'} image=${source?.image ?? '(none)'}`);
  console.log(`[fix] current start: ${inst.serviceInstance?.startCommand ?? '(default)'}`);

  if (source?.repo) {
    console.log('[fix] disconnecting GitHub source (Cal must not build from repo)…');
    await railwayGql(
      `mutation($id: String!) { serviceDisconnect(id: $id) { id } }`,
      { id: svc.id },
    );
  }

  console.log(`[fix] connecting Docker image ${CALCOM_IMAGE.slice(0, 40)}…`);
  await railwayGql(
    `mutation($id: String!, $input: ServiceConnectInput!) {
      serviceConnect(id: $id, input: $input) { id name }
    }`,
    { id: svc.id, input: { image: CALCOM_IMAGE } },
  );

  console.log(`[fix] startCommand → ${CALCOM_START}`);
  await railwayGql(
    `mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }`,
    {
      serviceId: svc.id,
      environmentId: env.id,
      input: { startCommand: CALCOM_START },
    },
  );

  console.log('[fix] redeploy…');
  await railwayGql(
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId: svc.id, environmentId: env.id },
  );

  console.log('[fix] ✓ Cal should pull the image (no yarn install build). Watch Deployments → SUCCESS.');
}

main().catch((e) => {
  fail(e.message || String(e));
});
