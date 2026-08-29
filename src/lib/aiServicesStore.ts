/**
 * Custom AI service registry — Postgres with JSON file fallback.
 * Does not store API keys; only admin-facing metadata.
 */
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import pg from 'pg';
import {
  isAiServiceProvider,
  isAiServicePurpose,
  type AiServiceProvider,
  type AiServicePurpose,
  type CustomAiService,
} from './aiServices';
import { databaseUrl, getPgPool } from './pgPool';
import { projectRoot } from './projectRoot';
import { serverEnv } from './serverEnv';

export type AiServiceCreateInput = {
  name: string;
  provider: AiServiceProvider;
  purpose: AiServicePurpose;
  model?: string | null;
  notes?: string | null;
  enabled?: boolean;
};

export type AiServiceUpdateInput = Partial<AiServiceCreateInput>;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ai_services (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  provider    TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  model       TEXT,
  notes       TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_services_updated ON ai_services (updated_at DESC);
`;

let _schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
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

function servicesFilePath(): string {
  const override = serverEnv('AI_SERVICES_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'ai-services.json');
}

function clampText(raw: unknown, max: number): string {
  return String(raw ?? '')
    .trim()
    .slice(0, max);
}

export function normalizeAiServiceCreate(body: Record<string, unknown>): AiServiceCreateInput | string {
  const name = clampText(body.name, 120);
  if (!name) return 'Name is required.';
  if (!isAiServiceProvider(body.provider)) return 'Unknown provider.';
  if (!isAiServicePurpose(body.purpose)) return 'Unknown purpose.';
  const model = body.model == null || body.model === '' ? null : clampText(body.model, 120) || null;
  const notes = body.notes == null || body.notes === '' ? null : clampText(body.notes, 2000) || null;
  const enabled =
    body.enabled === undefined
      ? true
      : body.enabled === true || body.enabled === 1 || body.enabled === '1' || body.enabled === 'true';
  return { name, provider: body.provider, purpose: body.purpose, model, notes, enabled };
}

export function normalizeAiServiceUpdate(body: Record<string, unknown>): AiServiceUpdateInput | string {
  const patch: AiServiceUpdateInput = {};
  if (body.name !== undefined) {
    const name = clampText(body.name, 120);
    if (!name) return 'Name is required.';
    patch.name = name;
  }
  if (body.provider !== undefined) {
    if (!isAiServiceProvider(body.provider)) return 'Unknown provider.';
    patch.provider = body.provider;
  }
  if (body.purpose !== undefined) {
    if (!isAiServicePurpose(body.purpose)) return 'Unknown purpose.';
    patch.purpose = body.purpose;
  }
  if (body.model !== undefined) {
    patch.model = body.model == null || body.model === '' ? null : clampText(body.model, 120) || null;
  }
  if (body.notes !== undefined) {
    patch.notes = body.notes == null || body.notes === '' ? null : clampText(body.notes, 2000) || null;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    else if (body.enabled === 1 || body.enabled === '1' || body.enabled === 'true') patch.enabled = true;
    else if (body.enabled === 0 || body.enabled === '0' || body.enabled === 'false') patch.enabled = false;
    else return 'enabled must be a boolean.';
  }
  if (Object.keys(patch).length === 0) return 'No fields to update.';
  return patch;
}

function rowToService(row: {
  id: string;
  name: string;
  provider: string;
  purpose: string;
  model: string | null;
  notes: string | null;
  enabled: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}): CustomAiService {
  return {
    id: row.id,
    kind: 'custom',
    name: row.name,
    provider: isAiServiceProvider(row.provider) ? row.provider : 'other',
    purpose: isAiServicePurpose(row.purpose) ? row.purpose : 'other',
    model: row.model?.trim() || null,
    notes: row.notes?.trim() || null,
    enabled: row.enabled !== false,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function readFileServices(): CustomAiService[] {
  try {
    const path = servicesFilePath();
    if (!existsSync(path)) return [];
    const data = JSON.parse(readFileSync(path, 'utf8')) as { services?: unknown };
    if (!Array.isArray(data.services)) return [];
    return data.services
      .filter((item): item is CustomAiService => {
        if (!item || typeof item !== 'object') return false;
        const s = item as CustomAiService;
        return typeof s.id === 'string' && typeof s.name === 'string';
      })
      .map((s) => ({
        ...s,
        kind: 'custom' as const,
        provider: isAiServiceProvider(s.provider) ? s.provider : 'other',
        purpose: isAiServicePurpose(s.purpose) ? s.purpose : 'other',
        model: s.model?.trim() || null,
        notes: s.notes?.trim() || null,
        enabled: s.enabled !== false,
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || new Date().toISOString(),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function writeFileServices(services: CustomAiService[]): boolean {
  try {
    const path = servicesFilePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ services }, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[ai-services] file write failed', e);
    return false;
  }
}

export function aiServicesStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
}

export async function listCustomAiServices(): Promise<CustomAiService[]> {
  const pool = await ensureSchema();
  if (!pool) return readFileServices();
  const res = await pool.query<{
    id: string;
    name: string;
    provider: string;
    purpose: string;
    model: string | null;
    notes: string | null;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
  }>('SELECT * FROM ai_services ORDER BY updated_at DESC');
  return res.rows.map(rowToService);
}

export async function createCustomAiService(input: AiServiceCreateInput): Promise<CustomAiService | null> {
  const now = new Date().toISOString();
  const service: CustomAiService = {
    id: randomUUID(),
    kind: 'custom',
    name: input.name,
    provider: input.provider,
    purpose: input.purpose,
    model: input.model ?? null,
    notes: input.notes ?? null,
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };

  const pool = await ensureSchema();
  if (!pool) {
    const list = readFileServices();
    list.unshift(service);
    return writeFileServices(list) ? service : null;
  }

  await pool.query(
    `INSERT INTO ai_services (id, name, provider, purpose, model, notes, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $8::timestamptz)`,
    [
      service.id,
      service.name,
      service.provider,
      service.purpose,
      service.model,
      service.notes,
      service.enabled,
      now,
    ],
  );
  return service;
}

export async function updateCustomAiService(
  id: string,
  patch: AiServiceUpdateInput,
): Promise<CustomAiService | null> {
  const pool = await ensureSchema();
  if (!pool) {
    const list = readFileServices();
    const idx = list.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    const next: CustomAiService = {
      ...list[idx],
      ...patch,
      id,
      kind: 'custom',
      updatedAt: new Date().toISOString(),
    };
    list[idx] = next;
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return writeFileServices(list) ? next : null;
  }

  const existing = await pool.query('SELECT id FROM ai_services WHERE id = $1 LIMIT 1', [id]);
  if (!existing.rows[0]) return null;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    vals.push(patch.name);
  }
  if (patch.provider !== undefined) {
    sets.push(`provider = $${i++}`);
    vals.push(patch.provider);
  }
  if (patch.purpose !== undefined) {
    sets.push(`purpose = $${i++}`);
    vals.push(patch.purpose);
  }
  if (patch.model !== undefined) {
    sets.push(`model = $${i++}`);
    vals.push(patch.model);
  }
  if (patch.notes !== undefined) {
    sets.push(`notes = $${i++}`);
    vals.push(patch.notes);
  }
  if (patch.enabled !== undefined) {
    sets.push(`enabled = $${i++}`);
    vals.push(patch.enabled);
  }
  sets.push('updated_at = now()');
  vals.push(id);

  const res = await pool.query(
    `UPDATE ai_services SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return res.rows[0] ? rowToService(res.rows[0]) : null;
}

export async function deleteCustomAiService(id: string): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) {
    const list = readFileServices();
    const next = list.filter((s) => s.id !== id);
    if (next.length === list.length) return false;
    return writeFileServices(next);
  }
  const res = await pool.query('DELETE FROM ai_services WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}
