-- Personal to-do items (separate from client jobs/projects).

CREATE TABLE IF NOT EXISTS todos (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(500) NOT NULL,
  due_date    DATE,
  priority    VARCHAR(50) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status      VARCHAR(50) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'done')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todos_status ON todos (status);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos (priority);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos (due_date);
CREATE INDEX IF NOT EXISTS idx_todos_status_due ON todos (status, due_date);

COMMENT ON TABLE todos IS 'Personal to-do items — not client jobs. Mirrors runtime schema in src/lib/pgTodos.ts.';
