/**
 * Dismissible admin push alerts — mirrors phone notifications on the dashboard.
 * Postgres (DATABASE_URL) when set; otherwise JSON under src/knowledge/.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { getPgPool } from './pgPool';
import { workSlugFromAdminUrl } from './notificationFormat';
import { isReusablePushAlertTag } from './pushNotificationIdentity';

export type PushAlertKind =
  | 'uptime'
  | 'email'
  | 'system'
  | 'comment'
  | 'engagement'
  | 'otp'
  | 'auth_link'
  | 'triage'
  | 'calendar'
  | 'critical';

export type PushAlert = {
  id: string;
  tag: string;
  kind: PushAlertKind;
  title: string;
  detail: string;
  url: string;
  createdAt: string;
  staffAckAt: string | null;
  /** Optional action button ids from the matching email rule. */
  actions?: string[];
};

export type CreatePushAlertInput = {
  tag?: string;
  kind?: PushAlertKind;
  title: string;
  detail?: string;
  url?: string;
  /** When set, used instead of now() — e.g. uptime incident created_at for backfill. */
  createdAt?: string;
  actions?: string[];
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admin_push_alerts (
  id            TEXT PRIMARY KEY,
  tag           TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'system',
  title         TEXT NOT NULL,
  detail        TEXT NOT NULL DEFAULT '',
  url           TEXT NOT NULL DEFAULT '/admin?tab=dashboard',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  staff_ack_at  TIMESTAMPTZ
);
ALTER TABLE admin_push_alerts ADD COLUMN IF NOT EXISTS actions JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS admin_push_alerts_pending_idx
  ON admin_push_alerts (staff_ack_at, created_at DESC);
`;

const PENDING_TAG_UNIQUE_SQL = [
  `UPDATE admin_push_alerts a
      SET staff_ack_at = now()
    FROM admin_push_alerts b
    WHERE a.staff_ack_at IS NULL
      AND b.staff_ack_at IS NULL
      AND a.tag <> ''
      AND a.tag NOT IN ('inbox', 'reave-badge-sync')
      AND a.tag = b.tag
      AND (a.created_at > b.created_at OR (a.created_at = b.created_at AND a.id > b.id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS admin_push_alerts_pending_tag_uidx
     ON admin_push_alerts (tag)
     WHERE staff_ack_at IS NULL AND tag <> '' AND tag NOT IN ('inbox', 'reave-badge-sync')`,
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'push-alerts.json');
const MAX_FILE_ALERTS = 2000;
const DEFAULT_MAX_AGE_DAYS = 14;

let _schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = (async () => {
      await pool.query(SCHEMA_SQL);
      for (const sql of PENDING_TAG_UNIQUE_SQL) {
        await pool.query(sql).catch((e) => {
          console.warn('[push-alerts] pending-tag unique index skipped', e);
        });
      }
    })().catch((e) => {
      _schemaReady = null;
      throw e;
    });
  }
  await _schemaReady;
  return pool;
}

function readFileAlerts(): PushAlert[] {
  try {
    if (!existsSync(FILE_PATH)) return [];
    const parsed = JSON.parse(readFileSync(FILE_PATH, 'utf8'));
    return Array.isArray(parsed) ? (parsed as PushAlert[]) : [];
  } catch {
    return [];
  }
}

function writeFileAlerts(alerts: PushAlert[]): void {
  mkdirSync(dirname(FILE_PATH), { recursive: true });
  writeFileSync(FILE_PATH, JSON.stringify(alerts.slice(0, MAX_FILE_ALERTS), null, 2), 'utf8');
}

function normalizeAlertActions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String).map((s) => s.trim()).filter(Boolean);
}

function rowToAlert(row: {
  id: string;
  tag: string;
  kind: string;
  title: string;
  detail: string;
  url: string;
  created_at: Date | string;
  staff_ack_at: Date | string | null;
  actions?: unknown;
}): PushAlert {
  const actions = normalizeAlertActions(row.actions);
  return {
    id: row.id,
    tag: row.tag,
    kind: (row.kind as PushAlertKind) || 'system',
    title: row.title,
    detail: row.detail,
    url: row.url,
    createdAt: new Date(row.created_at).toISOString(),
    staffAckAt: row.staff_ack_at ? new Date(row.staff_ack_at).toISOString() : null,
    ...(actions.length ? { actions } : {}),
  };
}

function cutoffIso(maxAgeDays: number): string {
  const days = Math.max(1, Math.min(maxAgeDays, 90));
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Durable-recall phone pushes — never mirrored as dashboard review cards. */
export function isMemoryPushAlertTag(tag: string): boolean {
  return String(tag || '').toLowerCase().startsWith('memory-');
}

export function inferPushAlertKind(tag: string, url: string): PushAlertKind {
  const t = tag.toLowerCase();
  const u = url.toLowerCase();
  if (t.startsWith('calendar-reminder-') || t.startsWith('calendar-') || u.includes('tab=schedule')) {
    return 'calendar';
  }
  if (t.startsWith('otp-')) return 'otp';
  if (t.startsWith('auth-')) return 'auth_link';
  if (t.startsWith('triage-')) return 'triage';
  if (t.startsWith('uptime-') || t.startsWith('watch-')) return 'uptime';
  if (t.startsWith('project-comment-')) return 'comment';
  if (t.startsWith('vault-') || t.startsWith('share-open-') || t.startsWith('deck-view-')) {
    return 'engagement';
  }
  if (t.startsWith('critical-') || t.startsWith('demo-request-')) return 'critical';
  if (t.startsWith('memory-')) return 'system';
  if (t.startsWith('email-') || u.includes('tab=email')) return 'email';
  return 'system';
}

export async function storeFindPendingPushAlertByTag(tag: string): Promise<PushAlert | null> {
  const alert = await storeFindPushAlertByTag(tag);
  return alert && !alert.staffAckAt ? alert : null;
}

/** Find any alert (pending or dismissed) for a tag within the retention window. */
export async function storeFindPushAlertByTag(tag: string): Promise<PushAlert | null> {
  const trimmed = tag.trim().slice(0, 120);
  if (!trimmed) return null;
  const cutoff = cutoffIso(DEFAULT_MAX_AGE_DAYS);

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query<{
        id: string;
        tag: string;
        kind: string;
        title: string;
        detail: string;
        url: string;
        created_at: Date | string;
        staff_ack_at: Date | string | null;
      }>(
        `SELECT id, tag, kind, title, detail, url, created_at, staff_ack_at
         FROM admin_push_alerts
         WHERE tag = $1 AND created_at >= $2::timestamptz
         ORDER BY created_at DESC
         LIMIT 1`,
        [trimmed, cutoff],
      );
      return rows[0] ? rowToAlert(rows[0]) : null;
    }
  } catch (e) {
    console.warn('[push-alerts] postgres find failed', e);
  }

  const cutoffMs = new Date(cutoff).getTime();
  return (
    readFileAlerts().find(
      (a) => a.tag === trimmed && new Date(a.createdAt).getTime() >= cutoffMs,
    ) ?? null
  );
}

export type EnsuredPushAlert = { alert: PushAlert; created: boolean };

async function insertPushAlert(input: CreatePushAlertInput): Promise<PushAlert | null> {
  const id = randomUUID();
  const tag = (input.tag ?? 'inbox').slice(0, 120);
  const kind = input.kind ?? inferPushAlertKind(tag, input.url ?? '');
  const title = input.title.trim().slice(0, 120);
  const detail = (input.detail ?? '').trim().slice(0, 240);
  const url = (input.url ?? '/admin?tab=dashboard').slice(0, 500);
  const createdAt = input.createdAt?.trim() || new Date().toISOString();
  const actions = normalizeAlertActions(input.actions);

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query<{
        id: string;
        tag: string;
        kind: string;
        title: string;
        detail: string;
        url: string;
        created_at: Date | string;
        staff_ack_at: Date | string | null;
        actions: unknown;
      }>(
        `INSERT INTO admin_push_alerts (id, tag, kind, title, detail, url, created_at, actions)
         VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::jsonb)
         RETURNING id, tag, kind, title, detail, url, created_at, staff_ack_at, actions`,
        [id, tag, kind, title, detail, url, createdAt, JSON.stringify(actions)],
      );
      return rows[0] ? rowToAlert(rows[0]) : null;
    }
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
    if (code === '23505') return null;
    console.warn('[push-alerts] postgres create failed', e);
    return null;
  }

  const alert: PushAlert = {
    id,
    tag,
    kind,
    title,
    detail,
    url,
    createdAt,
    staffAckAt: null,
    ...(actions.length ? { actions } : {}),
  };
  const alerts = readFileAlerts();
  alerts.unshift(alert);
  writeFileAlerts(alerts);
  return alert;
}

/** Reuse a pending dashboard alert with the same tag instead of inserting another. */
export async function storeEnsurePushAlert(
  input: CreatePushAlertInput,
): Promise<EnsuredPushAlert | null> {
  const tag = (input.tag ?? 'inbox').slice(0, 120);
  if (isReusablePushAlertTag(tag)) {
    const existing = await storeFindPendingPushAlertByTag(tag);
    if (existing) return { alert: existing, created: false };
  }
  const created = await insertPushAlert(input);
  if (!created) {
    if (isReusablePushAlertTag(tag)) {
      const existing = await storeFindPendingPushAlertByTag(tag);
      if (existing) return { alert: existing, created: false };
    }
    return null;
  }
  return { alert: created, created: true };
}

export async function storeCreatePushAlert(input: CreatePushAlertInput): Promise<PushAlert | null> {
  const ensured = await storeEnsurePushAlert(input);
  return ensured?.alert ?? null;
}

export async function storeListPendingPushAlerts(opts?: {
  limit?: number;
  maxAgeDays?: number;
}): Promise<PushAlert[]> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 50, 200));
  const cutoff = cutoffIso(opts?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS);

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query<{
        id: string;
        tag: string;
        kind: string;
        title: string;
        detail: string;
        url: string;
        created_at: Date | string;
        staff_ack_at: Date | string | null;
        actions: unknown;
      }>(
        `SELECT id, tag, kind, title, detail, url, created_at, staff_ack_at, actions
         FROM admin_push_alerts
         WHERE staff_ack_at IS NULL AND created_at >= $1::timestamptz
         ORDER BY created_at DESC
         LIMIT $2`,
        [cutoff, limit],
      );
      return rows.map(rowToAlert);
    }
  } catch (e) {
    console.warn('[push-alerts] postgres list failed', e);
  }

  return readFileAlerts()
    .filter((a) => !a.staffAckAt && a.createdAt >= cutoff)
    .slice(0, limit);
}

export async function storeCountPendingPushAlerts(opts?: { maxAgeDays?: number }): Promise<number> {
  const cutoff = cutoffIso(opts?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS);

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM admin_push_alerts
         WHERE staff_ack_at IS NULL AND created_at >= $1::timestamptz`,
        [cutoff],
      );
      return Number(rows[0]?.count ?? 0);
    }
  } catch (e) {
    console.warn('[push-alerts] postgres count failed', e);
  }

  return readFileAlerts().filter((a) => !a.staffAckAt && a.createdAt >= cutoff).length;
}

/** Dismiss all pending dashboard alerts whose tag matches (e.g. inbox email id). */
export async function storeAckPushAlertByTag(tag: string): Promise<number> {
  const trimmed = tag.trim().slice(0, 120);
  if (!trimmed) return 0;

  const now = new Date().toISOString();
  const cutoff = cutoffIso(DEFAULT_MAX_AGE_DAYS);

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rowCount } = await pool.query(
        `UPDATE admin_push_alerts
         SET staff_ack_at = COALESCE(staff_ack_at, $2::timestamptz)
         WHERE staff_ack_at IS NULL
           AND tag = $1
           AND created_at >= $3::timestamptz`,
        [trimmed, now, cutoff],
      );
      return rowCount ?? 0;
    }
  } catch (e) {
    console.warn('[push-alerts] postgres ack-by-tag failed', e);
  }

  const alerts = readFileAlerts();
  let acked = 0;
  for (const alert of alerts) {
    if (alert.tag !== trimmed || alert.staffAckAt) continue;
    if (new Date(alert.createdAt).getTime() < new Date(cutoff).getTime()) continue;
    alert.staffAckAt = now;
    acked += 1;
  }
  if (acked > 0) writeFileAlerts(alerts);
  return acked;
}

/** Dismiss pending push alerts whose deep link targets a work project slug. */
export async function storeAckPushAlertsForWorkSlug(jobSlug: string): Promise<number> {
  const slug = jobSlug.trim();
  if (!slug) return 0;

  const now = new Date().toISOString();
  const cutoff = cutoffIso(DEFAULT_MAX_AGE_DAYS);
  const slugNeedle = `%slug=${slug}%`;
  const slugNeedleEnc = `%slug=${encodeURIComponent(slug)}%`;

  try {
    const pool = await ensureSchema();
    if (pool) {
      // Fix: removed stray `slug` as $1 — SQL only uses $1/$2/$3/$4 (now/cutoff/needles)
      const { rowCount } = await pool.query(
        `UPDATE admin_push_alerts
         SET staff_ack_at = COALESCE(staff_ack_at, $1::timestamptz)
         WHERE staff_ack_at IS NULL
           AND created_at >= $2::timestamptz
           AND (url LIKE $3 OR url LIKE $4)`,
        [now, cutoff, slugNeedle, slugNeedleEnc],
      );
      return rowCount ?? 0;
    }
  } catch (e) {
    console.warn('[push-alerts] postgres ack-for-work-slug failed', e);
  }

  const cutoffMs = new Date(cutoff).getTime();
  const alerts = readFileAlerts();
  let acked = 0;
  for (const alert of alerts) {
    if (alert.staffAckAt || new Date(alert.createdAt).getTime() < cutoffMs) continue;
    if (workSlugFromAdminUrl(alert.url) !== slug) continue;
    alert.staffAckAt = now;
    acked += 1;
  }
  if (acked > 0) writeFileAlerts(alerts);
  return acked;
}

/** Dismiss pending push alerts linked to an inbox message (tag, otp tag, or deep link). */
export async function storeAckPushAlertsForEmail(emailId: string): Promise<number> {
  const id = emailId.trim();
  if (!id) return 0;

  const now = new Date().toISOString();
  const cutoff = cutoffIso(DEFAULT_MAX_AGE_DAYS);
  const otpTag = `otp-${id}`.slice(0, 120);
  const authTag = `auth-${id}`.slice(0, 120);
  const triageTag = `triage-${id}`.slice(0, 120);
  const emailTag = `email-${id}`.slice(0, 120);
  const urlNeedle = `%email=${id}%`;
  const urlNeedleEnc = `%email=${encodeURIComponent(id)}%`;

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rowCount } = await pool.query(
        `UPDATE admin_push_alerts
         SET staff_ack_at = COALESCE(staff_ack_at, $2::timestamptz)
         WHERE staff_ack_at IS NULL
           AND created_at >= $3::timestamptz
           AND (
             tag = $1 OR tag = $4 OR tag = $5 OR tag = $8 OR tag = $9 OR url LIKE $6 OR url LIKE $7
           )`,
        [id, now, cutoff, otpTag, authTag, urlNeedle, urlNeedleEnc, triageTag, emailTag],
      );
      return rowCount ?? 0;
    }
  } catch (e) {
    console.warn('[push-alerts] postgres ack-for-email failed', e);
  }

  const cutoffMs = new Date(cutoff).getTime();
  const alerts = readFileAlerts();
  let acked = 0;
  for (const alert of alerts) {
    if (alert.staffAckAt || new Date(alert.createdAt).getTime() < cutoffMs) continue;
    const matchesTag =
      alert.tag === id ||
      alert.tag === otpTag ||
      alert.tag === authTag ||
      alert.tag === triageTag ||
      alert.tag === emailTag;
    const matchesUrl = alert.url.includes(`email=${id}`) || alert.url.includes(`email=${encodeURIComponent(id)}`);
    if (!matchesTag && !matchesUrl) continue;
    alert.staffAckAt = now;
    acked += 1;
  }
  if (acked > 0) writeFileAlerts(alerts);
  return acked;
}

export async function storeAckPushAlert(
  id: string,
): Promise<
  | { ok: true; id: string; tag: string; url: string; kind: PushAlertKind }
  | { ok: false; error: string }
> {
  const trimmed = id.trim();
  if (!trimmed) return { ok: false, error: 'Invalid alert id' };

  const now = new Date().toISOString();

  try {
    const pool = await ensureSchema();
    if (pool) {
      const { rows } = await pool.query<{
        id: string;
        tag: string;
        kind: string;
        url: string;
      }>(
        `UPDATE admin_push_alerts
         SET staff_ack_at = COALESCE(staff_ack_at, $2::timestamptz)
         WHERE id = $1
         RETURNING id, tag, kind, url`,
        [trimmed, now],
      );
      if (rows[0]) {
        return {
          ok: true,
          id: rows[0].id,
          tag: rows[0].tag || '',
          url: rows[0].url || '',
          kind: (rows[0].kind || 'system') as PushAlertKind,
        };
      }

      const existing = await pool.query<{
        id: string;
        tag: string;
        kind: string;
        url: string;
      }>(`SELECT id, tag, kind, url FROM admin_push_alerts WHERE id = $1 LIMIT 1`, [trimmed]);
      if (existing.rows[0]) {
        return {
          ok: true,
          id: existing.rows[0].id,
          tag: existing.rows[0].tag || '',
          url: existing.rows[0].url || '',
          kind: (existing.rows[0].kind || 'system') as PushAlertKind,
        };
      }
    }
  } catch (e) {
    console.warn('[push-alerts] postgres ack failed', e);
  }

  const alerts = readFileAlerts();
  const idx = alerts.findIndex((a) => a.id === trimmed);
  if (idx === -1) return { ok: false, error: 'Alert not found' };
  if (!alerts[idx]!.staffAckAt) alerts[idx]!.staffAckAt = now;
  writeFileAlerts(alerts);
  const alert = alerts[idx]!;
  return {
    ok: true,
    id: alert.id,
    tag: alert.tag || '',
    url: alert.url || '',
    kind: alert.kind,
  };
}
