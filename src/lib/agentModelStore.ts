/**
 * Persist the runtime Claude model choice for chat, Telegram, and dashboard agent.
 * Postgres (DATABASE_URL) when set, otherwise JSON under src/knowledge/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { normalizeAgentModelInput } from './agentModel';
import { serverEnv } from './serverEnv';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_config (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  model      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO agent_config (id, model) VALUES (1, NULL)
  ON CONFLICT (id) DO NOTHING;
`;

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;
let _cached: string | null | undefined = undefined;

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

function modelFilePath(): string {
  const override = serverEnv('AGENT_MODEL_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'agent-model.json');
}

function readFileModel(): string | null {
  try {
    const path = modelFilePath();
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, 'utf8')) as { model?: unknown };
    const raw = typeof data.model === 'string' ? data.model.trim() : '';
    if (!raw) return null;
    return normalizeAgentModelInput(raw);
  } catch {
    return null;
  }
}

function writeFileModel(model: string | null): boolean {
  try {
    const path = modelFilePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ model }, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[agent-model] file write failed', e);
    return false;
  }
}

async function readPgModel(): Promise<string | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const res = await pool.query<{ model: string | null }>(
    'SELECT model FROM agent_config WHERE id = 1 LIMIT 1',
  );
  const raw = res.rows[0]?.model?.trim() || '';
  if (!raw) return null;
  return normalizeAgentModelInput(raw);
}

async function writePgModel(model: string | null): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) return false;
  await pool.query(
    'UPDATE agent_config SET model = $1, updated_at = now() WHERE id = 1',
    [model],
  );
  return true;
}

export function agentModelStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
}

export async function getStoredAgentModel(): Promise<string | null> {
  if (_cached !== undefined) return _cached;
  try {
    if (agentModelStorageBackend() === 'postgres') {
      _cached = await readPgModel();
    } else {
      _cached = readFileModel();
    }
  } catch (e) {
    console.error('[agent-model] read failed', e);
    _cached = null;
  }
  return _cached;
}

export async function setStoredAgentModel(model: string | null): Promise<boolean> {
  const normalized = model ? normalizeAgentModelInput(model) : null;
  if (model && !normalized) return false;

  try {
    const ok =
      agentModelStorageBackend() === 'postgres'
        ? await writePgModel(normalized)
        : writeFileModel(normalized);
    if (ok) _cached = normalized;
    return ok;
  } catch (e) {
    console.error('[agent-model] write failed', e);
    return false;
  }
}
