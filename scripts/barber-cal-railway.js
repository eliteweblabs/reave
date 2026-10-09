/** Cal.com on Railway — same as deploy wizard calcom-web-app (Docker only, no GitHub build). */
export const CALCOM_IMAGE =
  'calcom/cal.com@sha256:ace3bb1219fb7306585ab9f4d94d41af7ee064c343db0498173436bbe857bd49';
export const CALCOM_START = '/calcom/scripts/start.sh';

export const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';

export function railwayToken() {
  const t = process.env.RAILWAY_API_TOKEN?.trim();
  if (!t) throw new Error('RAILWAY_API_TOKEN is not set');
  return t;
}

export async function railwayGql(query, variables) {
  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${railwayToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors?.length) {
    throw new Error(body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`);
  }
  return body.data;
}

export async function resolveBarberCalService(projectRef, serviceName) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(projectRef);
  let projectId = projectRef;
  if (!isUuid) {
    const list = await railwayGql(`query {
      projects(first: 100, includeDeleted: false) { edges { node { id name } } }
    }`);
    const needle = projectRef.toLowerCase();
    const hit = (list.projects?.edges ?? [])
      .map((e) => e.node)
      .find((p) => p.name.toLowerCase() === needle || p.name.toLowerCase().includes(needle));
    if (!hit) throw new Error(`No project matching "${projectRef}"`);
    projectId = hit.id;
  }
  const data = await railwayGql(
    `query($id: String!) {
      project(id: $id) {
        id name
        environments { edges { node { id name } } }
        services { edges { node { id name } } }
      }
    }`,
    { id: projectId },
  );
  const project = data.project;
  const env =
    (project.environments?.edges ?? []).map((e) => e.node).find((e) => e.name === 'production') ??
    project.environments?.edges?.[0]?.node;
  const svc = (project.services?.edges ?? [])
    .map((e) => e.node)
    .find((s) => s.name === serviceName);
  if (!env?.id || !svc?.id) {
    throw new Error(`Missing production env or service "${serviceName}" in ${project.name}`);
  }
  return { project, env, svc };
}
