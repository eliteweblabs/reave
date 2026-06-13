/**
 * Minimal Railway public GraphQL client (account / workspace token).
 * @see https://docs.railway.com/integrations/api
 */
import { serverEnv } from './serverEnv';

const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';

export type RailwayGqlError = { message: string };

export async function railwayGraphql<T>(opts: {
  query: string;
  variables?: Record<string, unknown>;
}): Promise<
  | { ok: true; data: T }
  | { ok: false; errors: RailwayGqlError[]; status?: number; raw?: string }
> {
  const token = serverEnv('RAILWAY_API_TOKEN')?.trim();
  if (!token) {
    return { ok: false, errors: [{ message: 'RAILWAY_API_TOKEN is not set on this service' }] };
  }

  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: opts.query, variables: opts.variables ?? {} }),
  });

  const raw = await res.text();
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, errors: [{ message: 'Invalid JSON from Railway' }], status: res.status, raw: raw.slice(0, 400) };
  }

  const o = body as { data?: T; errors?: RailwayGqlError[] };
  if (!res.ok) {
    return {
      ok: false,
      errors: o.errors?.length ? o.errors : [{ message: `HTTP ${res.status}` }],
      status: res.status,
      raw: raw.slice(0, 400),
    };
  }
  if (o.errors?.length) {
    return { ok: false, errors: o.errors, status: res.status, raw: raw.slice(0, 400) };
  }
  if (o.data === undefined) {
    return { ok: false, errors: [{ message: 'No data in Railway response' }], raw: raw.slice(0, 400) };
  }
  return { ok: true, data: o.data };
}

export function sanitizeRailwayProjectName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, 64);
  return s;
}

/** Empty Railway project — name only; optional workspace id in input if set in env. */
export async function createRailwayEmptyProject(name: string): Promise<
  | { ok: true; id: string; name: string }
  | { ok: false; message: string }
> {
  const dryRaw = serverEnv('RAILWAY_DRY_RUN');
  const dry = dryRaw === '1' || dryRaw === 'true';
  const clean = sanitizeRailwayProjectName(name);
  if (!clean) {
    return { ok: false, message: 'Project name is empty.' };
  }

  if (dry) {
    return { ok: true, id: '(dry-run)', name: clean };
  }

  const workspaceId = serverEnv('RAILWAY_WORKSPACE_ID')?.trim();
  const prefix = serverEnv('RAILWAY_PROJECT_DESCRIPTION_PREFIX')?.trim();

  const input: Record<string, string> = { name: clean };
  if (prefix) input.description = `${prefix} (via Reave Telegram)`;
  if (workspaceId) input.workspaceId = workspaceId;

  const query = `
    mutation ProjectCreate($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        name
      }
    }
  `;

  const result = await railwayGraphql<{
    projectCreate?: { id: string; name: string } | null;
  }>({ query, variables: { input } });

  if (!result.ok) {
    const msg = result.errors.map((e) => e.message).join('; ') || 'Railway GraphQL error';
    return { ok: false, message: msg };
  }

  const row = result.data.projectCreate;
  if (!row?.id) {
    return { ok: false, message: 'projectCreate returned no id (check workspace / token scope).' };
  }
  return { ok: true, id: row.id, name: row.name };
}
