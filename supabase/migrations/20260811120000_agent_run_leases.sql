-- Durable in-flight agent chat leases (survive Railway deploy cutover while the
-- draining replica finishes the turn and persists its reply).
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
