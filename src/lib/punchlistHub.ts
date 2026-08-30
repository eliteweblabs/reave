/**
 * Cross-install punch-list hub.
 *
 * Official reave.app verifies incoming items with REAVE_HUB_SECRET (or
 * REAVE_HUB_KEY). Client installs send that same key plus their install slug.
 * Both sides open the same Punch list admin section; items also land on the
 * official to-do list.
 */

import { getCompanyConfig, headerSafe } from './companyConfig';
import { installConfigSlug, isCanonicalReaveInstall } from './installConfig';
import { secretMatches } from './secretCompare';
import { serverEnv } from './serverEnv';
import {
  installPunchlistUid,
  isInstallPunchlistTodo,
  normalizeInstallSlug,
  punchlistTitleFromInput,
  toHubPunchlistItem,
  type HubPunchlistItem,
} from './punchlist';
import {
  isTodoDbConfigured,
  storeCreateTodo,
  storeDeleteTodo,
  storeListTodos,
  storeReadTodo,
  storeUpdateTodo,
  type TodoStatus,
} from './todoStore';
import { recordPunchlistItemEngagement } from './engagementNotifications';

export const DEFAULT_REAVE_HUB_URL = 'https://reave.app';

export type PunchlistHubIdentity = {
  slug: string;
  company: string;
};

export function punchlistHubUrl(): string {
  const raw = serverEnv('REAVE_HUB_URL')?.trim() || DEFAULT_REAVE_HUB_URL;
  return raw.replace(/\/+$/, '');
}

export function punchlistHubOutboundKey(): string {
  return (serverEnv('REAVE_HUB_KEY') || serverEnv('REAVE_HUB_SECRET') || '').trim();
}

export function punchlistHubExpectedSecret(): string {
  return (serverEnv('REAVE_HUB_SECRET') || serverEnv('REAVE_HUB_KEY') || '').trim();
}

export function isPunchlistHubHost(): boolean {
  return isCanonicalReaveInstall();
}

export function isPunchlistHubReady(): boolean {
  return isPunchlistHubHost() && Boolean(punchlistHubExpectedSecret()) && isTodoDbConfigured();
}

export function isPunchlistHubClientConfigured(): boolean {
  return !isPunchlistHubHost() && Boolean(punchlistHubOutboundKey());
}

export async function localPunchlistIdentity(request?: Request): Promise<PunchlistHubIdentity> {
  const slug = normalizeInstallSlug(installConfigSlug());
  const company = (await getCompanyConfig(request)).name.trim() || slug;
  return { slug, company };
}

function headerValue(request: Request, name: string): string {
  return request.headers.get(name)?.trim() || '';
}

export function punchlistHubAuthFromRequest(request: Request): {
  slug: string;
  key: string;
  company: string;
} {
  const bearer = headerValue(request, 'authorization').replace(/^Bearer\s+/i, '');
  const slug = normalizeInstallSlug(
    headerValue(request, 'x-install-slug') || headerValue(request, 'x-reave-install-slug'),
  );
  const key =
    headerValue(request, 'x-install-key') ||
    headerValue(request, 'x-reave-install-key') ||
    bearer;
  const company = headerValue(request, 'x-install-name') || headerValue(request, 'x-reave-install-name');
  return { slug, key, company };
}

export function verifyPunchlistHubAuth(request: Request):
  | { ok: true; slug: string; company: string }
  | { ok: false; status: number; error: string } {
  if (!isPunchlistHubHost()) {
    return { ok: false, status: 404, error: 'Not found' };
  }
  const expected = punchlistHubExpectedSecret();
  if (!expected) {
    return { ok: false, status: 503, error: 'Punch-list hub is not configured' };
  }
  const { slug, key, company } = punchlistHubAuthFromRequest(request);
  if (!slug) return { ok: false, status: 400, error: 'Missing install slug' };
  if (!secretMatches(key, expected)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true, slug, company: company.trim() || slug };
}

export function hubPunchlistContactUid(slug: string): string {
  return installPunchlistUid(slug);
}

export async function listHubPunchlistForSlug(slug: string): Promise<HubPunchlistItem[]> {
  const uid = hubPunchlistContactUid(slug);
  if (!uid) return [];
  const todos = await storeListTodos({ contact_uid: uid });
  return todos.map(toHubPunchlistItem);
}

/** Official admin: every install-owner request, all slugs. */
export async function listOfficialPunchlistItems(): Promise<HubPunchlistItem[]> {
  const todos = await storeListTodos({ shared: true });
  return todos.map(toHubPunchlistItem);
}

export async function updateOfficialPunchlistItem(opts: {
  id: number;
  title?: string;
  status?: TodoStatus;
}): Promise<{ ok: true; item: HubPunchlistItem } | { ok: false; status: number; error: string }> {
  const todo = await storeReadTodo(opts.id);
  if (!todo || !isInstallPunchlistTodo(todo)) {
    return { ok: false, status: 404, error: 'Not found' };
  }
  const patch: { title?: string; status?: TodoStatus } = {};
  if (opts.title !== undefined) {
    const title = punchlistTitleFromInput(opts.title);
    if (!title) return { ok: false, status: 400, error: 'title is required' };
    patch.title = title;
  }
  if (opts.status) patch.status = opts.status;
  if (patch.title == null && patch.status == null) {
    return { ok: false, status: 400, error: 'Nothing to update' };
  }
  const result = await storeUpdateTodo(opts.id, patch);
  if (!result.ok) {
    const status = result.error === 'Not found' ? 404 : 400;
    return { ok: false, status, error: result.error };
  }
  return { ok: true, item: toHubPunchlistItem(result.todo) };
}

export async function deleteOfficialPunchlistItem(
  id: number,
): Promise<{ ok: true; id: number } | { ok: false; status: number; error: string }> {
  const todo = await storeReadTodo(id);
  if (!todo || !isInstallPunchlistTodo(todo)) {
    return { ok: false, status: 404, error: 'Not found' };
  }
  const result = await storeDeleteTodo(id);
  if (!result.ok) {
    return { ok: false, status: result.error === 'Not found' ? 404 : 400, error: result.error || 'Delete failed' };
  }
  return { ok: true, id };
}

export async function createHubPunchlistItem(opts: {
  slug: string;
  company: string;
  title: unknown;
}): Promise<{ ok: true; item: HubPunchlistItem } | { ok: false; error: string }> {
  const title = punchlistTitleFromInput(opts.title);
  if (!title) return { ok: false, error: 'title is required' };
  const slug = normalizeInstallSlug(opts.slug);
  const uid = hubPunchlistContactUid(slug);
  if (!uid) return { ok: false, error: 'Invalid install slug' };
  const company = opts.company.trim() || slug;
  const result = await storeCreateTodo({
    title,
    contact_uid: uid,
    contact_name: company,
    created_by: 'install',
  });
  if (!result.ok) return result;
  void recordPunchlistItemEngagement({
    contactUid: uid,
    contactName: company,
    title: result.todo.title,
    todoId: result.todo.id,
  });
  return { ok: true, item: toHubPunchlistItem(result.todo) };
}

export async function updateHubPunchlistItem(opts: {
  slug: string;
  id: number;
  title?: string;
  status?: TodoStatus;
}): Promise<{ ok: true; item: HubPunchlistItem } | { ok: false; status: number; error: string }> {
  const uid = hubPunchlistContactUid(opts.slug);
  const todo = await storeReadTodo(opts.id);
  if (!todo || todo.contact_uid !== uid) {
    return { ok: false, status: 404, error: 'Not found' };
  }
  const patch: { title?: string; status?: TodoStatus } = {};
  if (opts.title !== undefined) {
    const title = punchlistTitleFromInput(opts.title);
    if (!title) return { ok: false, status: 400, error: 'title is required' };
    patch.title = title;
  }
  if (opts.status) patch.status = opts.status;
  if (patch.title == null && patch.status == null) {
    return { ok: false, status: 400, error: 'Nothing to update' };
  }
  const result = await storeUpdateTodo(opts.id, patch);
  if (!result.ok) {
    const status = result.error === 'Not found' ? 404 : 400;
    return { ok: false, status, error: result.error };
  }
  return { ok: true, item: toHubPunchlistItem(result.todo) };
}

export async function deleteHubPunchlistItem(opts: {
  slug: string;
  id: number;
}): Promise<{ ok: true; id: number } | { ok: false; status: number; error: string }> {
  const uid = hubPunchlistContactUid(opts.slug);
  const todo = await storeReadTodo(opts.id);
  if (!todo || todo.contact_uid !== uid) {
    return { ok: false, status: 404, error: 'Not found' };
  }
  const result = await storeDeleteTodo(opts.id);
  if (!result.ok) {
    return { ok: false, status: result.error === 'Not found' ? 404 : 400, error: result.error || 'Delete failed' };
  }
  return { ok: true, id: opts.id };
}

export async function fetchPunchlistHub<T>(
  path: string,
  init?: RequestInit & { company?: string; slug?: string },
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; error: string }> {
  const key = punchlistHubOutboundKey();
  if (!key) return { ok: false, status: 503, error: 'Punch list is not connected. Set REAVE_HUB_KEY.' };
  const identity = await localPunchlistIdentity();
  const { company: companyOverride, slug: slugOverride, ...reqInit } = init ?? {};
  const slug = slugOverride || identity.slug;
  const company = companyOverride || identity.company;
  if (!slug) return { ok: false, status: 500, error: 'This install has no slug.' };
  const url = `${punchlistHubUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      ...reqInit,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Install-Slug': slug,
        'X-Install-Key': key,
        'X-Install-Name': headerSafe(company).slice(0, 200),
        ...(reqInit.headers || {}),
      },
    });
    const data = (await res.json().catch(() => null)) as T & { error?: string; ok?: boolean };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (data && typeof data === 'object' && data.error) || `Hub error ${res.status}`,
      };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 502, error: `Could not reach reave hub: ${msg}` };
  }
}
