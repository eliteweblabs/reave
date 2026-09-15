#!/usr/bin/env npx tsx
/**
 * One-off: find and replace Maid & Marble branding in reave-postgres text columns.
 * Usage: DATABASE_URL=postgresql://... npx tsx scripts/rebrand-db-maid-to-luxe.ts [--dry-run]
 */
import pg from 'pg';

const dryRun = process.argv.includes('--dry-run');
const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error('DATABASE_URL missing');

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/Maid\s*&\s*Marble/gi, 'Luxe Cleaning'],
  [/Maid\s+and\s+Marble/gi, 'Luxe Cleaning'],
  [/maidandmarble\.com/gi, 'lux.cleaning'],
  [/maid-marble/gi, 'luxe-cleaning'],
  [/MaidMarble/gi, 'LuxeCleaning'],
];

const pool = new pg.Pool({
  connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
  ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 2,
});

function applyReplacements(value: string): string {
  let out = value;
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

async function main() {
  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
  );

  let updatedCells = 0;

  for (const { table_name } of tables.rows) {
    const cols = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1
         AND data_type IN ('text', 'character varying')`,
      [table_name],
    );
    if (!cols.rows.length) continue;

    const pk = await pool.query<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema='public' AND tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY'
       LIMIT 1`,
      [table_name],
    );
    const pkCol = pk.rows[0]?.column_name;

    for (const { column_name } of cols.rows) {
      const sample = await pool.query(
        `SELECT ${pkCol ? `"${pkCol}" AS pk, ` : ''}"${column_name}" AS val
         FROM "${table_name}"
         WHERE "${column_name}" ~* 'maid|marble|maidandmarble'
         LIMIT 20`,
      );
      for (const row of sample.rows) {
        const oldVal = String(row.val ?? '');
        const newVal = applyReplacements(oldVal);
        if (newVal === oldVal) continue;
        updatedCells++;
        console.log(`${table_name}.${column_name}${row.pk != null ? `[${row.pk}]` : ''}`);
        console.log(`  - ${oldVal.slice(0, 120)}${oldVal.length > 120 ? '…' : ''}`);
        console.log(`  + ${newVal.slice(0, 120)}${newVal.length > 120 ? '…' : ''}`);
        if (!dryRun) {
          if (pkCol && row.pk != null) {
            await pool.query(
              `UPDATE "${table_name}" SET "${column_name}" = $1 WHERE "${pkCol}" = $2`,
              [newVal, row.pk],
            );
          } else {
            await pool.query(`UPDATE "${table_name}" SET "${column_name}" = $1 WHERE "${column_name}" = $2`, [
              newVal,
              oldVal,
            ]);
          }
        }
      }
    }
  }

  // Force company_config core fields
  const cc = await pool.query(
    `SELECT name, legal_name, description, domain, support_email, from_email FROM company_config WHERE id=1`,
  );
  const row = cc.rows[0] as Record<string, string | null> | undefined;
  if (row) {
    const patch: Record<string, string> = {
      name: 'Luxe Cleaning',
      legal_name: 'Luxe Cleaning',
      domain: 'lux.cleaning',
      support_email: 'felicia@lux.cleaning',
      from_email: 'noreply@inbound.lux.cleaning',
    };
    if (!row.description?.trim()) {
      patch.description =
        'Woman-owned premium house cleaning in Central Massachusetts — meticulous care, reliable scheduling, and finishes that feel intentional.';
    } else if (/maid|marble/i.test(row.description)) {
      patch.description = applyReplacements(row.description);
    }
    console.log('company_config patch:', patch);
    if (!dryRun) {
      await pool.query(
        `UPDATE company_config SET
          name = COALESCE($1, name),
          legal_name = COALESCE($2, legal_name),
          description = COALESCE($3, description),
          domain = COALESCE($4, domain),
          support_email = COALESCE($5, support_email),
          from_email = COALESCE($6, from_email),
          updated_at = now()
         WHERE id = 1`,
        [
          patch.name,
          patch.legal_name,
          patch.description ?? null,
          patch.domain,
          patch.support_email,
          patch.from_email,
        ],
      );
    }
  }

  console.log(dryRun ? `[dry-run] would update ${updatedCells} cell(s)` : `Updated ${updatedCells} cell(s)`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
