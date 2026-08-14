/**
 * Scheduled quiet hours ("sleep mode") — pause push, inbound email triage,
 * Anthropic API calls, system-alert agent runs, and other automated processing
 * during the configured window (default 11 PM–7 AM).
 *
 * Owner-initiated Siri Shortcuts set AgentRunContext.bypassSleepMode so audit
 * research, freeform agent prompts, and related Claude calls still run;
 * completion push uses bypassQuietHours. Automated overnight work stays blocked.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { serverEnv } from './serverEnv';

export type PushQuietHoursSettings = {
  /** Master toggle for 11 PM–7 AM-style scheduled quiet hours. */
  sleepModeEnabled: boolean;
  /** Local time HH:MM (24h), inclusive start of quiet window. */
  quietStart: string;
  /** Local time HH:MM (24h), exclusive end of quiet window. */
  quietEnd: string;
  /** IANA timezone, e.g. America/New_York */
  timezone: string;
  /** When true, urgent client-reply pushes still deliver during quiet hours. */
  allowUrgentDuringSleep: boolean;
  /** Set when sleep is manually paused during a quiet window (header toggle off). */
  sleepPausedAt: string | null;
  updatedAt: string | null;
};

const DEFAULTS: PushQuietHoursSettings = {
  sleepModeEnabled: true,
  quietStart: '23:00',
  quietEnd: '07:00',
  timezone: 'America/New_York',
  allowUrgentDuringSleep: true,
  sleepPausedAt: null,
  updatedAt: null,
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS push_quiet_hours (
  id                      INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sleep_mode_enabled      BOOLEAN NOT NULL DEFAULT true,
  quiet_start             TEXT NOT NULL DEFAULT '23:00',
  quiet_end               TEXT NOT NULL DEFAULT '07:00',
  timezone                TEXT NOT NULL DEFAULT 'America/New_York',
  allow_urgent_during_sleep BOOLEAN NOT NULL DEFAULT true,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO push_quiet_hours (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
ALTER TABLE push_quiet_hours ADD COLUMN IF NOT EXISTS sleep_paused_at TIMESTAMPTZ;
`;

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;
let _cached: PushQuietHoursSettings | null | undefined = undefined;
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
  return join(dir, 'src', 'knowledge', 'push-quiet-hours.json');
}

function envDefaults(): Partial<PushQuietHoursSettings> {
  const enabled = serverEnv('PUSH_QUIET_HOURS_ENABLED');
  const start = serverEnv('PUSH_QUIET_START')?.trim();
  const end = serverEnv('PUSH_QUIET_END')?.trim();
  const tz = serverEnv('PUSH_QUIET_TIMEZONE')?.trim();
  const urgent = serverEnv('PUSH_QUIET_ALLOW_URGENT');
  return {
    ...(enabled != null ? { sleepModeEnabled: enabled !== '0' } : {}),
    ...(start && parseHm(start) != null ? { quietStart: normalizeHm(start)! } : {}),
    ...(end && parseHm(end) != null ? { quietEnd: normalizeHm(end)! } : {}),
    ...(tz ? { timezone: tz } : {}),
    ...(urgent != null ? { allowUrgentDuringSleep: urgent !== '0' } : {}),
  };
}

export function normalizeHm(raw: string): string | null {
  const s = raw.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseHm(raw: string): number | null {
  const norm = normalizeHm(raw);
  if (!norm) return null;
  const [h, m] = norm.split(':').map(Number);
  return h * 60 + m;
}

function localMinutesInTimezone(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? NaN);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

export function isWithinQuietWindow(
  settings: Pick<PushQuietHoursSettings, 'quietStart' | 'quietEnd' | 'timezone'>,
  now: Date = new Date(),
): boolean {
  const cur = localMinutesInTimezone(now, settings.timezone);
  const start = parseHm(settings.quietStart);
  const end = parseHm(settings.quietEnd);
  if (cur == null || start == null || end == null) return false;
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

function normalizeSettings(raw: unknown): PushQuietHoursSettings {
  const base = { ...DEFAULTS, ...envDefaults() };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const bool = (k: string, fallback: boolean) =>
    typeof o[k] === 'boolean' ? o[k] : fallback;
  const start = typeof o.quietStart === 'string' ? normalizeHm(o.quietStart) : null;
  const end = typeof o.quietEnd === 'string' ? normalizeHm(o.quietEnd) : null;
  const tz = typeof o.timezone === 'string' && o.timezone.trim() ? o.timezone.trim() : base.timezone;
  return {
    sleepModeEnabled: bool('sleepModeEnabled', base.sleepModeEnabled),
    quietStart: start ?? base.quietStart,
    quietEnd: end ?? base.quietEnd,
    timezone: tz,
    allowUrgentDuringSleep: bool('allowUrgentDuringSleep', base.allowUrgentDuringSleep),
    sleepPausedAt: coerceTimestamp(o.sleepPausedAt),
    updatedAt: coerceTimestamp(o.updatedAt),
  };
}

/** pg returns timestamptz as Date; JSON/file settings use ISO strings. */
function coerceTimestamp(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value.trim());
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function readFileSettings(): PushQuietHoursSettings {
  try {
    const path = settingsFilePath();
    if (!existsSync(path)) return normalizeSettings(null);
    return normalizeSettings(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return normalizeSettings(null);
  }
}

function writeFileSettings(settings: PushQuietHoursSettings): boolean {
  try {
    const path = settingsFilePath();
    mkdirSync(dirname(path), { recursive: true });
    const payload = { ...settings, updatedAt: new Date().toISOString() };
    writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[push-quiet-hours] file write failed', e);
    return false;
  }
}

async function readPgSettings(): Promise<PushQuietHoursSettings | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const { rows } = await pool.query<{
    sleep_mode_enabled: boolean;
    quiet_start: string;
    quiet_end: string;
    timezone: string;
    allow_urgent_during_sleep: boolean;
    sleep_paused_at: string | null;
    updated_at: string;
  }>(`SELECT sleep_mode_enabled, quiet_start, quiet_end, timezone, allow_urgent_during_sleep, sleep_paused_at, updated_at
      FROM push_quiet_hours WHERE id = 1`);
  const row = rows[0];
  if (!row) return null;
  return normalizeSettings({
    sleepModeEnabled: row.sleep_mode_enabled,
    quietStart: row.quiet_start,
    quietEnd: row.quiet_end,
    timezone: row.timezone,
    allowUrgentDuringSleep: row.allow_urgent_during_sleep,
    sleepPausedAt: row.sleep_paused_at,
    updatedAt: row.updated_at,
  });
}

async function writePgSettings(settings: PushQuietHoursSettings): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) return false;
  await pool.query(
    `INSERT INTO push_quiet_hours (id, sleep_mode_enabled, quiet_start, quiet_end, timezone, allow_urgent_during_sleep, sleep_paused_at, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (id) DO UPDATE SET
       sleep_mode_enabled = EXCLUDED.sleep_mode_enabled,
       quiet_start = EXCLUDED.quiet_start,
       quiet_end = EXCLUDED.quiet_end,
       timezone = EXCLUDED.timezone,
       allow_urgent_during_sleep = EXCLUDED.allow_urgent_during_sleep,
       sleep_paused_at = EXCLUDED.sleep_paused_at,
       updated_at = now()`,
    [
      settings.sleepModeEnabled,
      settings.quietStart,
      settings.quietEnd,
      settings.timezone,
      settings.allowUrgentDuringSleep,
      settings.sleepPausedAt,
    ],
  );
  return true;
}

async function readRawPushQuietHoursSettings(): Promise<PushQuietHoursSettings> {
  const fromPg = databaseUrl() ? await readPgSettings() : null;
  return fromPg ?? readFileSettings();
}

/**
 * Overnight header-toggle pauses expire when the quiet window ends.
 * Permanent disables (Settings unchecked outside the window) leave
 * sleepModeEnabled false with sleepPausedAt null and are left alone.
 */
async function resumeExpiredOvernightPause(
  settings: PushQuietHoursSettings,
): Promise<PushQuietHoursSettings> {
  if (settings.sleepModeEnabled || !settings.sleepPausedAt) return settings;
  if (isWithinQuietWindow(settings)) return settings;

  const resumed: PushQuietHoursSettings = {
    ...settings,
    sleepModeEnabled: true,
    sleepPausedAt: null,
    updatedAt: new Date().toISOString(),
  };
  const ok = databaseUrl() ? await writePgSettings(resumed) : writeFileSettings(resumed);
  return ok ? resumed : { ...settings, sleepPausedAt: null };
}

export async function getPushQuietHoursSettings(): Promise<PushQuietHoursSettings> {
  const now = Date.now();
  if (_cached && now - _cacheAt < CACHE_MS) return _cached;
  let settings = await resumeExpiredOvernightPause(await readRawPushQuietHoursSettings());
  _cached = settings;
  _cacheAt = now;
  return settings;
}

export function invalidatePushQuietHoursCache(): void {
  _cached = undefined;
  _cacheAt = 0;
}

export async function savePushQuietHoursSettings(
  patch: Partial<
    Pick<
      PushQuietHoursSettings,
      'sleepModeEnabled' | 'quietStart' | 'quietEnd' | 'timezone' | 'allowUrgentDuringSleep'
    >
  >,
): Promise<PushQuietHoursSettings | null> {
  // Read raw so a daytime Settings save cannot wipe sleepPausedAt that
  // getPushQuietHoursSettings would otherwise strip/resume first.
  const cur = await readRawPushQuietHoursSettings();
  const nowIso = new Date().toISOString();
  let sleepPausedAt = cur.sleepPausedAt;
  let sleepModeEnabled = cur.sleepModeEnabled;
  if (patch.sleepModeEnabled !== undefined) {
    sleepModeEnabled = patch.sleepModeEnabled;
    if (patch.sleepModeEnabled) {
      sleepPausedAt = null;
    } else {
      // Header toggle only appears in-window → overnight pause with timestamp.
      // Unchecking Enable sleep mode outside the window is a permanent disable.
      const nextSchedule = {
        quietStart:
          patch.quietStart !== undefined
            ? (normalizeHm(patch.quietStart) ?? cur.quietStart)
            : cur.quietStart,
        quietEnd:
          patch.quietEnd !== undefined
            ? (normalizeHm(patch.quietEnd) ?? cur.quietEnd)
            : cur.quietEnd,
        timezone:
          patch.timezone !== undefined && patch.timezone.trim()
            ? patch.timezone.trim()
            : cur.timezone,
      };
      sleepPausedAt = isWithinQuietWindow(nextSchedule) ? nowIso : null;
    }
  }
  const next: PushQuietHoursSettings = {
    ...cur,
    sleepModeEnabled,
    ...(patch.quietStart !== undefined
      ? { quietStart: normalizeHm(patch.quietStart) ?? cur.quietStart }
      : {}),
    ...(patch.quietEnd !== undefined
      ? { quietEnd: normalizeHm(patch.quietEnd) ?? cur.quietEnd }
      : {}),
    ...(patch.timezone !== undefined && patch.timezone.trim()
      ? { timezone: patch.timezone.trim() }
      : {}),
    ...(patch.allowUrgentDuringSleep !== undefined
      ? { allowUrgentDuringSleep: patch.allowUrgentDuringSleep }
      : {}),
    sleepPausedAt,
    updatedAt: nowIso,
  };

  const ok = databaseUrl() ? await writePgSettings(next) : writeFileSettings(next);
  if (!ok) return null;
  invalidatePushQuietHoursCache();
  return next;
}

/** True when sleep mode is enabled and the current time is inside the quiet window. */
export async function isSleepModeActive(opts?: { now?: Date }): Promise<boolean> {
  const settings = await getPushQuietHoursSettings();
  if (!settings.sleepModeEnabled) return false;
  return isWithinQuietWindow(settings, opts?.now ?? new Date());
}

export async function sleepModeStatus(opts?: {
  now?: Date;
}): Promise<{ active: boolean; settings: PushQuietHoursSettings; label: string }> {
  const settings = await getPushQuietHoursSettings();
  const label = formatQuietHoursLabel(settings);
  const active = settings.sleepModeEnabled && isWithinQuietWindow(settings, opts?.now ?? new Date());
  return { active, settings, label };
}

/** User-facing explanation when automated work is blocked overnight. */
export async function sleepModeBlockMessage(opts?: { now?: Date }): Promise<string> {
  const { label } = await sleepModeStatus(opts);
  return `Sleep mode is active (${label}). Inbound mail, AI calls, and automated alerts resume when the quiet window ends. Adjust times in Administration → Settings → Sleep mode.`;
}

export async function isPushQuietHoursActive(opts?: {
  bypassQuietHours?: boolean;
  urgent?: boolean;
  now?: Date;
}): Promise<boolean> {
  if (opts?.bypassQuietHours) return false;
  return isSleepModeActive({ now: opts?.now });
}

export function formatQuietHoursLabel(settings: PushQuietHoursSettings): string {
  const fmt = (hm: string) => {
    const [h, m] = hm.split(':').map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  return `${fmt(settings.quietStart)} – ${fmt(settings.quietEnd)}`;
}

/** Human-readable quiet-hours end time for sleep-mode UI ("Sleeping until 7:00 AM"). */
export function formatQuietEndLabel(settings: Pick<PushQuietHoursSettings, 'quietEnd'>): string {
  const [h, m] = settings.quietEnd.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * When sleep is paused overnight — time the owner flipped the header toggle
 * ("Awake since 11:04 PM"). Returns null when there is no pause timestamp
 * (permanent disable) so the UI does not fake quietStart as an awake time.
 */
export function formatAwakeSinceLabel(settings: PushQuietHoursSettings): string | null {
  if (!settings.sleepPausedAt) return null;
  const d = new Date(settings.sleepPausedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: settings.timezone,
  });
}
