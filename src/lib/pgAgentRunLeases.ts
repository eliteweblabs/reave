/**
 * Durable agent-run leases — shared across Railway replicas so a new deploy
 * does not treat an in-flight turn as dead while the draining replica finishes.
 */

import pg from 'pg';
import type { AgentProgress, AgentProgressPhase } from './agentProgress';
import { getPgPool } from './pgPool';
import { serverEnv } from './serverEnv';

export type AgentRunLeaseRow = {
  user_id: string;
  thread_id: string;
  replica_id: string;
  started_at: string | Date;
  heartbeat_at: string | Date;
  phase: string | null;
  tool: string | null;
  tool_label: string | null;
  round: number | null;
  concurrent: number | null;
  partial_text: string | null;
};

export type AgentRunLease = {
  userId: string;
  threadId: string;
  replicaId: string;
  startedAt: string;
  heartbeatAt: string;
  phase: AgentProgressPhase | null;
  tool: string | null;
  toolLabel: string | null;
  round: number | null;
  concurrent: number | null;
  partialText: string | null;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_run_leases (
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  replica_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phase TEXT,
  tool TEXT,
  tool_label TEXT,
  round INTEGER,
  concurrent INTEGER,
  partial_text TEXT,
  PRIMARY KEY (user_id, thread_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_run_leases_heartbeat
  ON agent_run_leases (heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_agent_run_leases_user
  ON agent_run_leases (user_id);
`;

/** Lease is considered alive if heartbeated within this window. */
export const AGENT_RUN_LEASE_STALE_MS = 45_000;

let _schemaReady: Promise<void> | null = null;
let _replicaId: string | null = null;

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

function pgTimestamp(value: unknown): string {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asPhase(value: string | null | undefined): AgentProgressPhase | null {
  if (value === 'thinking' || value === 'tool' || value === 'complete') return value;
  return null;
}

function rowToLease(row: AgentRunLeaseRow): AgentRunLease {
  return {
    userId: row.user_id,
    threadId: row.thread_id,
    replicaId: row.replica_id,
    startedAt: pgTimestamp(row.started_at),
    heartbeatAt: pgTimestamp(row.heartbeat_at),
    phase: asPhase(row.phase),
    tool: row.tool,
    toolLabel: row.tool_label,
    round: row.round,
    concurrent: row.concurrent,
    partialText: row.partial_text,
  };
}

/** Stable id for this process — used only for debugging which replica owns a lease. */
export function agentRunReplicaId(): string {
  if (_replicaId) return _replicaId;
  const fromEnv =
    serverEnv('RAILWAY_REPLICA_ID')?.trim() ||
    serverEnv('RAILWAY_DEPLOYMENT_ID')?.trim() ||
    '';
  _replicaId = fromEnv || `pid-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  return _replicaId;
}

export function isAgentRunLeaseFresh(
  heartbeatAt: string | Date | null | undefined,
  nowMs = Date.now(),
  staleMs = AGENT_RUN_LEASE_STALE_MS,
): boolean {
  if (heartbeatAt == null) return false;
  const ms =
    heartbeatAt instanceof Date ? heartbeatAt.getTime() : Date.parse(String(heartbeatAt));
  if (!Number.isFinite(ms)) return false;
  return nowMs - ms <= staleMs;
}

export function agentRunLeaseToProgress(lease: AgentRunLease): AgentProgress | null {
  if (!lease.phase) {
    return {
      phase: 'thinking',
      startedAt: Date.parse(lease.startedAt) || Date.now(),
      updatedAt: Date.parse(lease.heartbeatAt) || Date.now(),
      ...(lease.partialText ? { partialText: lease.partialText } : {}),
    };
  }
  return {
    phase: lease.phase,
    ...(lease.tool ? { tool: lease.tool } : {}),
    ...(lease.toolLabel ? { toolLabel: lease.toolLabel } : {}),
    ...(lease.round != null ? { round: lease.round } : {}),
    ...(lease.concurrent != null ? { concurrent: lease.concurrent } : {}),
    startedAt: Date.parse(lease.startedAt) || Date.now(),
    updatedAt: Date.parse(lease.heartbeatAt) || Date.now(),
    ...(lease.partialText ? { partialText: lease.partialText } : {}),
  };
}

export async function upsertAgentRunLease(
  userId: string,
  threadId: string,
): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO agent_run_leases (
         user_id, thread_id, replica_id, started_at, heartbeat_at, phase
       ) VALUES ($1, $2, $3, $4, $4, 'thinking')
       ON CONFLICT (user_id, thread_id) DO UPDATE SET
         replica_id = EXCLUDED.replica_id,
         started_at = EXCLUDED.started_at,
         heartbeat_at = EXCLUDED.heartbeat_at,
         phase = 'thinking',
         tool = NULL,
         tool_label = NULL,
         round = NULL,
         concurrent = NULL,
         partial_text = NULL`,
      [userId, threadId, agentRunReplicaId(), now],
    );
    return true;
  } catch (e) {
    console.warn('[agent-run-lease] upsert failed:', e);
    return false;
  }
}

export async function heartbeatAgentRunLease(
  userId: string,
  threadId: string,
  progress?: AgentProgress | null,
): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    const now = new Date().toISOString();
    const result = await pool.query(
      `UPDATE agent_run_leases SET
         heartbeat_at = $3,
         replica_id = $4,
         phase = COALESCE($5, phase),
         tool = $6,
         tool_label = $7,
         round = $8,
         concurrent = $9,
         partial_text = $10
       WHERE user_id = $1 AND thread_id = $2`,
      [
        userId,
        threadId,
        now,
        agentRunReplicaId(),
        progress?.phase ?? null,
        progress?.tool ?? null,
        progress?.toolLabel ?? null,
        progress?.round ?? null,
        progress?.concurrent ?? null,
        progress?.partialText ?? null,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (e) {
    console.warn('[agent-run-lease] heartbeat failed:', e);
    return false;
  }
}

export async function clearAgentRunLease(userId: string, threadId: string): Promise<boolean> {
  try {
    const pool = await ensureSchema();
    if (!pool) return false;
    const result = await pool.query(
      `DELETE FROM agent_run_leases WHERE user_id = $1 AND thread_id = $2`,
      [userId, threadId],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (e) {
    console.warn('[agent-run-lease] clear failed:', e);
    return false;
  }
}

export async function getAliveAgentRunLease(
  userId: string,
  threadId: string,
): Promise<AgentRunLease | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<AgentRunLeaseRow>(
      `SELECT user_id, thread_id, replica_id, started_at, heartbeat_at,
              phase, tool, tool_label, round, concurrent, partial_text
       FROM agent_run_leases
       WHERE user_id = $1 AND thread_id = $2`,
      [userId, threadId],
    );
    const row = rows[0];
    if (!row) return null;
    const lease = rowToLease(row);
    if (!isAgentRunLeaseFresh(lease.heartbeatAt)) return null;
    return lease;
  } catch (e) {
    console.warn('[agent-run-lease] get failed:', e);
    return null;
  }
}

/** Alive leases for a user — powers the sidebar "working" indicator across replicas. */
export async function listAliveAgentRunThreadIds(userId: string): Promise<string[]> {
  try {
    const pool = await ensureSchema();
    if (!pool) return [];
    const cutoff = new Date(Date.now() - AGENT_RUN_LEASE_STALE_MS).toISOString();
    const { rows } = await pool.query<{ thread_id: string }>(
      `SELECT thread_id FROM agent_run_leases
       WHERE user_id = $1 AND heartbeat_at >= $2`,
      [userId, cutoff],
    );
    return rows.map((r) => r.thread_id);
  } catch (e) {
    console.warn('[agent-run-lease] list failed:', e);
    return [];
  }
}
