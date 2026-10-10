/**
 * Railway variable upserts for barber install services.
 */
import { railwayGql, resolveBarberCalService } from './barber-cal-railway.js';

export async function upsertRailwayVar(projectId, environmentId, serviceId, name, value) {
  await railwayGql(
    `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
    {
      input: { projectId, environmentId, serviceId, name, value },
    },
  );
}

export async function upsertRailwayVars(projectId, environmentId, serviceId, vars) {
  for (const [name, value] of Object.entries(vars)) {
    if (value === undefined || value === null) continue;
    await upsertRailwayVar(projectId, environmentId, serviceId, name, String(value));
  }
}

export async function resolveBarberSiteService(projectRef, serviceName) {
  return resolveBarberCalService(projectRef, serviceName);
}
