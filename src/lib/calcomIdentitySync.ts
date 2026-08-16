/**
 * Push REΛVE install identity (icon, username, email, name) onto Cal.com.
 *
 * Two paths, both sourced from the always-on `reave` node:
 *  1. Railway references on calcom-web-app (`${{ reave.EMAIL_FROM }}`, …)
 *     — wizard apply, or pickup when the sibling appears later.
 *  2. Cal.com `users` row (avatar / username / email / name) so the
 *     personal onboarding form is already filled. Stock Cal.com does not
 *     read a username/avatar env var.
 */
import pg from 'pg';
import { railwayListVariables, railwayResolveScope, railwaySetVariables } from './railwayAgentApi';
import { isRailwayConfigured } from './railwayClient';
import { DEPLOY_APP_SERVICE, railwayLocalRef, railwayRef } from './deployWizardCatalog';
import { resolveInstallIdentity, type InstallIdentity } from './installIdentity';
import { createLogger } from './logger';
import { serverEnv } from './serverEnv';

const log = createLogger('calcom-identity');

const CALCOM_WEB = 'calcom-web-app';
const CALCOM_POSTGRES = 'calcom-postgres';

export type CalcomIdentitySyncResult = {
  ok: boolean;
  identity: InstallIdentity;
  railway?: { updated: string[]; skipped: string[] };
  profile?: { updated: boolean; userId?: number; reason?: string };
  error?: string;
};

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;
let _lastAt = 0;

const PICKUP_INTERVAL_MS = 15 * 60_000;

function serviceNames(services: Array<{ name: string }>): Set<string> {
  return new Set(services.map((s) => s.name.trim()));
}

function hasService(names: Set<string>, id: string): boolean {
  if (names.has(id)) return true;
  for (const name of names) {
    if (name.toLowerCase() === id.toLowerCase()) return true;
  }
  return false;
}

async function ensureVars(
  service: string | undefined,
  desired: Record<string, string>,
  existing: Record<string, string>,
  project?: string,
): Promise<{ updated: string[]; skipped: string[] }> {
  const missing: Record<string, string> = {};
  const skipped: string[] = [];
  for (const [name, value] of Object.entries(desired)) {
    if (!value) {
      skipped.push(name);
      continue;
    }
    if (existing[name]?.trim()) {
      skipped.push(name);
      continue;
    }
    missing[name] = value;
  }
  if (!Object.keys(missing).length) return { updated: [], skipped };
  const result = await railwaySetVariables({
    project,
    service,
    variables: missing,
    skip_deploys: true,
  });
  if (!result.ok) throw new Error(result.error);
  return { updated: result.updated, skipped };
}

async function applyRailwayIdentity(
  identity: InstallIdentity,
  project?: string,
): Promise<{ updated: string[]; skipped: string[] } | { error: string }> {
  if (!isRailwayConfigured()) return { error: 'RAILWAY_API_TOKEN is not set' };

  const scope = await railwayResolveScope({ project });
  if (!scope.ok) return { error: scope.error };

  const names = serviceNames(scope.data.services);
  const updated: string[] = [];
  const skipped: string[] = [];

  const appService =
    scope.data.services.find((s) => s.name === DEPLOY_APP_SERVICE)?.name ||
    scope.data.services.find((s) => /reave|astro/i.test(s.name))?.name ||
    DEPLOY_APP_SERVICE;

  const reaveVars = await railwayListVariables({ project, service: appService });
  const reaveExisting = reaveVars.ok ? reaveVars.variables : {};

  const reaveDesired: Record<string, string> = {
    CALCOM_USERNAME: identity.username,
    COMPANY_ICON_URL: `${railwayLocalRef('PUBLIC_SITE_URL')}/api/branding/icon?size=192`,
  };
  if (identity.name && !reaveExisting.EMAIL_FROM_NAME?.trim()) {
    reaveDesired.EMAIL_FROM_NAME = identity.name;
  }
  if (hasService(names, CALCOM_POSTGRES)) {
    reaveDesired.CALCOM_DATABASE_URL = railwayRef(CALCOM_POSTGRES, 'DATABASE_URL');
  }

  const reaveApply = await ensureVars(appService, reaveDesired, reaveExisting, project);
  updated.push(...reaveApply.updated.map((n) => `${appService}.${n}`));
  skipped.push(...reaveApply.skipped.map((n) => `${appService}.${n}`));

  if (!hasService(names, CALCOM_WEB)) {
    return { updated, skipped };
  }

  const calVars = await railwayListVariables({ project, service: CALCOM_WEB });
  const calExisting = calVars.ok ? calVars.variables : {};
  const calDesired: Record<string, string> = {
    EMAIL_FROM: railwayRef(appService, 'EMAIL_FROM'),
    EMAIL_FROM_NAME: railwayRef(appService, 'EMAIL_FROM_NAME'),
    NEXT_PUBLIC_APP_NAME: railwayRef(appService, 'EMAIL_FROM_NAME'),
    NEXT_PUBLIC_COMPANY_NAME: railwayRef(appService, 'EMAIL_FROM_NAME'),
    NEXT_PUBLIC_SUPPORT_MAIL_ADDRESS: railwayRef(appService, 'EMAIL_FROM'),
  };
  const calApply = await ensureVars(CALCOM_WEB, calDesired, calExisting, project);
  updated.push(...calApply.updated.map((n) => `${CALCOM_WEB}.${n}`));
  skipped.push(...calApply.skipped.map((n) => `${CALCOM_WEB}.${n}`));

  return { updated, skipped };
}

type UserRow = { id: number; username: string | null; email: string | null; name: string | null };

async function resolveCalcomDatabaseUrl(project?: string): Promise<string | null> {
  const local = serverEnv('CALCOM_DATABASE_URL')?.trim();
  if (local) return local;
  if (!isRailwayConfigured()) return null;

  for (const service of [CALCOM_WEB, CALCOM_POSTGRES]) {
    const listed = await railwayListVariables({ project, service });
    if (!listed.ok) continue;
    const url = listed.variables.DATABASE_URL?.trim() || listed.variables.DATABASE_PUBLIC_URL?.trim();
    if (url) return url;
  }
  return null;
}

async function syncCalcomUserProfile(
  identity: InstallIdentity,
  project?: string,
): Promise<{ updated: boolean; userId?: number; reason?: string }> {
  if (!identity.username && !identity.email && !identity.name && !identity.iconUrl) {
    return { updated: false, reason: 'install identity is empty' };
  }

  const databaseUrl = await resolveCalcomDatabaseUrl(project);
  if (!databaseUrl) {
    return { updated: false, reason: 'Cal.com database URL not available yet' };
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 1,
  });

  try {
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('users', 'User')`,
    );
    const table = tables.rows.some((r) => r.table_name === 'users')
      ? 'users'
      : tables.rows.some((r) => r.table_name === 'User')
        ? '"User"'
        : null;
    if (!table) return { updated: false, reason: 'Cal.com users table not found' };

    const colRows = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table.replaceAll('"', '')],
    );
    const cols = new Set(colRows.rows.map((r) => r.column_name));
    if (!cols.has('id')) return { updated: false, reason: 'Cal.com users table has no id' };

    const users = await pool.query<UserRow>(`SELECT id, username, email, name FROM ${table} ORDER BY id ASC LIMIT 20`);
    if (!users.rows.length) {
      return { updated: false, reason: 'no Cal.com user yet — finish signup once, then REΛVE fills the profile' };
    }

    const emailLc = identity.email.toLowerCase();
    const match =
      users.rows.find((u) => u.username && u.username === identity.username) ||
      users.rows.find((u) => u.email && u.email.toLowerCase() === emailLc) ||
      users.rows[0];
    if (!match) return { updated: false, reason: 'no Cal.com user to update' };

    const sets: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: string) => {
      if (!value || !cols.has(column.replaceAll('"', ''))) return;
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    add('username', identity.username);
    add('name', identity.name);
    add('email', identity.email);
    if (cols.has('avatarUrl')) add('"avatarUrl"', identity.iconUrl);
    else if (cols.has('avatar')) add('avatar', identity.iconUrl);

    if (!sets.length) return { updated: false, userId: match.id, reason: 'no matching columns' };

    const already =
      (identity.username ? match.username === identity.username : true) &&
      (identity.name ? match.name === identity.name : true) &&
      (identity.email ? (match.email || '').toLowerCase() === emailLc : true);
    if (already && !identity.iconUrl) {
      return { updated: false, userId: match.id, reason: 'already matches' };
    }

    values.push(match.id);
    await pool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    return { updated: true, userId: match.id };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function syncCalcomIdentityFromReave(opts?: {
  force?: boolean;
  request?: Request;
  project?: string;
}): Promise<CalcomIdentitySyncResult> {
  const identity = await resolveInstallIdentity(opts?.request);
  const now = Date.now();
  if (!opts?.force && now - _lastAt < 60_000) {
    return { ok: true, identity, profile: { updated: false, reason: 'throttled' } };
  }
  if (_running) {
    return { ok: true, identity, profile: { updated: false, reason: 'already running' } };
  }

  _running = true;
  try {
    let railway: CalcomIdentitySyncResult['railway'];
    try {
      const applied = await applyRailwayIdentity(identity, opts?.project);
      if ('error' in applied) {
        railway = { updated: [], skipped: [] };
        if (applied.error !== 'RAILWAY_API_TOKEN is not set') {
          log.warn('railway identity apply skipped', { error: applied.error });
        }
      } else {
        railway = applied;
        if (applied.updated.length) {
          log.info('railway identity refs', { updated: applied.updated });
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.warn('railway identity apply failed', { error: message });
      railway = { updated: [], skipped: [] };
    }

    const profile = await syncCalcomUserProfile(identity, opts?.project);
    _lastAt = Date.now();
    if (profile.updated) log.info('calcom user profile updated', { userId: profile.userId });
    return { ok: true, identity, railway, profile };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log.warn('calcom identity sync failed', { error });
    return { ok: false, identity, error };
  } finally {
    _running = false;
  }
}

export function ensureCalcomIdentityScheduler(): void {
  if (_timer) return;
  void syncCalcomIdentityFromReave().catch((e) =>
    log.warn('initial identity sync failed', { error: e instanceof Error ? e.message : String(e) }),
  );
  _timer = setInterval(() => {
    void syncCalcomIdentityFromReave().catch((e) =>
      log.warn('identity sync failed', { error: e instanceof Error ? e.message : String(e) }),
    );
  }, PICKUP_INTERVAL_MS);
}
