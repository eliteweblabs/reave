/**
 * Web Push subscription storage (Clerk user → browser endpoint).
 */

import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import pg from 'pg';
import { serverEnv } from './serverEnv';

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY,
  user_id    TEXT NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);
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

function subscriptionsFilePath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) break;
    dir = dirname(dir);
  }
  return join(dir, 'src', 'knowledge', 'push-subscriptions.json');
}

function readFileSubs(): PushSubscriptionRecord[] {
  const path = subscriptionsFilePath();
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { subscriptions?: PushSubscriptionRecord[] };
    return Array.isArray(data.subscriptions) ? data.subscriptions : [];
  } catch {
    return [];
  }
}

function writeFileSubs(subs: PushSubscriptionRecord[]): void {
  const path = subscriptionsFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ subscriptions: subs }, null, 2) + '\n', 'utf8');
}

export async function savePushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<PushSubscriptionRecord> {
  const pool = await ensureSchema();
  const record: PushSubscriptionRecord = {
    id: randomUUID(),
    userId: input.userId,
    endpoint: input.endpoint,
    p256dh: input.p256dh,
    auth: input.auth,
    createdAt: new Date().toISOString(),
  };

  if (pool) {
    await pool.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth`,
      [record.id, input.userId, input.endpoint, input.p256dh, input.auth],
    );
    return record;
  }

  const subs = readFileSubs().filter((s) => s.endpoint !== input.endpoint);
  subs.push(record);
  writeFileSubs(subs);
  return record;
}

export async function listPushSubscriptions(userId?: string): Promise<PushSubscriptionRecord[]> {
  const pool = await ensureSchema();
  if (pool) {
    const { rows } = userId
      ? await pool.query(
          `SELECT id, user_id, endpoint, p256dh, auth, created_at FROM push_subscriptions WHERE user_id = $1`,
          [userId],
        )
      : await pool.query(
          `SELECT id, user_id, endpoint, p256dh, auth, created_at FROM push_subscriptions`,
        );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      endpoint: r.endpoint,
      p256dh: r.p256dh,
      auth: r.auth,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }
  const subs = readFileSubs();
  return userId ? subs.filter((s) => s.userId === userId) : subs;
}

export async function removePushSubscription(id: string): Promise<void> {
  const pool = await ensureSchema();
  if (pool) {
    await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [id]);
    return;
  }
  writeFileSubs(readFileSubs().filter((s) => s.id !== id));
}

export async function removePushSubscriptionByEndpoint(userId: string, endpoint: string): Promise<void> {
  const pool = await ensureSchema();
  if (pool) {
    await pool.query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [
      userId,
      endpoint,
    ]);
    return;
  }
  writeFileSubs(readFileSubs().filter((s) => !(s.userId === userId && s.endpoint === endpoint)));
}
