/**
 * Persist pinned Telegram deploy-status message id per chat.
 * Postgres (DATABASE_URL) when set, otherwise JSON under src/knowledge/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { serverEnv } from './serverEnv';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS telegram_deploy_pin (
  chat_id     BIGINT PRIMARY KEY,
  message_id  BIGINT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
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

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function pinFilePath(): string {
  return join(projectRoot(), 'src', 'knowledge', 'telegram-deploy-pin.json');
}

function readFilePin(chatId: number): number | null {
  try {
    const path = pinFilePath();
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>;
    const id = data[String(chatId)];
    return typeof id === 'number' && Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

function writeFilePin(chatId: number, messageId: number): boolean {
  try {
    const path = pinFilePath();
    mkdirSync(dirname(path), { recursive: true });
    let data: Record<string, number> = {};
    if (existsSync(path)) {
      try {
        data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>;
      } catch {
        data = {};
      }
    }
    data[String(chatId)] = messageId;
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[deploy-pin] file write failed', e);
    return false;
  }
}

async function readPgPin(chatId: number): Promise<number | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const res = await pool.query<{ message_id: string }>(
    'SELECT message_id FROM telegram_deploy_pin WHERE chat_id = $1 LIMIT 1',
    [chatId],
  );
  const raw = res.rows[0]?.message_id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

async function writePgPin(chatId: number, messageId: number): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) return false;
  await pool.query(
    `INSERT INTO telegram_deploy_pin (chat_id, message_id, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (chat_id) DO UPDATE SET message_id = $2, updated_at = now()`,
    [chatId, messageId],
  );
  return true;
}

export async function getStoredDeployPinMessageId(chatId: number): Promise<number | null> {
  if (databaseUrl()) return readPgPin(chatId);
  return readFilePin(chatId);
}

export async function setStoredDeployPinMessageId(chatId: number, messageId: number): Promise<boolean> {
  if (databaseUrl()) return writePgPin(chatId, messageId);
  return writeFilePin(chatId, messageId);
}
