/**
 * Enable Stripe "pay on booking" on barber Cal.com event types (Postgres metadata).
 */
import pg from 'pg';
import { calcomStripeEventMetadata } from '../src/lib/calcomBarberPaymentMetadata.ts';
import { resolveBarberDatabaseUrl } from './barber-cal-db-events.js';

const { Pool } = pg;

export async function syncBarberCalPayments(databaseUrl, cfg) {
  const url = databaseUrl.trim();
  if (!url) throw new Error('database URL is required');

  const pool = new Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 1,
  });

  try {
    const userRes = await pool.query('SELECT id FROM users WHERE username = $1 LIMIT 1', [cfg.slug]);
    const userId = userRes.rows[0]?.id;
    if (!userId) {
      throw new Error(`No Cal.com user "${cfg.slug}". Finish Cal signup first.`);
    }

    const slugs = cfg.services.map((s) => s.slug);
    const bySlug = new Map(cfg.services.map((s) => [s.slug, s]));
    const existing = await pool.query(
      `SELECT id, slug, metadata FROM "EventType" WHERE "userId" = $1 AND slug = ANY($2::text[])`,
      [userId, slugs],
    );

    let updated = 0;
    for (const row of existing.rows) {
      const svc = bySlug.get(row.slug);
      if (!svc || !(svc.price > 0)) continue;
      const metadata = calcomStripeEventMetadata(svc.price, 'usd', 'ON_BOOKING');
      await pool.query(
        `UPDATE "EventType"
         SET price = $1, currency = 'usd', metadata = $2::jsonb, "updatedAt" = NOW()
         WHERE id = $3`,
        [svc.price, JSON.stringify(metadata), row.id],
      );
      updated += 1;
    }

    return { updated, eventTypes: existing.rows.length };
  } finally {
    await pool.end();
  }
}
