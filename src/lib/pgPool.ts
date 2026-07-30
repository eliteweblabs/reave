/**
 * Shared Postgres connection pool for all DATABASE_URL-backed stores.
 * Avoids spawning dozens of separate pools (each with max: 5) per process.
 */

import pg from 'pg';
import { serverEnv } from './serverEnv';

let _pool: pg.Pool | null | undefined = undefined;

function poolSsl(url: string): pg.ConnectionConfig['ssl'] {
  if (/sslmode=(require|verify-full|verify-ca)/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

/** Returns the shared pool, or null when DATABASE_URL is unset. */
export function getPgPool(): pg.Pool | null {
  if (_pool !== undefined) return _pool;
  const url = databaseUrl();
  if (!url) {
    _pool = null;
    return null;
  }
  _pool = new pg.Pool({ connectionString: url, ssl: poolSsl(url), max: 20 });
  return _pool;
}

export function databaseUrl(): string | undefined {
  return serverEnv('DATABASE_URL')?.trim() || undefined;
}

export function isPgConfigured(): boolean {
  return !!databaseUrl();
}
