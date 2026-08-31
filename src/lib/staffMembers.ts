/**
 * Install staff roster — people the deployment owner invited into the admin OS.
 * Owner remains AGENT_ALERT_USER_ID / ADMIN_USERNAME; staff are a separate tier.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { getPgPool, databaseUrl } from './pgPool';
import { projectRoot } from './projectRoot';
import { serverEnv } from './serverEnv';

export type StaffStatus = 'invited' | 'active' | 'revoked';

export type StaffMember = {
  id: string;
  email: string;
  userId: string | null;
  status: StaffStatus;
  invitationId: string | null;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS staff_members (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL,
  user_id        TEXT,
  status         TEXT NOT NULL CHECK (status IN ('invited', 'active', 'revoked')),
  invitation_id  TEXT,
  invited_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_email_uidx
  ON staff_members (lower(email));
CREATE INDEX IF NOT EXISTS staff_members_user_id_idx
  ON staff_members (user_id)
  WHERE user_id IS NOT NULL;
`;

let _schemaReady: Promise<void> | null = null;

function staffFilePath(): string {
  const override = serverEnv('STAFF_MEMBERS_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'staff-members.json');
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function newId(): string {
  return `staff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function rowFromPg(r: Record<string, unknown>): StaffMember {
  return {
    id: String(r.id),
    email: String(r.email),
    userId: r.user_id ? String(r.user_id) : null,
    status: (r.status as StaffStatus) || 'invited',
    invitationId: r.invitation_id ? String(r.invitation_id) : null,
    invitedBy: r.invited_by ? String(r.invited_by) : null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

function parseFileMembers(raw: unknown): StaffMember[] {
  if (!Array.isArray(raw)) return [];
  const out: StaffMember[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const email = typeof o.email === 'string' ? normalizeEmail(o.email) : '';
    if (!email || !email.includes('@')) continue;
    const status =
      o.status === 'active' || o.status === 'revoked' || o.status === 'invited' ? o.status : 'invited';
    out.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : newId(),
      email,
      userId: typeof o.userId === 'string' && o.userId.trim() ? o.userId.trim() : null,
      status,
      invitationId:
        typeof o.invitationId === 'string' && o.invitationId.trim() ? o.invitationId.trim() : null,
      invitedBy: typeof o.invitedBy === 'string' && o.invitedBy.trim() ? o.invitedBy.trim() : null,
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
    });
  }
  return out;
}

async function ensureSchema(): Promise<ReturnType<typeof getPgPool>> {
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

function readFileStore(): StaffMember[] {
  try {
    const path = staffFilePath();
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { members?: unknown };
    return parseFileMembers(parsed.members ?? parsed);
  } catch (e) {
    console.error('[staff-members] file read failed', e);
    return [];
  }
}

function writeFileStore(members: StaffMember[]): void {
  const path = staffFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ members, updatedAt: new Date().toISOString() }, null, 2));
}

export function staffMembersStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
}

export async function listStaffMembers(opts?: {
  includeRevoked?: boolean;
}): Promise<StaffMember[]> {
  const pool = await ensureSchema();
  if (pool) {
    const res = opts?.includeRevoked
      ? await pool.query(`SELECT * FROM staff_members ORDER BY created_at DESC`)
      : await pool.query(
          `SELECT * FROM staff_members WHERE status <> 'revoked' ORDER BY created_at DESC`,
        );
    return res.rows.map((r) => rowFromPg(r as Record<string, unknown>));
  }
  const all = readFileStore();
  return opts?.includeRevoked ? all : all.filter((m) => m.status !== 'revoked');
}

export async function getStaffByUserId(userId: string): Promise<StaffMember | null> {
  const id = userId.trim();
  if (!id) return null;
  const pool = await ensureSchema();
  if (pool) {
    const res = await pool.query(
      `SELECT * FROM staff_members WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [id],
    );
    const row = res.rows[0];
    return row ? rowFromPg(row as Record<string, unknown>) : null;
  }
  return readFileStore().find((m) => m.userId === id && m.status === 'active') ?? null;
}

export async function getStaffByEmail(email: string): Promise<StaffMember | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const pool = await ensureSchema();
  if (pool) {
    const res = await pool.query(
      `SELECT * FROM staff_members WHERE lower(email) = $1 LIMIT 1`,
      [normalized],
    );
    const row = res.rows[0];
    return row ? rowFromPg(row as Record<string, unknown>) : null;
  }
  return readFileStore().find((m) => m.email === normalized) ?? null;
}

export async function upsertStaffInvite(input: {
  email: string;
  invitedBy: string;
  invitationId?: string | null;
  userId?: string | null;
}): Promise<StaffMember> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes('@')) {
    throw new Error('Valid email required');
  }
  const now = new Date().toISOString();
  const existing = await getStaffByEmail(email);
  const status: StaffStatus = input.userId ? 'active' : 'invited';
  const pool = await ensureSchema();

  if (pool) {
    if (existing) {
      const res = await pool.query(
        `UPDATE staff_members
         SET status = $2,
             user_id = COALESCE($3, user_id),
             invitation_id = COALESCE($4, invitation_id),
             invited_by = $5,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [existing.id, status, input.userId ?? null, input.invitationId ?? null, input.invitedBy],
      );
      return rowFromPg(res.rows[0] as Record<string, unknown>);
    }
    const id = newId();
    const res = await pool.query(
      `INSERT INTO staff_members (id, email, user_id, status, invitation_id, invited_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, email, input.userId ?? null, status, input.invitationId ?? null, input.invitedBy],
    );
    return rowFromPg(res.rows[0] as Record<string, unknown>);
  }

  const members = readFileStore();
  if (existing) {
    const next: StaffMember = {
      ...existing,
      status,
      userId: input.userId ?? existing.userId,
      invitationId: input.invitationId ?? existing.invitationId,
      invitedBy: input.invitedBy,
      updatedAt: now,
    };
    writeFileStore(members.map((m) => (m.id === existing.id ? next : m)));
    return next;
  }
  const created: StaffMember = {
    id: newId(),
    email,
    userId: input.userId ?? null,
    status,
    invitationId: input.invitationId ?? null,
    invitedBy: input.invitedBy,
    createdAt: now,
    updatedAt: now,
  };
  writeFileStore([created, ...members]);
  return created;
}

/** Link a Clerk user id when an invited staffer signs in. */
export async function activateStaffForUser(opts: {
  userId: string;
  email: string;
}): Promise<StaffMember | null> {
  const email = normalizeEmail(opts.email);
  const userId = opts.userId.trim();
  if (!email || !userId) return null;
  const existing = await getStaffByEmail(email);
  if (!existing || existing.status === 'revoked') return null;

  const pool = await ensureSchema();
  if (pool) {
    const res = await pool.query(
      `UPDATE staff_members
       SET user_id = $2, status = 'active', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [existing.id, userId],
    );
    return rowFromPg(res.rows[0] as Record<string, unknown>);
  }

  const members = readFileStore();
  const next: StaffMember = {
    ...existing,
    userId,
    status: 'active',
    updatedAt: new Date().toISOString(),
  };
  writeFileStore(members.map((m) => (m.id === existing.id ? next : m)));
  return next;
}

export async function revokeStaffMember(id: string): Promise<StaffMember | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const pool = await ensureSchema();
  if (pool) {
    const res = await pool.query(
      `UPDATE staff_members SET status = 'revoked', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [trimmed],
    );
    const row = res.rows[0];
    return row ? rowFromPg(row as Record<string, unknown>) : null;
  }
  const members = readFileStore();
  const existing = members.find((m) => m.id === trimmed);
  if (!existing) return null;
  const next: StaffMember = {
    ...existing,
    status: 'revoked',
    updatedAt: new Date().toISOString(),
  };
  writeFileStore(members.map((m) => (m.id === trimmed ? next : m)));
  return next;
}
