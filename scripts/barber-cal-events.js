/**
 * Cal.com v1 event types for barber install configs.
 */

export function defaultCalWebappUrl(slug) {
  return `https://${slug}-cal-production.up.railway.app`;
}

/**
 * @param {string} webappUrl
 * @param {string} apiKey
 * @param {string} barberName
 * @param {Array<{ name: string; slug: string; duration: number; price: number }>} services
 * @param {{ skipExisting?: boolean }} [opts]
 */
export async function syncBarberCalEventTypes(webappUrl, apiKey, barberName, services, opts = {}) {
  const skipExisting = opts.skipExisting !== false;
  const base = webappUrl.replace(/\/$/, '');
  const q = `apiKey=${encodeURIComponent(apiKey)}`;
  const headers = { 'Content-Type': 'application/json' };

  const listRes = await fetch(`${base}/api/v1/event-types?${q}`, { headers });
  if (listRes.status === 401) {
    return {
      ok: false,
      unauthorized: true,
      message:
        'Cal.com API 401. Open your Calendar URL → Settings → Developer → API Keys, create a key, then CALCOM_API_KEY=… npm run add:barber-events -- configs/your-barber.json',
    };
  }
  if (!listRes.ok) {
    const t = await listRes.text();
    return {
      ok: false,
      message: `GET /api/v1/event-types failed (${listRes.status}): ${t.slice(0, 200)}`,
    };
  }

  const listJson = await listRes.json();
  const existingList = listJson.event_types ?? listJson.data ?? listJson ?? [];
  const existingSlugs = new Set(
    (Array.isArray(existingList) ? existingList : [])
      .map((et) => et.slug)
      .filter(Boolean),
  );

  const created = [];
  const skipped = [];

  for (const svc of services) {
    if (skipExisting && existingSlugs.has(svc.slug)) {
      skipped.push(svc.slug);
      continue;
    }
    const body = {
      title: svc.name,
      slug: svc.slug,
      length: svc.duration,
      price: svc.price,
      currency: 'usd',
      description: `${barberName} — ${svc.duration} min`,
    };
    const res = await fetch(`${base}/api/v1/event-types?${q}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      return {
        ok: false,
        message: `POST event type "${svc.slug}" failed (${res.status}): ${t.slice(0, 200)}`,
        created,
        skipped,
      };
    }
    const json = await res.json();
    const id = json.event_type?.id ?? json.id ?? json.data?.id;
    created.push({ slug: svc.slug, id: id ?? '?' });
  }

  return { ok: true, created, skipped, webappUrl: base };
}

const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';

/**
 * Read NEXT_PUBLIC_WEBAPP_URL from {slug}-cal on a Railway project (by name or id).
 */
export async function resolveCalWebappFromRailway(cfg) {
  const token = process.env.RAILWAY_API_TOKEN?.trim();
  if (!token) return null;

  const projectRef = cfg.railway_project_id?.trim() || cfg.name?.trim();
  const calService = `${cfg.slug}-cal`;
  if (!projectRef) return null;

  async function gql(query, variables) {
    const res = await fetch(RAILWAY_GRAPHQL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.json();
    if (!res.ok || body.errors?.length) return null;
    return body.data;
  }

  const isUuid = /^[0-9a-f-]{36}$/i.test(projectRef);
  let projectId = projectRef;
  if (!isUuid) {
    const data = await gql(
      `query($after: String) {
        projects(first: 100, after: $after, includeDeleted: false) {
          edges { node { id name } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after: undefined },
    );
    const needle = projectRef.toLowerCase();
    const hit = (data?.projects?.edges ?? [])
      .map((e) => e.node)
      .find((p) => p.name.toLowerCase() === needle || p.name.toLowerCase().includes(needle));
    if (!hit) return null;
    projectId = hit.id;
  }

  const proj = await gql(
    `query($id: String!) {
      project(id: $id) {
        environments { edges { node { id name } } }
        services { edges { node { id name } } }
      }
    }`,
    { id: projectId },
  );
  const env =
    (proj?.project?.environments?.edges ?? [])
      .map((e) => e.node)
      .find((e) => e.name.toLowerCase() === 'production') ??
    proj?.project?.environments?.edges?.[0]?.node;
  const svc = (proj?.project?.services?.edges ?? [])
    .map((e) => e.node)
    .find((s) => s.name === calService);
  if (!env?.id || !svc?.id) return null;

  const vars = await gql(
    `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { projectId, environmentId: env.id, serviceId: svc.id },
  );
  const url = vars?.variables?.NEXT_PUBLIC_WEBAPP_URL?.trim();
  return url || null;
}

export function resolveCalWebappUrl(cfg) {
  const fromEnv = process.env.CALCOM_WEBAPP_URL?.trim();
  if (fromEnv) return fromEnv;
  if (cfg.cal_webapp_url?.trim()) return cfg.cal_webapp_url.trim();
  return defaultCalWebappUrl(cfg.slug);
}
