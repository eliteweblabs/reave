/**
 * Seed barber menu event types directly in Cal.com Postgres (no API keys).
 * Self-hosted cal.com Docker gates API keys as a commercial feature.
 */
import pg from 'pg';
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
      price: s.price,
    }));

    return await upsertCalcomEventTypes(query, userId, timezone, seeds);
  } finally {
    await pool.end();
  }
}
