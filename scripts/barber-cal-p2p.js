/**
 * Free booking on Cal.com — list prices for display, no Stripe pay-on-booking.
 */
import pg from 'pg';
import { barberConfigPriceToCents } from '../src/lib/calcomBarberPaymentMetadata.ts';
import { resolveBarberDatabaseUrl } from './barber-cal-db-events.js';

const { Pool } = pg;

/** Metadata without Stripe app (confirm-only bookings). */
export function calcomP2PEventMetadata(priceCents) {
  return {
    price: priceCents,
    currency: 'usd',
  };
}

export async function syncBarberCalP2P(databaseUrl, cfg) {
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
      if (!svc) continue;
      const cents = svc.price > 0 ? barberConfigPriceToCents(svc.price) : 0;
      const metadata = calcomP2PEventMetadata(cents);
      await pool.query(
        `UPDATE "EventType"
         SET price = $1, currency = 'usd', metadata = $2::jsonb, "updatedAt" = NOW()
         WHERE id = $3`,
        [cents, JSON.stringify(metadata), row.id],
      );
      updated += 1;
    }

    return { updated, eventTypes: existing.rows.length };
  } finally {
    await pool.end();
  }
}

export async function runBarberCalP2PFromConfig(cfg) {
  const dbUrl = await resolveBarberDatabaseUrl(cfg);
  if (!dbUrl) throw new Error('Set CALCOM_DATABASE_URL or RAILWAY_API_TOKEN to reach Cal Postgres.');
  return syncBarberCalP2P(dbUrl, cfg);
}
