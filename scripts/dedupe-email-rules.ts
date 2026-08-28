/**
 * Review email_rules and collapse identical copies (catalog clones + same-content rows).
 * Dry-run:  railway run -p <reave.app> -e production -s reave -- npx tsx scripts/dedupe-email-rules.ts
 * Apply:    ... -- npx tsx scripts/dedupe-email-rules.ts --apply
 */
import pg from 'pg';
import {
  applyRepoCatalog,
  persistEmailRulesConfig,
  normalizeEmailRuleSortOrder,
  type EmailRuleRecord,
  type EmailRulesConfig,
} from '../src/lib/emailRuleStore';
import { matchingCatalogDefinition } from '../src/lib/emailRules';
import { databaseUrl } from '../src/lib/pgPool';

function fingerprint(r: EmailRuleRecord): string {
  const catalog = matchingCatalogDefinition(r);
  if (catalog) {
    return `catalog:${catalog.status}::${[...catalog.phrases]
      .map((p) => p.toLowerCase())
      .sort()
      .join('|')}`;
  }
  return JSON.stringify({
    scope: r.scope === 'universal' ? 'universal' : 'personal',
    title: (r.title || '').trim().toLowerCase(),
    status: String(r.status || '').toUpperCase(),
    phrases: (r.phrases || [])
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
      .sort(),
    except: (r.exceptPhrases || [])
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
      .sort(),
    fields: [...(r.fields || [])].map(String).sort(),
    matchMode: r.matchMode === 'all' ? 'all' : 'any',
    notify: r.notify === true,
    forwardTo: r.forwardTo || '',
  });
}

function pickWinner(group: EmailRuleRecord[]): EmailRuleRecord {
  const sorted = [...group].sort((a, b) => {
    const hitDiff = (Number(b.hitCount) || 0) - (Number(a.hitCount) || 0);
    if (hitDiff) return hitDiff;
    const created = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    if (created) return created;
    return String(a.id).localeCompare(String(b.id));
  });
  const winner = { ...sorted[0]! };
  winner.hitCount = group.reduce((n, r) => n + (Number(r.hitCount) || 0), 0);
  const lasts = group
    .map((r) => r.lastMatchedAt)
    .filter((v): v is string => Boolean(v))
    .sort();
  if (lasts.length) winner.lastMatchedAt = lasts[lasts.length - 1];
  return winner;
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
  expires_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  summary_override: string | null;
  forward_to: string | null;
  create_project: boolean;
  hit_count: number;
  last_matched_at: Date | string | null;
  except_phrases: unknown;
  notify_push: boolean | null;
  notify_dashboard: boolean | null;
  notify_actions: unknown;
  scope: string;
}): EmailRuleRecord {
  const phrases = Array.isArray(row.phrases) ? row.phrases.map(String) : [];
  const fields = Array.isArray(row.fields) ? row.fields.map(String) : ['subject', 'body'];
  const exceptPhrases = Array.isArray(row.except_phrases) ? row.except_phrases.map(String) : [];
  return {
    id: row.id,
    sortOrder: row.sort_order,
    title: row.title,
    status: row.status,
    description: row.description || undefined,
    phrases,
    matchMode: row.match_mode === 'all' ? 'all' : 'any',
    fields: fields as EmailRuleRecord['fields'],
    notify: row.notify,
    enabled: row.enabled,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    summaryOverride: row.summary_override || undefined,
    forwardTo: row.forward_to,
    createProject: row.create_project === true,
    hitCount: row.hit_count || 0,
    lastMatchedAt: row.last_matched_at ? new Date(row.last_matched_at).toISOString() : null,
    exceptPhrases,
    notifyPush: row.notify_push ?? undefined,
    notifyDashboard: row.notify_dashboard ?? undefined,
    notifyActions: Array.isArray(row.notify_actions) ? row.notify_actions.map(String) as EmailRuleRecord['notifyActions'] : [],
    scope: row.scope === 'universal' ? 'universal' : 'personal',
  };
}

async function loadRawRules(): Promise<{ notifyOnUnmatched: boolean; rules: EmailRuleRecord[] }> {
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: /sslmode=(require|verify-full|verify-ca)/i.test(url) ? { rejectUnauthorized: false } : undefined,
    max: 2,
  });
  try {
    const cfg = await pool.query<{ notify_on_unmatched: boolean }>(
      `SELECT notify_on_unmatched FROM email_triage_config WHERE id = 1`,
    );
    const { rows } = await pool.query(
      `SELECT id, sort_order, title, status, description, phrases, match_mode, fields, notify, enabled,
              expires_at, created_at, updated_at, summary_override, forward_to, create_project, hit_count, last_matched_at,
              except_phrases, notify_push, notify_dashboard, notify_actions, scope
       FROM email_rules ORDER BY sort_order ASC, created_at ASC`,
    );
    return {
      notifyOnUnmatched: cfg.rows[0]?.notify_on_unmatched ?? false,
      rules: rows.map(rowToRecord),
    };
  } finally {
    await pool.end();
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const raw = await loadRawRules();
  const before = raw.rules.length;
  const groups = new Map<string, EmailRuleRecord[]>();
  for (const r of raw.rules) {
    const key = fingerprint(r);
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }

  const titles = new Map<string, number>();
  for (const r of raw.rules) {
    const t = `${r.scope || 'personal'} · ${r.title || r.status}`;
    titles.set(t, (titles.get(t) || 0) + 1);
  }
  console.log(`Loaded ${before} rules`);
  console.log('By title:');
  for (const [t, n] of [...titles.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`  ${String(n).padStart(4)}  ${t}`);
  }

  const dupGroups = [...groups.entries()].filter(([, g]) => g.length > 1);
  console.log(`\n${dupGroups.length} duplicate group(s)`);
  for (const [key, group] of dupGroups.sort((a, b) => b[1].length - a[1].length)) {
    const sample = group[0]!;
    const hits = group.reduce((n, r) => n + (Number(r.hitCount) || 0), 0);
    console.log(
      `  ×${group.length}  ${sample.title || sample.status}  [${sample.scope || 'personal'} · ${sample.status}]  hits=${hits}  ${key.startsWith('catalog:') ? 'catalog' : 'identical'}`,
    );
  }

  function isEmptyDraft(r: EmailRuleRecord): boolean {
    const title = (r.title || '').trim().toLowerCase();
    const phrases = (r.phrases || []).map((p) => p.trim()).filter(Boolean);
    return title === 'new rule' && phrases.length === 0 && String(r.status || '').toUpperCase() === 'CUSTOM';
  }

  const collapsed: EmailRuleRecord[] = [];
  for (const [, group] of groups) {
    if (group.every(isEmptyDraft)) {
      console.log(`  drop empty draft group ×${group.length}  New rule`);
      continue;
    }
    collapsed.push(group.length === 1 ? group[0]! : pickWinner(group));
  }
  const cataloged = applyRepoCatalog(collapsed);
  const numbered = normalizeEmailRuleSortOrder(cataloged.rules);
  const removed = before - numbered.rules.length;
  console.log(
    `\nKeep ${numbered.rules.length} · remove ${removed} · catalogChanged=${cataloged.changed} · sortChanged=${numbered.changed}`,
  );

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to persist.');
    return;
  }
  if (removed <= 0 && !cataloged.changed && !numbered.changed) {
    console.log('Nothing to persist.');
    return;
  }

  const next: EmailRulesConfig = {
    notifyOnUnmatched: raw.notifyOnUnmatched,
    scopeSeeded: true,
    rules: numbered.rules,
  };
  const ok = await persistEmailRulesConfig(next);
  if (!ok) throw new Error('persist failed');
  const after = await loadRawRules();
  console.log(`Applied. Now ${after.rules.length} rules.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
