/**
 * Postgres-backed email rules loader (Railway DATABASE_URL).
 * Staging table for a future client-scoped rules rewrite — NOT wired to the
 * dashboard yet. Live rules use src/lib/emailRuleStore.ts (email_rules).
 */

import { getPgPool } from './pgPool';

const RULES_TABLE = 'email_rule_templates';

export interface EmailRule {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  pattern: string;
  match_fields: string[];
  action: string;
  notify: boolean;
  notify_type: string | null;
  forward_to: string | null;
  create_project: boolean;
  except_phrases: string[];
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailRuleMatch {
  ruleId: string;
  action: string;
}

const COLUMNS =
  'id, client_id, name, description, pattern, match_fields, action, notify, notify_type, forward_to, create_project, except_phrases, priority, enabled, created_at, updated_at';

function mapRow(row: Record<string, unknown>): EmailRule {
  return {
    id: String(row.id),
    client_id: row.client_id != null ? String(row.client_id) : null,
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    pattern: String(row.pattern),
    match_fields: Array.isArray(row.match_fields)
      ? row.match_fields.map(String)
      : ['subject', 'body'],
    action: String(row.action),
    notify: row.notify !== false,
    notify_type: row.notify_type != null ? String(row.notify_type) : null,
    forward_to: row.forward_to != null ? String(row.forward_to) : null,
    create_project: Boolean(row.create_project),
    except_phrases: Array.isArray(row.except_phrases)
      ? row.except_phrases.map(String)
      : [],
    priority: Number(row.priority ?? 0),
    enabled: row.enabled !== false,
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function compilePattern(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (!trimmed) return null;
  try {
    return new RegExp(trimmed, 'i');
  } catch (e) {
    console.error('[pgEmailRules] invalid regex pattern', { pattern: trimmed, error: e });
    return null;
  }
}

function fieldText(email: { subject: string; body: string }, field: string): string {
  const key = field.trim().toLowerCase();
  if (key === 'subject') return email.subject ?? '';
  if (key === 'body') return email.body ?? '';
  return '';
}

function blockedByExceptPhrases(
  rule: Pick<EmailRule, 'except_phrases'>,
  email: { subject: string; body: string },
): boolean {
  const haystack = `${email.subject ?? ''}\n${email.body ?? ''}`.toLowerCase();
  return rule.except_phrases.some((phrase) => {
    const p = phrase.trim().toLowerCase();
    return p.length > 0 && haystack.includes(p);
  });
}

function ruleMatches(
  rule: EmailRule,
  email: { subject: string; body: string },
): boolean {
  if (!rule.enabled) return false;
  const re = compilePattern(rule.pattern);
  if (!re) return false;

  const fields = rule.match_fields.length ? rule.match_fields : ['subject', 'body'];
  const matched = fields.some((field) => re.test(fieldText(email, field)));
  if (!matched) return false;
  return !blockedByExceptPhrases(rule, email);
}

/** Universal + client-specific rules, ordered by priority (lower first). */
export async function listEmailRules(clientId?: string): Promise<EmailRule[]> {
  const pool = getPgPool();
  if (!pool) return [];
  try {
    if (clientId) {
      const { rows } = await pool.query(
        `SELECT ${COLUMNS}
         FROM ${RULES_TABLE}
         WHERE client_id IS NULL OR client_id = $1::uuid
         ORDER BY priority ASC, created_at ASC`,
        [clientId],
      );
      return rows.map((r) => mapRow(r as Record<string, unknown>));
    }
    const { rows } = await pool.query(
      `SELECT ${COLUMNS}
       FROM ${RULES_TABLE}
       WHERE client_id IS NULL
       ORDER BY priority ASC, created_at ASC`,
    );
    return rows.map((r) => mapRow(r as Record<string, unknown>));
  } catch (e) {
    console.error('[pgEmailRules] listEmailRules error', e);
    return [];
  }
}

export async function readEmailRule(id: string): Promise<EmailRule | null> {
  const pool = getPgPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM ${RULES_TABLE} WHERE id = $1::uuid LIMIT 1`,
      [id],
    );
    const row = rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  } catch (e) {
    console.error('[pgEmailRules] readEmailRule error', e);
    return null;
  }
}

export async function createEmailRule(
  rule: Omit<EmailRule, 'id' | 'created_at' | 'updated_at'>,
): Promise<EmailRule | null> {
  const pool = getPgPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${RULES_TABLE} (
         client_id, name, description, pattern, match_fields, action,
         notify, notify_type, forward_to, create_project, except_phrases,
         priority, enabled
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13
       )
       RETURNING ${COLUMNS}`,
      [
        rule.client_id,
        rule.name,
        rule.description,
        rule.pattern,
        rule.match_fields,
        rule.action,
        rule.notify,
        rule.notify_type,
        rule.forward_to,
        rule.create_project,
        rule.except_phrases,
        rule.priority,
        rule.enabled,
      ],
    );
    const row = rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  } catch (e) {
    console.error('[pgEmailRules] createEmailRule error', e);
    return null;
  }
}

const UPDATABLE_KEYS: Array<keyof Omit<EmailRule, 'id' | 'created_at' | 'updated_at'>> = [
  'client_id',
  'name',
  'description',
  'pattern',
  'match_fields',
  'action',
  'notify',
  'notify_type',
  'forward_to',
  'create_project',
  'except_phrases',
  'priority',
  'enabled',
];

export async function updateEmailRule(
  id: string,
  updates: Partial<EmailRule>,
): Promise<EmailRule | null> {
  const pool = getPgPool();
  if (!pool) return null;

  const sets: string[] = [];
  const values: unknown[] = [id];

  for (const key of UPDATABLE_KEYS) {
    if (updates[key] === undefined) continue;
    values.push(updates[key]);
    if (key === 'client_id') {
      sets.push(`client_id = $${values.length}::uuid`);
    } else {
      sets.push(`${key} = $${values.length}`);
    }
  }

  if (sets.length === 0) return readEmailRule(id);

  sets.push('updated_at = NOW()');

  try {
    const { rows } = await pool.query(
      `UPDATE ${RULES_TABLE} SET ${sets.join(', ')}
       WHERE id = $1::uuid
       RETURNING ${COLUMNS}`,
      values,
    );
    const row = rows[0];
    return row ? mapRow(row as Record<string, unknown>) : null;
  } catch (e) {
    console.error('[pgEmailRules] updateEmailRule error', e);
    return null;
  }
}

export async function deleteEmailRule(id: string): Promise<boolean> {
  const pool = getPgPool();
  if (!pool) return false;
  try {
    const { rowCount } = await pool.query(`DELETE FROM ${RULES_TABLE} WHERE id = $1::uuid`, [id]);
    return (rowCount ?? 0) > 0;
  } catch (e) {
    console.error('[pgEmailRules] deleteEmailRule error', e);
    return false;
  }
}

/** First enabled rule match in priority order; skips disabled rules. */
export async function applyRulesToEmail(
  email: { subject: string; body: string },
  clientId?: string,
): Promise<EmailRuleMatch | null> {
  try {
    const rules = await listEmailRules(clientId);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (ruleMatches(rule, email)) {
        return { ruleId: rule.id, action: rule.action };
      }
    }
    return null;
  } catch (e) {
    console.error('[pgEmailRules] applyRulesToEmail error', e);
    return null;
  }
}
