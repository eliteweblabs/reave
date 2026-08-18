/**
 * Clerk Backend + Platform API client.
 *
 * Backend API  — https://api.clerk.com/v1  (per-app, requires CLERK_SECRET_KEY)
 * Platform API — https://api.clerk.com/v1/applications (multi-app management,
 *                requires CLERK_PLATFORM_KEY — Pro/Enterprise only)
 *
 * When only CLERK_SECRET_KEY is set, multi-app Platform API calls will fail
 * gracefully with a user-friendly message so the agent can explain the plan
 * tier limitation.
 */
import { serverEnv } from './serverEnv';

const CLERK_API_BASE = 'https://api.clerk.com/v1';

// ─── key helpers ─────────────────────────────────────────────────────────────

export function isClerkConfigured(): boolean {
  return Boolean(
    serverEnv('CLERK_SECRET_KEY')?.trim() || serverEnv('CLERK_PLATFORM_KEY')?.trim(),
  );
}

export function isClerkPlatformConfigured(): boolean {
  return Boolean(serverEnv('CLERK_PLATFORM_KEY')?.trim());
}

function secretKey(): string | null {
  return serverEnv('CLERK_SECRET_KEY')?.trim() || null;
}

function platformKey(): string | null {
  return serverEnv('CLERK_PLATFORM_KEY')?.trim() || null;
}

// ─── low-level fetch helpers ──────────────────────────────────────────────────

async function clerkFetch(
  path: string,
  key: string,
  opts: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${CLERK_API_BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

async function backendGet(path: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = secretKey();
  if (!key) return { ok: false, status: 401, body: { error: 'CLERK_SECRET_KEY not configured' } };
  return clerkFetch(path, key);
}

async function backendPost(
  path: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = secretKey();
  if (!key) return { ok: false, status: 401, body: { error: 'CLERK_SECRET_KEY not configured' } };
  return clerkFetch(path, key, { method: 'POST', body: JSON.stringify(data) });
}

async function backendPatch(
  path: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = secretKey();
  if (!key) return { ok: false, status: 401, body: { error: 'CLERK_SECRET_KEY not configured' } };
  return clerkFetch(path, key, { method: 'PATCH', body: JSON.stringify(data) });
}

async function backendDelete(path: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = secretKey();
  if (!key) return { ok: false, status: 401, body: { error: 'CLERK_SECRET_KEY not configured' } };
  return clerkFetch(path, key, { method: 'DELETE' });
}

async function platformGet(path: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = platformKey();
  if (!key)
    return {
      ok: false,
      status: 401,
      body: {
        error:
          'Clerk does not allow system level access.',
      },
    };
  return clerkFetch(path, key);
}

async function platformPost(
  path: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = platformKey();
  if (!key)
    return {
      ok: false,
      status: 401,
      body: {
        error:
          'Clerk does not allow system level access.',
      },
    };
  return clerkFetch(path, key, { method: 'POST', body: JSON.stringify(data) });
}

async function platformDelete(
  path: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const key = platformKey();
  if (!key)
    return {
      ok: false,
      status: 401,
      body: {
        error:
          'Clerk does not allow system level access.',
      },
    };
  return clerkFetch(path, key, { method: 'DELETE' });
}

// ─── types ───────────────────────────────────────────────────────────────────

export type ClerkApp = {
  id: string;
  name: string;
  slug?: string;
  plan?: string;
  created_at?: number;
};

export type ClerkAppKeys = {
  publishable_key: string;
  secret_key?: string; // redacted in some responses
};

export type ClerkUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: Array<{ email_address: string; id: string }>;
  phone_numbers: Array<{ phone_number: string; id: string }>;
  created_at: number;
  last_sign_in_at: number | null;
  locked: boolean;
};

export type ClerkOrganization = {
  id: string;
  name: string;
  slug: string;
  members_count: number;
  created_at: number;
};

export type ClerkSession = {
  id: string;
  user_id: string;
  status: string;
  created_at: number;
  last_active_at: number | null;
  expire_at: number | null;
};

// ─── Platform API — multi-app management (Pro/Enterprise) ────────────────────

/** List all Clerk applications on the Platform account. */
export async function clerkListApps(): Promise<{ ok: boolean; apps?: ClerkApp[]; error?: string }> {
  const r = await platformGet('/applications');
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.error ??
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  const data = r.body as Record<string, unknown>;
  const apps = (data.applications ?? data.data ?? data) as ClerkApp[];
  return { ok: true, apps: Array.isArray(apps) ? apps : [] };
}

/** Create a new Clerk application (requires Platform key). Returns app + keys. */
export async function clerkCreateApp(
  name: string,
  opts: { plan?: string } = {},
): Promise<{ ok: boolean; app?: ClerkApp; keys?: ClerkAppKeys; error?: string }> {
  const r = await platformPost('/applications', { name, ...opts });
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.error ??
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  const data = r.body as Record<string, unknown>;
  const app = (data.application ?? data) as ClerkApp;
  const keys = (data.keys ?? data) as ClerkAppKeys;
  return { ok: true, app, keys };
}

/** Get keys for an existing Clerk app (requires Platform key). */
export async function clerkGetAppKeys(
  appId: string,
): Promise<{ ok: boolean; keys?: ClerkAppKeys; error?: string }> {
  const r = await platformGet(`/applications/${appId}/keys`);
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.error ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true, keys: r.body as ClerkAppKeys };
}

/** Delete a Clerk application (requires Platform key). */
export async function clerkDeleteApp(
  appId: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await platformDelete(`/applications/${appId}`);
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.error ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true };
}

// ─── Backend API — per-app user/org/session management ───────────────────────

/** List users in the current Clerk app (uses CLERK_SECRET_KEY). */
export async function clerkListUsers(opts: {
  limit?: number;
  offset?: number;
  query?: string;
  order_by?: string;
}): Promise<{ ok: boolean; users?: ClerkUser[]; total?: number; error?: string }> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  if (opts.query) params.set('query', opts.query);
  if (opts.order_by) params.set('order_by', opts.order_by);
  const r = await backendGet(`/users?${params.toString()}`);
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  const users = Array.isArray(r.body) ? (r.body as ClerkUser[]) : [];
  return { ok: true, users, total: users.length };
}

/** Get a single user by id. */
export async function clerkGetUser(
  userId: string,
): Promise<{ ok: boolean; user?: ClerkUser; error?: string }> {
  const r = await backendGet(`/users/${userId}`);
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true, user: r.body as ClerkUser };
}

/** Create a user in the current Clerk app. */
export async function clerkCreateUser(opts: {
  email_address?: string[];
  phone_number?: string[];
  first_name?: string;
  last_name?: string;
  password?: string;
  skip_password_checks?: boolean;
  public_metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; user?: ClerkUser; error?: string }> {
  const r = await backendPost('/users', opts);
  if (!r.ok) {
    const errors = (r.body as Record<string, unknown>)?.errors;
    const msg = Array.isArray(errors)
      ? (errors[0] as Record<string, unknown>)?.message
      : (r.body as Record<string, unknown>)?.message ?? `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true, user: r.body as ClerkUser };
}

/** Update a user in the current Clerk app. */
export async function clerkUpdateUser(
  userId: string,
  opts: {
    first_name?: string;
    last_name?: string;
    public_metadata?: Record<string, unknown>;
    private_metadata?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; user?: ClerkUser; error?: string }> {
  const r = await backendPatch(`/users/${userId}`, opts);
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true, user: r.body as ClerkUser };
}

/** Delete a user from the current Clerk app. */
export async function clerkDeleteUser(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await backendDelete(`/users/${userId}`);
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true };
}

/** Ban a user (block sign-in). */
export async function clerkBanUser(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await backendPost(`/users/${userId}/ban`, {});
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true };
}

/** Unban a previously banned user. */
export async function clerkUnbanUser(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await backendPost(`/users/${userId}/unban`, {});
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true };
}

/** List active sessions in the current Clerk app. */
export async function clerkListSessions(opts: {
  limit?: number;
  status?: string;
  user_id?: string;
}): Promise<{ ok: boolean; sessions?: ClerkSession[]; error?: string }> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.status) params.set('status', opts.status);
  if (opts.user_id) params.set('user_id', opts.user_id);
  const r = await backendGet(`/sessions?${params.toString()}`);
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  const sessions = Array.isArray(r.body) ? (r.body as ClerkSession[]) : [];
  return { ok: true, sessions };
}

/** Revoke a session. */
export async function clerkRevokeSession(
  sessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await backendPost(`/sessions/${sessionId}/revoke`, {});
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true };
}

/** List organizations in the current Clerk app. */
export async function clerkListOrganizations(opts: {
  limit?: number;
  query?: string;
}): Promise<{ ok: boolean; organizations?: ClerkOrganization[]; total?: number; error?: string }> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.query) params.set('query', opts.query);
  const r = await backendGet(`/organizations?${params.toString()}`);
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  const data = r.body as Record<string, unknown>;
  const orgs = (data.data ?? r.body) as ClerkOrganization[];
  return { ok: true, organizations: Array.isArray(orgs) ? orgs : [], total: data.total_count as number };
}

/** Create an organization in the current Clerk app. */
export async function clerkCreateOrganization(opts: {
  name: string;
  slug?: string;
  created_by?: string;
  public_metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; organization?: ClerkOrganization; error?: string }> {
  const r = await backendPost('/organizations', opts);
  if (!r.ok) {
    const errors = (r.body as Record<string, unknown>)?.errors;
    const msg = Array.isArray(errors)
      ? (errors[0] as Record<string, unknown>)?.message
      : (r.body as Record<string, unknown>)?.message ?? `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true, organization: r.body as ClerkOrganization };
}

/** Get instance/app status info (uses CLERK_SECRET_KEY). */
export async function clerkGetInstanceStatus(): Promise<{
  ok: boolean;
  instance?: Record<string, unknown>;
  error?: string;
}> {
  const r = await backendGet('/instance');
  if (!r.ok) {
    const msg =
      (r.body as Record<string, unknown>)?.message ??
      `Clerk API error ${r.status}`;
    return { ok: false, error: String(msg) };
  }
  return { ok: true, instance: r.body as Record<string, unknown> };
}
