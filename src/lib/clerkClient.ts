/**
 * Clerk Backend API client.
 *
 * Backend API — https://api.clerk.com/v1  (per-app, requires CLERK_SECRET_KEY)
 * Clerk does not allow system-level access. Clerk Pro does not provide a platform key.
 */
import { clerkProxyUrlFromEnv, clerkProxyUrlsEqual, isClerkProxyOptOut, normalizeClerkProxyUrl } from './clerkProxyUrl';
import { serverEnv } from './serverEnv';

const CLERK_API_BASE = 'https://api.clerk.com/v1';

/** Canonical + Clerk-dashboard / Next.js aliases operators paste onto Railway. */
export const CLERK_PUBLISHABLE_KEY_NAMES = [
  'PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
] as const;

export const CLERK_SECRET_KEY_NAMES = [
  'CLERK_SECRET_KEY',
  'CLERK_BACKEND_API_KEY',
  'CLERK_SECRET',
] as const;

function firstClerkEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = serverEnv(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

export function clerkPublishableKey(): string | undefined {
  return firstClerkEnv(CLERK_PUBLISHABLE_KEY_NAMES);
}

export function clerkSecretKey(): string | undefined {
  return firstClerkEnv(CLERK_SECRET_KEY_NAMES);
}

/**
 * Copy alias values onto the names @clerk/astro reads.
 * Uses dynamic `process.env[name]` so Vite cannot inline empty PUBLIC_ keys
 * from a Docker build that did not see Railway runtime variables.
 */
export function normalizeClerkRuntimeEnv(): void {
  if (typeof process === 'undefined' || !process.env) return;
  const publishable = clerkPublishableKey();
  const secret = clerkSecretKey();
  if (publishable && !process.env['PUBLIC_CLERK_PUBLISHABLE_KEY']?.trim()) {
    process.env['PUBLIC_CLERK_PUBLISHABLE_KEY'] = publishable;
  }
  if (secret && !process.env['CLERK_SECRET_KEY']?.trim()) {
    process.env['CLERK_SECRET_KEY'] = secret;
  }
  const proxy = clerkProxyUrlFromEnv();
  if (proxy) {
    process.env['PUBLIC_CLERK_PROXY_URL'] = proxy;
  } else if (isClerkProxyOptOut(process.env['PUBLIC_CLERK_PROXY_URL'])) {
    delete process.env['PUBLIC_CLERK_PROXY_URL'];
  }
}

normalizeClerkRuntimeEnv();

// ─── key helpers ─────────────────────────────────────────────────────────────

export function isClerkConfigured(): boolean {
  return Boolean(clerkSecretKey());
}

export function isClerkFrontendConfigured(): boolean {
  return Boolean(clerkPublishableKey());
}

/** Both Clerk keys needed before clerkMiddleware can hydrate a request. */
export function isClerkRuntimeConfigured(): boolean {
  return isClerkConfigured() && isClerkFrontendConfigured();
}

export function isClerkPlatformConfigured(): boolean {
  return Boolean(serverEnv('CLERK_PLATFORM_KEY')?.trim());
}

function secretKey(): string | null {
  return clerkSecretKey() || null;
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

// ─── System-level app APIs (Clerk does not allow these) ──────────────────────

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

type ClerkDomainRow = {
  id?: string;
  name?: string;
  is_satellite?: boolean;
  proxy_url?: string | null;
};

function clerkApiErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const rec = body as Record<string, unknown>;
    if (typeof rec.message === 'string' && rec.message.trim()) return rec.message;
    const errors = rec.errors;
    if (Array.isArray(errors) && errors.length) {
      const first = errors[0];
      if (first && typeof first === 'object') {
        const row = first as Record<string, unknown>;
        const long = typeof row.long_message === 'string' ? row.long_message : '';
        const short = typeof row.message === 'string' ? row.message : '';
        if (long || short) return long || short;
      }
    }
  }
  return `Clerk API error ${status}`;
}

export function clerkDomainRows(body: unknown): ClerkDomainRow[] {
  if (!body || typeof body !== 'object') return [];
  const rec = body as Record<string, unknown>;
  const data = rec.data ?? rec.domains ?? body;
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is ClerkDomainRow => Boolean(row) && typeof row === 'object');
}

/**
 * Point the production Clerk domain at this install's `/__clerk` proxy.
 * Clerk validates the URL before saving; failures are non-fatal.
 */
export async function clerkEnsureDomainProxy(proxyUrl: string): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
}> {
  if (!secretKey()) {
    return { ok: false, skipped: true, error: 'CLERK_SECRET_KEY not configured' };
  }
  if (clerkPublishableKey()?.startsWith('pk_test_')) {
    return { ok: true, skipped: true };
  }
  const wanted = normalizeClerkProxyUrl(proxyUrl);
  if (!wanted) return { ok: false, skipped: true, error: 'empty proxy URL' };

  const listed = await backendGet('/domains');
  if (!listed.ok) {
    return { ok: false, error: clerkApiErrorMessage(listed.body, listed.status) };
  }
  const rows = clerkDomainRows(listed.body);
  const primary = rows.find((row) => row.is_satellite === false) ?? rows[0];
  if (!primary?.id) {
    return { ok: false, error: 'no Clerk domain to attach a proxy URL' };
  }
  if (clerkProxyUrlsEqual(primary.proxy_url, wanted)) {
    return { ok: true, skipped: true };
  }
  const patched = await backendPatch(`/domains/${primary.id}`, { proxy_url: wanted });
  if (!patched.ok) {
    return { ok: false, error: clerkApiErrorMessage(patched.body, patched.status) };
  }
  return { ok: true };
}
