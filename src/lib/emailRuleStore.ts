/**
 * Persisted email triage rules for the dashboard and inbound pipeline.
 * Postgres (DATABASE_URL) when set, otherwise JSON file under src/knowledge/.
 */

import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import pg from 'pg';
import { databaseUrl, getPgPool } from './pgPool';
import { serverEnv } from './serverEnv';
import {
  DEFAULT_RULES,
  NOTIFY_ON_UNMATCHED,
  coalesceRuleNotifyFields,
  isAuthLinkRuleStatus,
  isSilentTriageStatus,
  isVerificationCodeRuleStatus,
  normalizeEmailRuleScope,
  normalizeNotifyActions,
  type EmailRule,
  type EmailRuleScope,
  type MatchMode,
  type RuleField,
  type RuleNotifyAction,
} from './emailRules';

export interface EmailRuleRecord extends EmailRule {
  id: string;
  /** Display title on the Rules canvas. */
  title: string;
  sortOrder: number;
  /** Always set on persisted rows — universal (all installs) or personal (this install). */
  scope: EmailRuleScope;
  /** ISO timestamp when the rule stops matching; null/undefined = indefinite. */
  expiresAt?: string | null;
  /** Times this rule was the first match on inbound mail (approx; since counting started). */
  hitCount?: number;
  /** ISO timestamp of the most recent match. */
  lastMatchedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmailRulesConfig {
  notifyOnUnmatched: boolean;
  /** ISO timestamp — ignore inbound mail sent before this (see inboundEmailSince.ts). */
  inboundSince?: string | null;
  /** One-time: catalog statuses backfilled to universal after scope column landed. */
  scopeSeeded?: boolean;
  rules: EmailRuleRecord[];
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS email_triage_config (
  id                  INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  notify_on_unmatched BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO email_triage_config (id, notify_on_unmatched) VALUES (1, true)
  ON CONFLICT (id) DO NOTHING;
ALTER TABLE email_triage_config ADD COLUMN IF NOT EXISTS inbound_since TIMESTAMPTZ;
ALTER TABLE email_triage_config ADD COLUMN IF NOT EXISTS rule_hits_seeded BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE email_triage_config ADD COLUMN IF NOT EXISTS rule_scope_seeded BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS email_rules (
  id          UUID PRIMARY KEY,
  sort_order  INT NOT NULL DEFAULT 0,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL,
  description TEXT,
  phrases     JSONB NOT NULL DEFAULT '[]',
  match_mode  TEXT NOT NULL DEFAULT 'any',
  fields      JSONB NOT NULL DEFAULT '["subject","body"]',
  notify      BOOLEAN NOT NULL DEFAULT false,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS summary_override TEXT;
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS forward_to TEXT;
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS hit_count INT NOT NULL DEFAULT 0;
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS last_matched_at TIMESTAMPTZ;
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS except_phrases JSONB NOT NULL DEFAULT '[]';
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS notify_push BOOLEAN;
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS notify_dashboard BOOLEAN;
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS notify_actions JSONB NOT NULL DEFAULT '[]';
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal';
CREATE INDEX IF NOT EXISTS email_rules_sort_idx ON email_rules (sort_order ASC, created_at ASC);
`;

let _schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
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

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function rulesFilePath(): string {
  const override = serverEnv('EMAIL_RULES_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'email-rules.json');
}

function seedFromDefaults(): EmailRulesConfig {
  return {
    notifyOnUnmatched: NOTIFY_ON_UNMATCHED,
    rules: DEFAULT_RULES.map((r, i) => ({
      ...r,
      id: randomUUID(),
      title: ruleTitleFromDefaults(r),
      sortOrder: i,
      scope: normalizeEmailRuleScope(r.scope, 'universal'),
    })),
  };
}

function ruleTitleFromDefaults(r: EmailRule): string {
  if (r.description) {
    const head = r.description.split('—')[0]?.trim();
    if (head) return head;
  }
  return r.status;
}

function normalizeFields(raw: unknown): RuleField[] {
  if (!Array.isArray(raw)) return ['subject', 'body'];
  const allowed = new Set<RuleField>(['subject', 'body', 'from']);
  const out = raw.map(String).filter((f): f is RuleField => allowed.has(f as RuleField));
  return out.length ? out : ['subject', 'body'];
}

function normalizeMatchMode(raw: unknown): MatchMode {
  return raw === 'all' ? 'all' : 'any';
}

/** Parse expires_at from ISO / datetime-local / YYYY-MM-DD. null = indefinite; undefined = invalid. */
export function parseExpiresAt(raw: unknown): string | null | undefined {
  if (raw == null || raw === '') return null;
  const v = String(raw).trim();
  if (!v || v.toLowerCase() === 'null' || v.toLowerCase() === 'indefinite') return null;

  const localMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const d = new Date(
      Number(localMatch[1]),
      Number(localMatch[2]) - 1,
      Number(localMatch[3]),
      Number(localMatch[4]),
      Number(localMatch[5]),
      Number(localMatch[6] || 0),
      0,
    );
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
    if (Number.isNaN(dt.getTime())) return undefined;
    return dt.toISOString();
  }

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function isEmailRuleExpired(rule: { expiresAt?: string | null }, now = Date.now()): boolean {
  if (!rule.expiresAt) return false;
  const t = new Date(rule.expiresAt).getTime();
  return Number.isFinite(t) && t <= now;
}

function rowToRecord(row: {
  id: string;
  sort_order: number;
  title: string;
  status: string;
  description: string | null;
  phrases: unknown;
  match_mode: string;
  fields: unknown;
  notify: boolean;
  enabled: boolean;
  expires_at?: Date | string | null;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  summary_override?: string | null;
  forward_to?: string | null;
  except_phrases?: unknown;
  notify_push?: boolean | null;
  notify_dashboard?: boolean | null;
  notify_actions?: unknown;
  hit_count?: number | null;
  last_matched_at?: Date | string | null;
  scope?: string | null;
}): EmailRuleRecord {
  const notifyFields = coalesceRuleNotifyFields({
    notify: !!row.notify,
    notifyPush: row.notify_push,
    notifyDashboard: row.notify_dashboard,
    notifyActions: row.notify_actions,
  });
  // Legacy rows: notify_push/dashboard null → inherit notify boolean.
  const notifyPush = row.notify_push == null ? !!row.notify : notifyFields.notifyPush;
  const notifyDashboard =
    row.notify_dashboard == null ? !!row.notify : notifyFields.notifyDashboard;
  const notifyActions = normalizeNotifyActions(row.notify_actions);
  const defaultStatuses = new Set(DEFAULT_RULES.map((r) => r.status.toUpperCase()));
  const scopeFallback: EmailRuleScope = defaultStatuses.has(String(row.status || '').toUpperCase())
    ? 'universal'
    : 'personal';
  return {
    id: row.id,
    sortOrder: row.sort_order,
    title: row.title,
    status: row.status,
    scope: normalizeEmailRuleScope(row.scope, scopeFallback),
    description: row.description ?? undefined,
    phrases: Array.isArray(row.phrases) ? row.phrases.map(String) : [],
    exceptPhrases: Array.isArray(row.except_phrases)
      ? row.except_phrases.map(String).map((p) => p.trim()).filter(Boolean)
      : [],
    matchMode: normalizeMatchMode(row.match_mode),
    fields: normalizeFields(row.fields),
    notify: notifyPush || notifyDashboard,
    notifyPush,
    notifyDashboard,
    notifyActions,
    enabled: !!row.enabled,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    hitCount: Math.max(0, Number(row.hit_count) || 0),
    lastMatchedAt: row.last_matched_at ? new Date(row.last_matched_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    summaryOverride: row.summary_override ?? undefined,
    forwardTo: row.forward_to?.trim() || null,
  };
}

function parseConfig(raw: string): EmailRulesConfig | null {
  try {
    const data = JSON.parse(raw) as EmailRulesConfig;
    if (!data || !Array.isArray(data.rules)) return null;
    return {
      notifyOnUnmatched: data.notifyOnUnmatched ?? NOTIFY_ON_UNMATCHED,
      inboundSince:
        data.inboundSince === null || data.inboundSince === undefined
          ? null
          : String(data.inboundSince),
      scopeSeeded: data.scopeSeeded === true,
      rules: data.rules.map((r, i) => {
        const notifyFields = coalesceRuleNotifyFields({
          notify: !!r.notify,
          notifyPush: r.notifyPush,
          notifyDashboard: r.notifyDashboard,
          notifyActions: r.notifyActions,
        });
        const notifyPush = r.notifyPush == null ? !!r.notify : notifyFields.notifyPush;
        const notifyDashboard =
          r.notifyDashboard == null ? !!r.notify : notifyFields.notifyDashboard;
        const defaultStatuses = new Set(DEFAULT_RULES.map((d) => d.status.toUpperCase()));
        const scopeFallback: EmailRuleScope = defaultStatuses.has(String(r.status || '').toUpperCase())
          ? 'universal'
          : 'personal';
        return {
          id: String(r.id || randomUUID()),
          title: String(r.title || r.status || 'Rule'),
          sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : i,
          status: String(r.status || 'RULE'),
          scope: normalizeEmailRuleScope(r.scope, scopeFallback),
          description: r.description ? String(r.description) : undefined,
          phrases: Array.isArray(r.phrases) ? r.phrases.map(String) : [],
          exceptPhrases: Array.isArray(r.exceptPhrases)
            ? r.exceptPhrases.map(String).map((p) => p.trim()).filter(Boolean)
            : [],
          matchMode: normalizeMatchMode(r.matchMode),
          fields: normalizeFields(r.fields),
          notify: notifyPush || notifyDashboard,
          notifyPush,
          notifyDashboard,
          notifyActions: normalizeNotifyActions(r.notifyActions),
          enabled: r.enabled !== false,
          expiresAt: r.expiresAt ? String(r.expiresAt) : null,
          hitCount: Math.max(0, Number(r.hitCount) || 0),
          lastMatchedAt: r.lastMatchedAt ? String(r.lastMatchedAt) : null,
          createdAt: r.createdAt ? String(r.createdAt) : undefined,
          updatedAt: r.updatedAt ? String(r.updatedAt) : undefined,
          summaryOverride: r.summaryOverride ? String(r.summaryOverride) : undefined,
          forwardTo: r.forwardTo ? String(r.forwardTo).trim() : null,
        };
      }),
    };
  } catch {
    return null;
  }
}

function writeFileConfig(config: EmailRulesConfig): boolean {
  try {
    const path = rulesFilePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[email-rules] file write failed', e);
    return false;
  }
}

export function emailRulesStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
}

export function isPgEmailRulesConfigured(): boolean {
  return !!databaseUrl();
}

async function loadFromFile(): Promise<EmailRulesConfig> {
  const path = rulesFilePath();
  if (existsSync(path)) {
    const parsed = parseConfig(readFileSync(path, 'utf8'));
    if (parsed) return parsed;
  }
  const seeded = seedFromDefaults();
  writeFileConfig(seeded);
  return seeded;
}

async function saveToFile(config: EmailRulesConfig): Promise<boolean> {
  return writeFileConfig(config);
}

async function loadFromPg(): Promise<EmailRulesConfig | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;

    await seedHitCountsFromInbox(pool);
    await seedRuleScopesOnce(pool);

    const cfgRes = await pool.query<{
      notify_on_unmatched: boolean;
      inbound_since: Date | string | null;
      rule_scope_seeded: boolean;
    }>(
      `SELECT notify_on_unmatched, inbound_since, rule_scope_seeded FROM email_triage_config WHERE id = 1`
    );
    const notifyOnUnmatched = cfgRes.rows[0]?.notify_on_unmatched ?? NOTIFY_ON_UNMATCHED;
    const inboundSinceRaw = cfgRes.rows[0]?.inbound_since;
    const inboundSince = inboundSinceRaw
      ? new Date(inboundSinceRaw).toISOString()
      : null;
    const scopeSeeded = cfgRes.rows[0]?.rule_scope_seeded === true;

    const { rows } = await pool.query(
      `SELECT id, sort_order, title, status, description, phrases, match_mode, fields, notify, enabled,
              expires_at, created_at, updated_at, summary_override, forward_to, hit_count, last_matched_at,
              except_phrases, notify_push, notify_dashboard, notify_actions, scope
       FROM email_rules ORDER BY sort_order ASC, created_at ASC`
    );

    if (rows.length === 0) {
      const seeded = seedFromDefaults();
      await saveToPg(seeded);
      return seeded;
    }

    return {
      notifyOnUnmatched,
      inboundSince,
      scopeSeeded,
      rules: rows.map(rowToRecord),
    };
  } catch (e) {
    console.error('[email-rules] pg load failed', e);
    return null;
  }
}

async function saveToPg(config: EmailRulesConfig): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;

    await pool.query('BEGIN');
    await pool.query(
      `INSERT INTO email_triage_config (id, notify_on_unmatched, updated_at)
       VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET notify_on_unmatched = EXCLUDED.notify_on_unmatched, updated_at = now()`,
      [config.notifyOnUnmatched]
    );
    await pool.query('DELETE FROM email_rules');
    for (const r of config.rules) {
      const notifyPush = r.notifyPush != null ? !!r.notifyPush : !!r.notify;
      const notifyDashboard = r.notifyDashboard != null ? !!r.notifyDashboard : !!r.notify;
      const notifyActions = normalizeNotifyActions(r.notifyActions);
      await pool.query(
        `INSERT INTO email_rules
          (id, sort_order, title, status, description, phrases, match_mode, fields, notify, enabled,
           expires_at, created_at, updated_at, summary_override, forward_to, hit_count, last_matched_at,
           except_phrases, notify_push, notify_dashboard, notify_actions, scope)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, COALESCE($12, now()), COALESCE($13, now()), $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          r.id,
          r.sortOrder,
          r.title,
          r.status,
          r.description ?? null,
          JSON.stringify(r.phrases),
          r.matchMode,
          JSON.stringify(r.fields),
          notifyPush || notifyDashboard,
          r.enabled,
          r.expiresAt ? new Date(r.expiresAt) : null,
          r.createdAt ? new Date(r.createdAt) : null,
          r.updatedAt ? new Date(r.updatedAt) : null,
          r.summaryOverride ?? null,
          r.forwardTo?.trim() || null,
          Math.max(0, Number(r.hitCount) || 0),
          r.lastMatchedAt ? new Date(r.lastMatchedAt) : null,
          JSON.stringify(
            Array.isArray(r.exceptPhrases)
              ? r.exceptPhrases.map(String).map((p) => p.trim()).filter(Boolean)
              : [],
          ),
          notifyPush,
          notifyDashboard,
          JSON.stringify(notifyActions),
          normalizeEmailRuleScope(r.scope, 'personal'),
        ]
      );
    }
    await pool.query('COMMIT');
    return true;
  } catch (e) {
    console.error('[email-rules] pg save failed', e);
    try {
      await getPgPool()?.query('ROLLBACK');
    } catch {}
    return false;
  }
}

/**
 * Best-effort archival seed from inbox classification_audit.
 * Only assigns counts to statuses that map to exactly one rule (ambiguous DELETE/etc. skipped).
 * Runs once per install (email_triage_config.rule_hits_seeded).
 */
async function seedHitCountsFromInbox(pool: pg.Pool): Promise<void> {
  try {
    const flag = await pool.query<{ rule_hits_seeded: boolean }>(
      `SELECT rule_hits_seeded FROM email_triage_config WHERE id = 1`
    );
    if (flag.rows[0]?.rule_hits_seeded) return;

    // Inbox table may not exist yet on fresh installs.
    const inboxExists = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'email_inbox'
       ) AS exists`
    );
    if (!inboxExists.rows[0]?.exists) {
      await pool.query(
        `UPDATE email_triage_config SET rule_hits_seeded = true, updated_at = now() WHERE id = 1`
      );
      return;
    }

    const { rows: rules } = await pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM email_rules`
    );
    const byStatus = new Map<string, string[]>();
    for (const r of rules) {
      const key = String(r.status || '').toUpperCase();
      if (!key) continue;
      const list = byStatus.get(key) || [];
      list.push(r.id);
      byStatus.set(key, list);
    }

    const { rows: counts } = await pool.query<{ status: string; hits: string; last_at: Date | string | null }>(
      `SELECT UPPER(TRIM(BOTH FROM substring(elem->>'decision' from '^Matched (.+) rule$'))) AS status,
              COUNT(*)::text AS hits,
              MAX(received_at) AS last_at
       FROM email_inbox,
            LATERAL jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(classification_audit) = 'array' THEN classification_audit
                ELSE '[]'::jsonb
              END
            ) AS elem
       WHERE elem->>'step' = 'rules'
         AND elem->>'decision' ~ '^Matched .+ rule$'
       GROUP BY 1`
    );

    for (const row of counts) {
      const status = String(row.status || '').toUpperCase();
      const ids = byStatus.get(status);
      if (!ids || ids.length !== 1) continue;
      const hits = Math.max(0, parseInt(row.hits, 10) || 0);
      if (hits <= 0) continue;
      await pool.query(
        `UPDATE email_rules
         SET hit_count = GREATEST(COALESCE(hit_count, 0), $2),
             last_matched_at = COALESCE(
               last_matched_at,
               $3::timestamptz
             )
         WHERE id = $1`,
        [ids[0], hits, row.last_at ? new Date(row.last_at).toISOString() : null],
      );
    }

    await pool.query(
      `UPDATE email_triage_config SET rule_hits_seeded = true, updated_at = now() WHERE id = 1`
    );
  } catch (e) {
    console.error('[email-rules] hit seed from inbox failed', e);
  }
}

/**
 * One-time: mark DEFAULT_RULES catalog statuses as universal after the scope column lands.
 * Owner can still demote a catalog rule to personal afterward.
 */
async function seedRuleScopesOnce(pool: pg.Pool): Promise<void> {
  try {
    const flag = await pool.query<{ rule_scope_seeded: boolean }>(
      `SELECT rule_scope_seeded FROM email_triage_config WHERE id = 1`,
    );
    if (flag.rows[0]?.rule_scope_seeded) return;

    const statuses = DEFAULT_RULES.map((r) => r.status.toUpperCase());
    await pool.query(
      `UPDATE email_rules SET scope = 'universal' WHERE upper(status) = ANY($1::text[])`,
      [statuses],
    );
    await pool.query(
      `UPDATE email_triage_config SET rule_scope_seeded = true, updated_at = now() WHERE id = 1`,
    );
  } catch (e) {
    console.error('[email-rules] scope seed failed', e);
  }
}

export async function loadEmailRulesConfig(): Promise<EmailRulesConfig> {
  let config: EmailRulesConfig;
  if (emailRulesStorageBackend() === 'postgres') {
    const pgConfig = await loadFromPg();
    config = pgConfig ?? (await loadFromFile());
  } else {
    config = await loadFromFile();
  }
  return ensureBuiltinRules(config);
}

/** Phrases that wrongly filed income (“Payment of $… from …”) as tax receipts. */
const INCOME_MISFILE_PHRASES = new Set(['payment of $', 'your invoice from']);

/**
 * Bare "Security alert" on NEEDS_CHECK stomped sender-specific Google DELETE rules
 * (same phrase, earlier sort order). Strip it from persisted copies on load.
 */
const NEEDS_CHECK_STRIP_PHRASES = new Set(['security alert']);

/** Insert any new DEFAULT_RULES statuses missing from persisted config (e.g. RAILWAY_ALERT). */
async function ensureBuiltinRules(config: EmailRulesConfig): Promise<EmailRulesConfig> {
  const present = new Set(config.rules.map((r) => r.status.toUpperCase()));
  const missing = DEFAULT_RULES.filter((r) => !present.has(r.status.toUpperCase()));
  const receiptDefault = DEFAULT_RULES.find((r) => r.status === 'RECEIPT');
  const needsCheckDefault = DEFAULT_RULES.find((r) => r.status === 'NEEDS_CHECK');
  const defaultStatuses = new Set(DEFAULT_RULES.map((r) => r.status.toUpperCase()));

  let phrasesFixed = false;
  let scopeFixed = false;
  let rules = config.rules.map((r) => {
    let next = r;
    const status = r.status.toUpperCase();
    if (status === 'RECEIPT') {
      const nextPhrases = r.phrases.filter((p) => !INCOME_MISFILE_PHRASES.has(p.trim().toLowerCase()));
      if (nextPhrases.length !== r.phrases.length) {
        phrasesFixed = true;
        next = {
          ...next,
          phrases: nextPhrases.length ? nextPhrases : (receiptDefault?.phrases ?? nextPhrases),
          description: receiptDefault?.description ?? next.description,
          title: receiptDefault ? ruleTitleFromDefaults(receiptDefault) : next.title,
        };
      }
    }
    if (status === 'NEEDS_CHECK') {
      const nextPhrases = next.phrases.filter(
        (p) => !NEEDS_CHECK_STRIP_PHRASES.has(p.trim().toLowerCase()),
      );
      if (nextPhrases.length !== next.phrases.length) {
        phrasesFixed = true;
        next = {
          ...next,
          phrases: nextPhrases.length ? nextPhrases : (needsCheckDefault?.phrases ?? nextPhrases),
          description: needsCheckDefault?.description ?? next.description,
        };
      }
    }
    if (next.scope !== 'universal' && next.scope !== 'personal') {
      scopeFixed = true;
      next = {
        ...next,
        scope: defaultStatuses.has(status) ? 'universal' : 'personal',
      };
    }
    return next;
  });

  // File backend one-time: promote catalog statuses to universal.
  if (!config.scopeSeeded) {
    const promoted = rules.map((r) =>
      defaultStatuses.has(r.status.toUpperCase()) && r.scope !== 'universal'
        ? { ...r, scope: 'universal' as const }
        : r,
    );
    if (promoted.some((r, i) => r.scope !== rules[i].scope)) {
      scopeFixed = true;
      rules = promoted;
    }
  }

  const scopeSeeded = true;

  if (!missing.length && !phrasesFixed && !scopeFixed && config.scopeSeeded) {
    const elevated = elevateSenderSilentRules(rules);
    if (!elevated.changed) return { ...config, rules, scopeSeeded };
    const mergedElevated: EmailRulesConfig = { ...config, rules: elevated.rules, scopeSeeded };
    await persistConfig(mergedElevated);
    return mergedElevated;
  }

  const withMissing: EmailRuleRecord[] = [
    ...rules,
    ...missing.map((r, i) => ({
      ...r,
      id: randomUUID(),
      title: ruleTitleFromDefaults(r),
      sortOrder: rules.length + i,
      scope: normalizeEmailRuleScope(r.scope, 'universal') as EmailRuleScope,
    })),
  ];
  const elevated = elevateSenderSilentRules(withMissing);
  const merged: EmailRulesConfig = {
    ...config,
    scopeSeeded,
    rules: elevated.rules,
  };
  await persistConfig(merged);
  return merged;
}

/**
 * Sender-specific silent rules (from + DELETE/notify:false) belong just after
 * OTP/auth — otherwise a broad NEEDS_CHECK earlier in the table always wins.
 */
function elevateSenderSilentRules(rules: EmailRuleRecord[]): {
  rules: EmailRuleRecord[];
  changed: boolean;
} {
  const pinned = rules.filter(
    (r) => isVerificationCodeRuleStatus(r.status) || isAuthLinkRuleStatus(r.status),
  );
  const elevate = rules.filter(
    (r) =>
      r.enabled &&
      r.fields.includes('from') &&
      (!r.notify || isSilentTriageStatus(r.status)) &&
      !isVerificationCodeRuleStatus(r.status) &&
      !isAuthLinkRuleStatus(r.status),
  );
  if (!elevate.length) return { rules, changed: false };

  const elevateIds = new Set(elevate.map((r) => r.id));
  const rest = rules.filter(
    (r) =>
      !elevateIds.has(r.id) &&
      !isVerificationCodeRuleStatus(r.status) &&
      !isAuthLinkRuleStatus(r.status),
  );

  // Already correctly ordered? First non-pinned/non-elevated should not sit between
  // pinned and elevate groups with a lower sort than elevate max while elevate is late.
  const afterPinned = pinned.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  const firstRest = rest.reduce((m, r) => Math.min(m, r.sortOrder), Number.POSITIVE_INFINITY);
  const allElevateBeforeRest = elevate.every((r) => r.sortOrder < firstRest);
  const allElevateAfterPinned = elevate.every((r) => r.sortOrder > afterPinned);
  if (allElevateBeforeRest && allElevateAfterPinned) {
    return { rules, changed: false };
  }

  const ordered = [...pinned, ...elevate, ...rest].map((r, i) => ({ ...r, sortOrder: i }));
  return { rules: ordered, changed: true };
}

/** Active enabled (and non-expired) rules in sort order for classification. */
export async function loadActiveEmailRules(): Promise<{ rules: EmailRule[]; notifyOnUnmatched: boolean }> {
  const config = await loadEmailRulesConfig();
  const now = Date.now();
  return {
    rules: config.rules.filter((r) => r.enabled && !isEmailRuleExpired(r, now)),
    notifyOnUnmatched: config.notifyOnUnmatched,
  };
}

async function persistConfig(config: EmailRulesConfig): Promise<boolean> {
  if (emailRulesStorageBackend() === 'postgres') {
    return saveToPg(config);
  }
  return saveToFile(config);
}

export type RuleInput = {
  title: string;
  status: string;
  description?: string;
  phrases: string[];
  /** Phrases that veto a match (NOT clause). */
  exceptPhrases?: string[];
  matchMode: MatchMode;
  fields: RuleField[];
  notify: boolean;
  notifyPush?: boolean;
  notifyDashboard?: boolean;
  notifyActions?: RuleNotifyAction[];
  enabled: boolean;
  /** ISO timestamp or null for indefinite. */
  expiresAt?: string | null;
  /** Optional address to auto-forward matched mail to (Resend outbound). */
  forwardTo?: string | null;
  /** universal = all Reave installs (catalog); personal = this install only. */
  scope?: EmailRuleScope;
};

function normalizeForwardTo(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const v = String(raw).trim();
  if (!v || v.toLowerCase() === 'null') return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

function sanitizeInput(input: RuleInput): RuleInput | null {
  const title = input.title.trim();
  const status = input.status.trim().toUpperCase().replace(/\s+/g, '_');
  if (!title || !status) return null;
  const phrases = input.phrases.map((p) => p.trim()).filter(Boolean);
  const exceptPhrases = (input.exceptPhrases ?? []).map((p) => p.trim()).filter(Boolean);
  const expiresAt = parseExpiresAt(input.expiresAt ?? null);
  if (expiresAt === undefined) return null;
  const forwardTo = normalizeForwardTo(input.forwardTo);
  if (input.forwardTo != null && String(input.forwardTo).trim() && !forwardTo) return null;
  const notifyFields = coalesceRuleNotifyFields({
    notify: input.notify,
    notifyPush: input.notifyPush,
    notifyDashboard: input.notifyDashboard,
    notifyActions: input.notifyActions,
  });
  return {
    title,
    status,
    description: input.description?.trim() || undefined,
    phrases,
    exceptPhrases,
    matchMode: normalizeMatchMode(input.matchMode),
    fields: normalizeFields(input.fields),
    notify: notifyFields.notify,
    notifyPush: notifyFields.notifyPush,
    notifyDashboard: notifyFields.notifyDashboard,
    notifyActions: notifyFields.notifyActions,
    enabled: input.enabled !== false,
    expiresAt,
    forwardTo,
    ...(input.scope !== undefined
      ? { scope: normalizeEmailRuleScope(input.scope, 'personal') }
      : {}),
  };
}

export async function storeListEmailRules(): Promise<EmailRulesConfig> {
  return loadEmailRulesConfig();
}

export async function storeGetEmailRule(id: string): Promise<EmailRuleRecord | null> {
  const config = await loadEmailRulesConfig();
  return config.rules.find((r) => r.id === id) ?? null;
}

/**
 * Sender-specific silent rules must beat broad alert catch-alls.
 * Insert just after pinned OTP/auth rules; shift the rest down.
 * Catch-all junk (no `from` field) still appends at the end.
 */
function shouldElevateNewRule(input: RuleInput): boolean {
  if (!input.fields.includes('from')) return false;
  if (!input.notify) return true;
  return isSilentTriageStatus(input.status);
}

function sortOrderForNewRule(config: EmailRulesConfig, elevate: boolean): number {
  if (!elevate) {
    return config.rules.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
  }
  let afterPinned = -1;
  for (const r of config.rules) {
    if (isVerificationCodeRuleStatus(r.status) || isAuthLinkRuleStatus(r.status)) {
      afterPinned = Math.max(afterPinned, r.sortOrder);
    }
  }
  const sortOrder = afterPinned + 1;
  for (const r of config.rules) {
    if (r.sortOrder >= sortOrder) r.sortOrder += 1;
  }
  return sortOrder;
}

export async function storeCreateEmailRule(input: RuleInput): Promise<EmailRuleRecord | null> {
  const clean = sanitizeInput(input);
  if (!clean) return null;
  const config = await loadEmailRulesConfig();
  const now = new Date().toISOString();
  const sortOrder = sortOrderForNewRule(config, shouldElevateNewRule(clean));
  const record: EmailRuleRecord = {
    id: randomUUID(),
    sortOrder,
    ...clean,
    scope: normalizeEmailRuleScope(clean.scope, 'personal'),
    hitCount: 0,
    lastMatchedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  config.rules.push(record);
  config.rules.sort((a, b) => a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id)));
  if (!(await persistConfig(config))) return null;
  return record;
}

export async function storeUpdateEmailRule(id: string, input: RuleInput): Promise<EmailRuleRecord | null> {
  const clean = sanitizeInput(input);
  if (!clean) return null;
  const config = await loadEmailRulesConfig();
  const idx = config.rules.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prev = config.rules[idx];
  config.rules[idx] = {
    ...prev,
    ...clean,
    scope: clean.scope ?? prev.scope ?? 'personal',
    updatedAt: new Date().toISOString(),
  };
  if (!(await persistConfig(config))) return null;
  return config.rules[idx];
}

export async function storeDeleteEmailRule(id: string): Promise<boolean> {
  const config = await loadEmailRulesConfig();
  const next = config.rules.filter((r) => r.id !== id);
  if (next.length === config.rules.length) return false;
  config.rules = next;
  return persistConfig(config);
}

export async function storeSetNotifyOnUnmatched(notify: boolean): Promise<boolean> {
  const config = await loadEmailRulesConfig();
  config.notifyOnUnmatched = notify;
  return persistConfig(config);
}

/**
 * Persist a new priority order for rules. `ids` must include every rule id
 * exactly once (OTP/AUTH_LINK may still be pinned first at classify time).
 */
export async function storeReorderEmailRules(
  ids: string[],
): Promise<{ ok: true; rules: EmailRuleRecord[] } | { ok: false; error: string }> {
  const cleanIds = ids.map((id) => String(id || '').trim()).filter(Boolean);
  if (!cleanIds.length) return { ok: false, error: 'ids array required' };

  const config = await loadEmailRulesConfig();
  const byId = new Map(config.rules.map((r) => [r.id, r]));
  if (cleanIds.length !== byId.size) {
    return { ok: false, error: 'ids must include every rule exactly once' };
  }
  const seen = new Set<string>();
  const ordered: EmailRuleRecord[] = [];
  for (const id of cleanIds) {
    if (seen.has(id)) return { ok: false, error: `duplicate rule id: ${id}` };
    const rule = byId.get(id);
    if (!rule) return { ok: false, error: `unknown rule id: ${id}` };
    seen.add(id);
    ordered.push(rule);
  }

  const now = new Date().toISOString();
  // Honor the explicit drag order — do not re-run silent-rule elevation here
  // (that runs on load/seed; Lab/Flow persist what the owner just arranged).
  config.rules = ordered.map((r, i) => ({ ...r, sortOrder: i, updatedAt: now }));
  if (!(await persistConfig(config))) return { ok: false, error: 'Failed to save rule order' };
  return { ok: true, rules: config.rules };
}

export async function storeGetInboundSince(): Promise<string | null> {
  const config = await loadEmailRulesConfig();
  return config.inboundSince ?? null;
}

export async function storeSetInboundSince(iso: string): Promise<boolean> {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;

  if (emailRulesStorageBackend() === 'postgres') {
    try {
      const pool = await ensureSchema();
      if (!pool) return false;
      await pool.query(
        `INSERT INTO email_triage_config (id, notify_on_unmatched, inbound_since, updated_at)
         VALUES (1, true, $1, now())
         ON CONFLICT (id) DO UPDATE SET
           inbound_since = COALESCE(email_triage_config.inbound_since, EXCLUDED.inbound_since),
           updated_at = now()`,
        [parsed.toISOString()]
      );
      return true;
    } catch (e) {
      console.error('[email-rules] pg set inbound_since failed', e);
      return false;
    }
  }

  const config = await loadEmailRulesConfig();
  if (config.inboundSince) return true;
  config.inboundSince = parsed.toISOString();
  return persistConfig(config);
}

/** Bump first-match hit counter for a rule (fire-and-forget safe). */
export async function incrementEmailRuleHit(id: string): Promise<void> {
  const ruleId = String(id || '').trim();
  if (!ruleId) return;

  if (emailRulesStorageBackend() === 'postgres') {
    try {
      const pool = await ensureSchema();
      if (!pool) return;
      await pool.query(
        `UPDATE email_rules
         SET hit_count = COALESCE(hit_count, 0) + 1,
             last_matched_at = now()
         WHERE id = $1`,
        [ruleId],
      );
      return;
    } catch (e) {
      console.error('[email-rules] hit increment failed', e);
      return;
    }
  }

  try {
    const config = await loadFromFile();
    const rule = config.rules.find((r) => r.id === ruleId);
    if (!rule) return;
    rule.hitCount = Math.max(0, Number(rule.hitCount) || 0) + 1;
    rule.lastMatchedAt = new Date().toISOString();
    await saveToFile(config);
  } catch (e) {
    console.error('[email-rules] file hit increment failed', e);
  }
}
