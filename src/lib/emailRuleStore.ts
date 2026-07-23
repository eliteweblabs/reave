/**
 * Persisted email triage rules for the dashboard and inbound pipeline.
 * Postgres (DATABASE_URL) when set, otherwise JSON file under src/knowledge/.
 */

import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import pg from 'pg';
import { serverEnv } from './serverEnv';
import { DEFAULT_RULES, NOTIFY_ON_UNMATCHED, type EmailRule, type MatchMode, type RuleField } from './emailRules';

export interface EmailRuleRecord extends EmailRule {
  id: string;
  /** Display title on the Rules canvas. */
  title: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmailRulesConfig {
  notifyOnUnmatched: boolean;
  /** ISO timestamp — ignore inbound mail sent before this (see inboundEmailSince.ts). */
  inboundSince?: string | null;
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
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_rules_sort_idx ON email_rules (sort_order ASC, created_at ASC);
`;

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;

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
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
}): EmailRuleRecord {
  return {
    id: row.id,
    sortOrder: row.sort_order,
    title: row.title,
    status: row.status,
    description: row.description ?? undefined,
    phrases: Array.isArray(row.phrases) ? row.phrases.map(String) : [],
    matchMode: normalizeMatchMode(row.match_mode),
    fields: normalizeFields(row.fields),
    notify: !!row.notify,
    enabled: !!row.enabled,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
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
      rules: data.rules.map((r, i) => ({
        id: String(r.id || randomUUID()),
        title: String(r.title || r.status || 'Rule'),
        sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : i,
        status: String(r.status || 'RULE'),
        description: r.description ? String(r.description) : undefined,
        phrases: Array.isArray(r.phrases) ? r.phrases.map(String) : [],
        matchMode: normalizeMatchMode(r.matchMode),
        fields: normalizeFields(r.fields),
        notify: !!r.notify,
        enabled: r.enabled !== false,
        createdAt: r.createdAt ? String(r.createdAt) : undefined,
        updatedAt: r.updatedAt ? String(r.updatedAt) : undefined,
      })),
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

    const cfgRes = await pool.query<{ notify_on_unmatched: boolean; inbound_since: Date | string | null }>(
      `SELECT notify_on_unmatched, inbound_since FROM email_triage_config WHERE id = 1`
    );
    const notifyOnUnmatched = cfgRes.rows[0]?.notify_on_unmatched ?? NOTIFY_ON_UNMATCHED;
    const inboundSinceRaw = cfgRes.rows[0]?.inbound_since;
    const inboundSince = inboundSinceRaw
      ? new Date(inboundSinceRaw).toISOString()
      : null;

    const { rows } = await pool.query(
      `SELECT id, sort_order, title, status, description, phrases, match_mode, fields, notify, enabled,
              created_at, updated_at
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
      await pool.query(
        `INSERT INTO email_rules
          (id, sort_order, title, status, description, phrases, match_mode, fields, notify, enabled, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11, now()), COALESCE($12, now()))`,
        [
          r.id,
          r.sortOrder,
          r.title,
          r.status,
          r.description ?? null,
          JSON.stringify(r.phrases),
          r.matchMode,
          JSON.stringify(r.fields),
          r.notify,
          r.enabled,
          r.createdAt ? new Date(r.createdAt) : null,
          r.updatedAt ? new Date(r.updatedAt) : null,
        ]
      );
    }
    await pool.query('COMMIT');
    return true;
  } catch (e) {
    console.error('[email-rules] pg save failed', e);
    try {
      await getPool()?.query('ROLLBACK');
    } catch {}
    return false;
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

/** Insert any new DEFAULT_RULES statuses missing from persisted config (e.g. RAILWAY_ALERT). */
async function ensureBuiltinRules(config: EmailRulesConfig): Promise<EmailRulesConfig> {
  const present = new Set(config.rules.map((r) => r.status.toUpperCase()));
  const missing = DEFAULT_RULES.filter((r) => !present.has(r.status.toUpperCase()));
  if (!missing.length) return config;

  const merged: EmailRulesConfig = {
    ...config,
    rules: [
      ...config.rules,
      ...missing.map((r, i) => ({
        ...r,
        id: randomUUID(),
        title: ruleTitleFromDefaults(r),
        sortOrder: config.rules.length + i,
      })),
    ],
  };
  await persistConfig(merged);
  return merged;
}

/** Active enabled rules in sort order for classification. */
export async function loadActiveEmailRules(): Promise<{ rules: EmailRule[]; notifyOnUnmatched: boolean }> {
  const config = await loadEmailRulesConfig();
  return {
    rules: config.rules.filter((r) => r.enabled),
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
  matchMode: MatchMode;
  fields: RuleField[];
  notify: boolean;
  enabled: boolean;
};

function sanitizeInput(input: RuleInput): RuleInput | null {
  const title = input.title.trim();
  const status = input.status.trim().toUpperCase().replace(/\s+/g, '_');
  if (!title || !status) return null;
  const phrases = input.phrases.map((p) => p.trim()).filter(Boolean);
  return {
    title,
    status,
    description: input.description?.trim() || undefined,
    phrases,
    matchMode: normalizeMatchMode(input.matchMode),
    fields: normalizeFields(input.fields),
    notify: !!input.notify,
    enabled: input.enabled !== false,
  };
}

export async function storeListEmailRules(): Promise<EmailRulesConfig> {
  return loadEmailRulesConfig();
}

export async function storeGetEmailRule(id: string): Promise<EmailRuleRecord | null> {
  const config = await loadEmailRulesConfig();
  return config.rules.find((r) => r.id === id) ?? null;
}

export async function storeCreateEmailRule(input: RuleInput): Promise<EmailRuleRecord | null> {
  const clean = sanitizeInput(input);
  if (!clean) return null;
  const config = await loadEmailRulesConfig();
  const maxOrder = config.rules.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  const now = new Date().toISOString();
  const record: EmailRuleRecord = {
    id: randomUUID(),
    sortOrder: maxOrder + 1,
    ...clean,
    createdAt: now,
    updatedAt: now,
  };
  config.rules.push(record);
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
  config.rules[idx] = { ...prev, ...clean, updatedAt: new Date().toISOString() };
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
