/**
 * Install-wide admin settings (OTP TTL, recently viewed window, etc.) —
 * Postgres with JSON file fallback.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { serverEnv } from './serverEnv';

export type AppSettings = {
  /** Minutes until verification-code inbox rows auto-delete. 0 disables. */
  otpTtlMinutes: number;
  /** Days a project stays in Recently Viewed after an admin open or client portal dwell. */
  recentlyViewedDays: number;
  /**
   * When true, first open of a tracked portal/share link opens a system chat
   * suggesting follow-up. Default off.
   */
  shareOpenChatAlerts: boolean;
  updatedAt: string | null;
};

const DEFAULT_OTP_TTL_MINUTES = 5;
const DEFAULT_RECENTLY_VIEWED_DAYS = 7;
const DEFAULT_SHARE_OPEN_CHAT_ALERTS = false;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (
  id                     INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  otp_ttl_minutes        INT NOT NULL DEFAULT 5,
  recently_viewed_days   INT NOT NULL DEFAULT 7,
  share_open_chat_alerts BOOLEAN NOT NULL DEFAULT false,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS recently_viewed_days INT NOT NULL DEFAULT 7;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS share_open_chat_alerts BOOLEAN NOT NULL DEFAULT false;
INSERT INTO app_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
`;

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;
let _cached: AppSettings | null | undefined = undefined;
let _cacheAt = 0;
const CACHE_MS = 5000;

function databaseUrl(): string | undefined {
  return serverEnv('DATABASE_URL')?.trim() || undefined;
}

function poolSsl(url: string): pg.ConnectionConfig['ssl'] {
  if (/sslmode=(require|verify-full|verify-ca)/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function getPool(): pg.Pool | null {
  if (_pool !== undefined) return _pool;
  const url = databaseUrl();
  if (!url) {
    _pool = null;
    return null;
  }
  _pool = new pg.Pool({ connectionString: url, ssl: poolSsl(url), max: 5 });
  return _pool;
}

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        _schemaReady = null;
        throw e;
      });
  }
  await _schemaReady;
  return pool;
}

function settingsFilePath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) break;
    dir = dirname(dir);
  }
  return join(dir, 'src', 'knowledge', 'app-settings.json');
}

/** Clamp TTL: 0 = disabled, otherwise 1–1440 minutes. */
export function clampOtpTtlMinutes(raw: unknown, fallback = DEFAULT_OTP_TTL_MINUTES): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0;
  return Math.max(1, Math.min(Math.round(n), 1440));
}

/** Clamp recently-viewed window to 1–365 days. */
export function clampRecentlyViewedDays(
  raw: unknown,
  fallback = DEFAULT_RECENTLY_VIEWED_DAYS,
): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.round(n), 365));
}

export function coerceShareOpenChatAlerts(
  raw: unknown,
  fallback = DEFAULT_SHARE_OPEN_CHAT_ALERTS,
): boolean {
  if (typeof raw === 'boolean') return raw;
  if (raw === 1 || raw === '1' || raw === 'true' || raw === 'on') return true;
  if (raw === 0 || raw === '0' || raw === 'false' || raw === 'off') return false;
  return fallback;
}

function envDefaultOtpTtl(): number {
  const raw = serverEnv('EMAIL_OTP_TTL_MINUTES');
  if (raw == null || raw === '') return DEFAULT_OTP_TTL_MINUTES;
  return clampOtpTtlMinutes(raw, DEFAULT_OTP_TTL_MINUTES);
}

function normalizeSettings(raw: unknown): AppSettings {
  const base: AppSettings = {
    otpTtlMinutes: envDefaultOtpTtl(),
    recentlyViewedDays: DEFAULT_RECENTLY_VIEWED_DAYS,
    shareOpenChatAlerts: DEFAULT_SHARE_OPEN_CHAT_ALERTS,
    updatedAt: null,
  };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  return {
    otpTtlMinutes:
      o.otpTtlMinutes !== undefined
        ? clampOtpTtlMinutes(o.otpTtlMinutes, base.otpTtlMinutes)
        : base.otpTtlMinutes,
    recentlyViewedDays:
      o.recentlyViewedDays !== undefined
        ? clampRecentlyViewedDays(o.recentlyViewedDays, base.recentlyViewedDays)
        : base.recentlyViewedDays,
    shareOpenChatAlerts:
      o.shareOpenChatAlerts !== undefined
        ? coerceShareOpenChatAlerts(o.shareOpenChatAlerts, base.shareOpenChatAlerts)
        : base.shareOpenChatAlerts,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : null,
  };
}

function readFileSettings(): AppSettings {
  const path = settingsFilePath();
  if (!existsSync(path)) return normalizeSettings(null);
  try {
    return normalizeSettings(JSON.parse(readFileSync(path, 'utf8')));
  } catch (e) {
    console.warn('[app-settings] file read failed', e);
    return normalizeSettings(null);
  }
}

function writeFileSettings(settings: AppSettings): boolean {
  try {
    const path = settingsFilePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    return true;
  } catch (e) {
    console.error('[app-settings] file write failed', e);
    return false;
  }
}

async function readPgSettings(): Promise<AppSettings | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query(
      `SELECT otp_ttl_minutes, recently_viewed_days, share_open_chat_alerts, updated_at
       FROM app_settings WHERE id = 1`,
    );
    const row = rows[0] as
      | {
          otp_ttl_minutes?: number;
          recently_viewed_days?: number;
          share_open_chat_alerts?: boolean;
          updated_at?: Date | string;
        }
      | undefined;
    if (!row) return null;
    return normalizeSettings({
      otpTtlMinutes: row.otp_ttl_minutes,
      recentlyViewedDays: row.recently_viewed_days,
      shareOpenChatAlerts: row.share_open_chat_alerts,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    });
  } catch (e) {
    console.error('[app-settings] pg read failed', e);
    return null;
  }
}

async function writePgSettings(settings: AppSettings): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) return false;
  await pool.query(
    `INSERT INTO app_settings (
       id, otp_ttl_minutes, recently_viewed_days, share_open_chat_alerts, updated_at
     )
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET
       otp_ttl_minutes = EXCLUDED.otp_ttl_minutes,
       recently_viewed_days = EXCLUDED.recently_viewed_days,
       share_open_chat_alerts = EXCLUDED.share_open_chat_alerts,
       updated_at = now()`,
    [settings.otpTtlMinutes, settings.recentlyViewedDays, settings.shareOpenChatAlerts],
  );
  return true;
}

export function invalidateAppSettingsCache(): void {
  _cached = undefined;
  _cacheAt = 0;
}

export async function getAppSettings(): Promise<AppSettings> {
  const now = Date.now();
  if (_cached && now - _cacheAt < CACHE_MS) return _cached;
  const fromPg = databaseUrl() ? await readPgSettings() : null;
  const settings = fromPg ?? readFileSettings();
  _cached = settings;
  _cacheAt = now;
  return settings;
}

/** Resolved OTP auto-delete TTL in minutes (0 = disabled). */
export async function getOtpTtlMinutes(): Promise<number> {
  const settings = await getAppSettings();
  return settings.otpTtlMinutes;
}

/** Days a project stays in Recently Viewed after last edit. */
export async function getRecentlyViewedDays(): Promise<number> {
  const settings = await getAppSettings();
  return settings.recentlyViewedDays;
}

/** Whether portal/share first-open creates a follow-up chat alert. */
export async function getShareOpenChatAlerts(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.shareOpenChatAlerts;
}

export async function saveAppSettings(
  patch: Partial<
    Pick<AppSettings, 'otpTtlMinutes' | 'recentlyViewedDays' | 'shareOpenChatAlerts'>
  >,
): Promise<AppSettings | null> {
  const cur = await getAppSettings();
  const next: AppSettings = {
    otpTtlMinutes:
      patch.otpTtlMinutes !== undefined
        ? clampOtpTtlMinutes(patch.otpTtlMinutes, cur.otpTtlMinutes)
        : cur.otpTtlMinutes,
    recentlyViewedDays:
      patch.recentlyViewedDays !== undefined
        ? clampRecentlyViewedDays(patch.recentlyViewedDays, cur.recentlyViewedDays)
        : cur.recentlyViewedDays,
    shareOpenChatAlerts:
      patch.shareOpenChatAlerts !== undefined
        ? coerceShareOpenChatAlerts(patch.shareOpenChatAlerts, cur.shareOpenChatAlerts)
        : cur.shareOpenChatAlerts,
    updatedAt: new Date().toISOString(),
  };
  const ok = databaseUrl() ? await writePgSettings(next) : writeFileSettings(next);
  if (!ok) return null;
  invalidateAppSettingsCache();
  return next;
}
