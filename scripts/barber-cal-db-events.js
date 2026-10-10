/**
 * Seed barber menu event types directly in Cal.com Postgres (no API keys).
 * Self-hosted cal.com Docker gates API keys as a commercial feature.
 */
import pg from 'pg';
import { barberConfigPriceToCents } from '../src/lib/calcomBarberPaymentMetadata.ts';
import { upsertCalcomEventTypes } from '../src/lib/calcomOwnerProvision.ts';
import { RAILWAY_GRAPHQL, railwayGql, resolveBarberCalService } from './barber-cal-railway.js';

const { Pool } = pg;

export async function resolveBarberDatabaseUrl(cfg) {
  const fromEnv =
    process.env.CALCOM_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.DATABASE_DIRECT_URL?.trim();
  if (fromEnv && !fromEnv.includes('${{')) return fromEnv;

  const token = process.env.RAILWAY_API_TOKEN?.trim();
  if (!token) return null;

  const dbName = `${cfg.slug}-db`;
  const { project, env, svc } = await resolveBarberCalService(cfg.name, dbName);
  const data = await railwayGql(
    `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { projectId: project.id, environmentId: env.id, serviceId: svc.id },
  );
  const vars = data.variables ?? {};
  return (
    vars.DATABASE_PUBLIC_URL?.trim() ||
    vars.DATABASE_DIRECT_URL?.trim() ||
    vars.DATABASE_URL?.trim() ||
    null
  );
}

/**
 * Remove/hide Cal defaults and any event type not in configs/*.json services[].
 * Deletes when no bookings reference the row; otherwise hides.
 */
export async function pruneNonBarberEventTypes(query, userId, allowedSlugs) {
  const allowed = [...allowedSlugs];
  if (!allowed.length) return { deleted: 0, hidden: 0 };

  const del = await query(
    `DELETE FROM "EventType" et
     WHERE et."userId" = $1
       AND NOT (et.slug = ANY($2::text[]))
       AND NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b."eventTypeId" = et.id)`,
    [userId, allowed],
  );

  const hid = await query(
    `UPDATE "EventType"
     SET hidden = true, "updatedAt" = NOW()
     WHERE "userId" = $1
       AND NOT (slug = ANY($2::text[]))
       AND (hidden IS NOT TRUE OR hidden IS NULL)`,
    [userId, allowed],
  );

  return { deleted: del.rowCount ?? 0, hidden: hid.rowCount ?? 0 };
}

async function refreshBarberEventTypesFromSeeds(query, userId, seeds) {
  let updated = 0;
  for (const s of seeds) {
    const r = await query(
      `UPDATE "EventType"
       SET title = $1, length = $2, description = $3, price = $4, currency = 'usd',
           hidden = false, "updatedAt" = NOW()
       WHERE "userId" = $5 AND slug = $6`,
      [s.title, s.length, s.description, s.price ?? 0, userId, s.slug],
    );
    updated += r.rowCount ?? 0;
  }
  return updated;
}

export async function syncBarberEventTypesToDatabase(databaseUrl, cfg, timezone = 'America/New_York') {
  const url = databaseUrl.trim();
  if (!url) throw new Error('database URL is required');

  const pool = new Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 1,
  });
  const query = (sql, values) => pool.query(sql, values);

  try {
    const userRes = await query(
      'SELECT id FROM users WHERE username = $1 LIMIT 1',
      [cfg.slug],
    );
    let userId = userRes.rows[0]?.id;
    if (!userId) {
      const alt = await query('SELECT id FROM "User" WHERE username = $1 LIMIT 1', [cfg.slug]);
      userId = alt.rows[0]?.id;
    }
    if (!userId) {
      throw new Error(
        `No Cal.com user with username "${cfg.slug}". Finish Cal signup with that username first.`,
      );
    }

    const seeds = cfg.services.map((s) => ({
      slug: s.slug,
      title: s.name,
      length: s.duration,
      description: `${cfg.name} — ${s.duration} min`,
      price: barberConfigPriceToCents(s.price),
    }));
    const allowedSlugs = seeds.map((s) => s.slug);

    const pruned = await pruneNonBarberEventTypes(query, userId, allowedSlugs);
    const upsert = await upsertCalcomEventTypes(query, userId, timezone, seeds);
    const updated = await refreshBarberEventTypesFromSeeds(query, userId, seeds);

    return {
      ...upsert,
      prunedDeleted: pruned.deleted,
      prunedHidden: pruned.hidden,
      updated,
      allowedSlugs,
    };
  } finally {
    await pool.end();
  }
}
