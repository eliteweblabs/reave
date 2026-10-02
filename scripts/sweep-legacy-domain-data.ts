/**
 * Audit (and optionally fix) Postgres rows that still reference reave.app after rekko.studio cutover.
 *
 *   npx tsx scripts/sweep-legacy-domain-data.ts           # report only
 *   npx tsx scripts/sweep-legacy-domain-data.ts --apply   # rewrite reave.app → rekko.studio in known columns
 *
 * Production: railway run --service reave -- npx tsx scripts/sweep-legacy-domain-data.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { serverEnv } from '../src/lib/serverEnv.ts';

/** Local runs: load DATABASE_URL from .env when not exported. */
function loadDotEnv(): void {
  if (serverEnv('DATABASE_URL')?.trim()) return;
  try {
    const text = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key]) continue;
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    /* no .env */
  }
}

loadDotEnv();

const LEGACY = 'reave.app';
const CANONICAL = 'rekko.studio';

const APPLY = process.argv.includes('--apply');

type Hit = { table: string; column: string; count: number };

/** Columns where domain rewrites are safe (URLs / admin deep links / mailboxes). */
const REWRITE_TARGETS: Array<{ table: string; column: string }> = [
  { table: 'admin_push_alerts', column: 'url' },
  { table: 'admin_push_alerts', column: 'detail' },
  { table: 'admin_push_alerts', column: 'title' },
  { table: 'email_inbox', column: 'action_url' },
  { table: 'email_inbox', column: 'body_html' },
  { table: 'email_inbox', column: 'body_text' },
  { table: 'company_config', column: 'domain' },
  { table: 'company_config', column: 'support_email' },
  { table: 'company_config', column: 'from_email' },
  { table: 'app_settings', column: 'value' },
  { table: 'client_knowledge', column: 'content' },
  { table: 'client_knowledge', column: 'title' },
  { table: 'project_links', column: 'url' },
  { table: 'jobs', column: 'website' },
  { table: 'email_drafts', column: 'body_html' },
  { table: 'email_drafts', column: 'body_text' },
  { table: 'chat_messages', column: 'content' },
  { table: 'sales_proposals', column: 'payload' },
];

function replaceLegacyHost(text: string): string {
  return text
    .replace(/https:\/\/([a-z0-9-]+\.)?reave\.app/gi, (_, sub: string) =>
      sub ? `https://${sub}${CANONICAL}` : `https://${CANONICAL}`,
    )
    .replace(/http:\/\/([a-z0-9-]+\.)?reave\.app/gi, (_, sub: string) =>
      sub ? `http://${sub}${CANONICAL}` : `http://${CANONICAL}`,
    )
    .replace(/@inbound\.reave\.app/gi, `@inbound.${CANONICAL}`)
    .replace(/@reave\.app/gi, `@${CANONICAL}`)
    .replace(/\breave\.app\b/gi, CANONICAL);
}

async function main(): Promise<void> {
  const url = serverEnv('DATABASE_URL')?.trim();
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  const hits: Hit[] = [];

  const { rows: tables } = await pool.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY 1`);

  for (const { table_name } of tables) {
    const { rows: cols } = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
         AND data_type IN ('text', 'character varying', 'jsonb', 'json')`,
      [table_name],
    );
    for (const { column_name } of cols) {
      try {
        const { rows } = await pool.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM ${table_name}
           WHERE ${column_name}::text ILIKE $1`,
          [`%${LEGACY}%`],
        );
        if (rows[0]?.n > 0) hits.push({ table: table_name, column: column_name, count: rows[0].n });
      } catch {
        /* skip bad ident */
      }
    }
  }

  console.log(`\n=== Legacy host "${LEGACY}" in Postgres (${hits.length} column(s) with hits) ===\n`);
  for (const h of hits.sort((a, b) => b.count - a.count)) {
    console.log(`  ${h.table}.${h.column}: ${h.count}`);
  }

  console.log('\n=== Notification / push health ===\n');
  const stats = async (label: string, sql: string) => {
    try {
      const { rows } = await pool.query<{ n: number }>(sql);
      console.log(`  ${label}: ${rows[0]?.n ?? '—'}`);
    } catch {
      console.log(`  ${label}: (table missing)`);
    }
  };
  await stats('admin_push_alerts pending (staff_ack_at IS NULL)', `
    SELECT COUNT(*)::int AS n FROM admin_push_alerts WHERE staff_ack_at IS NULL`);
  await stats('admin_push_alerts pending last 14d', `
    SELECT COUNT(*)::int AS n FROM admin_push_alerts
    WHERE staff_ack_at IS NULL AND created_at >= now() - interval '14 days'`);
  await stats('admin_push_alerts with legacy url', `
    SELECT COUNT(*)::int AS n FROM admin_push_alerts WHERE url ILIKE '%reave.app%'`);
  await stats('engagement_events pending', `
    SELECT COUNT(*)::int AS n FROM engagement_events WHERE staff_ack_at IS NULL`);
  await stats('push_subscriptions total', `SELECT COUNT(*)::int AS n FROM push_subscriptions`);
  await stats('email_inbox active (not junk/deleted) last 7d', `
    SELECT COUNT(*)::int AS n FROM email_inbox
    WHERE received_at >= now() - interval '7 days'
      AND COALESCE(category, '') NOT IN ('junk', 'deleted')`);

  const company = await pool.query<{ domain: string | null; support_email: string | null; from_email: string | null }>(
    `SELECT domain, support_email, from_email FROM company_config WHERE id = 1`,
  ).catch(() => ({ rows: [] }));
  if (company.rows[0]) {
    console.log('\n=== company_config (id=1) ===\n');
    console.log(' ', JSON.stringify(company.rows[0], null, 0));
  }

  if (APPLY) {
    console.log(`\n=== Applying rewrites (${LEGACY} → ${CANONICAL}) ===\n`);
    let updated = 0;
    try {
      const domainFix = await pool.query(
        `UPDATE company_config SET domain = $1
         WHERE lower(trim(domain)) IN ($2, $3) OR domain ILIKE $4`,
        [CANONICAL, LEGACY, `www.${LEGACY}`, `%${LEGACY}%`],
      );
      if (domainFix.rowCount && domainFix.rowCount > 0) {
        console.log(`  company_config.domain (apex): ${domainFix.rowCount} row(s)`);
        updated += domainFix.rowCount;
      }
    } catch (e) {
      console.warn('  skip company_config.domain apex fix:', e instanceof Error ? e.message : e);
    }
    for (const { table, column } of REWRITE_TARGETS) {
      if (table === 'company_config' && column === 'domain') continue;
      try {
        const { rowCount } = await pool.query(
          `UPDATE ${table}
           SET ${column} = replace(replace(replace(${column}, $1, $2), $3, $4), $5, $6)
           WHERE ${column}::text ILIKE $7`,
          [
            `https://${LEGACY}`,
            `https://${CANONICAL}`,
            `@inbound.${LEGACY}`,
            `@inbound.${CANONICAL}`,
            LEGACY,
            CANONICAL,
            `%${LEGACY}%`,
          ],
        );
        if (rowCount && rowCount > 0) {
          console.log(`  ${table}.${column}: ${rowCount} row(s)`);
          updated += rowCount;
        }
      } catch (e) {
        console.warn(`  skip ${table}.${column}:`, e instanceof Error ? e.message : e);
      }
    }
    console.log(`\nTotal rows touched (may overlap): ${updated}`);
  } else {
    console.log('\n(Dry run — pass --apply to rewrite known URL/mail columns.)\n');
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
