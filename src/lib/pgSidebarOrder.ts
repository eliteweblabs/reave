/**
 * Manual sidebar list order (chats, projects, knowledge, clients).
 * Todos keep their own sort_order column on the todos table.
 */

import pg from 'pg';
import { serverEnv } from './serverEnv';

export type SidebarListName = 'chats' | 'work' | 'knowledge' | 'clients';

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sidebar_list_order (
  list_name  VARCHAR(32) NOT NULL,
  item_key   VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (list_name, item_key)
);
CREATE INDEX IF NOT EXISTS idx_sidebar_list_order ON sidebar_list_order (list_name, sort_order ASC);
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
      .query(TABLE_SQL)
      .then(() => undefined)
      .catch((e) => {
        _schemaReady = null;
        throw e;
      });
  }
  await _schemaReady;
  return pool;
}

export function isSidebarOrderDbConfigured(): boolean {
  return !!databaseUrl();
}

export async function dbGetSidebarOrder(listName: SidebarListName): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const pool = await ensureSchema();
    if (!pool) return map;
    const { rows } = await pool.query<{ item_key: string; sort_order: number }>(
      `SELECT item_key, sort_order FROM sidebar_list_order WHERE list_name = $1 ORDER BY sort_order ASC`,
      [listName],
    );
    for (const row of rows) map.set(row.item_key, row.sort_order);
    return map;
  } catch (e) {
    console.error('[sidebar-order:pg] get error:', e);
    return map;
  }
}

export async function dbReorderSidebarList(
  listName: SidebarListName,
  keys: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const pool = await ensureSchema();
    if (!pool) return { ok: false, error: 'Database not configured — set DATABASE_URL.' };

    const cleanKeys = keys.map((k) => k.trim()).filter(Boolean);
    if (cleanKeys.length === 0) return { ok: false, error: 'keys required' };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < cleanKeys.length; i++) {
        await client.query(
          `INSERT INTO sidebar_list_order (list_name, item_key, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (list_name, item_key) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
          [listName, cleanKeys[i], i],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** Sort items: explicit order first, then fallback comparator for unordered items. */
export function sortBySidebarOrder<T>(
  items: T[],
  orderMap: Map<string, number>,
  getKey: (item: T) => string,
  fallbackSort: (a: T, b: T) => number,
): T[] {
  return [...items].sort((a, b) => {
    const aKey = getKey(a);
    const bKey = getKey(b);
    const aOrder = orderMap.has(aKey) ? orderMap.get(aKey)! : Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.has(bKey) ? orderMap.get(bKey)! : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return fallbackSort(a, b);
  });
}
