-- Extend personal todos with project link, assignment, manual sort order, and section label.

ALTER TABLE todos ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS job_slug VARCHAR(255);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS assignee VARCHAR(255);
ALTER TABLE todos ADD COLUMN IF NOT EXISTS section VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_todos_sort_order ON todos (status, sort_order ASC, updated_at DESC);

COMMENT ON COLUMN todos.job_slug IS 'Optional linked work/project slug';
COMMENT ON COLUMN todos.assignee IS 'Optional assignee name';
COMMENT ON COLUMN todos.section IS 'Optional grouping label (e.g. Product Backlog)';
