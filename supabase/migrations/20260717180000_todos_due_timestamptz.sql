-- Store due date + time (was DATE-only).

ALTER TABLE todos
  ALTER COLUMN due_date TYPE TIMESTAMPTZ
  USING CASE
    WHEN due_date IS NULL THEN NULL
    ELSE due_date::timestamptz
  END;

COMMENT ON COLUMN todos.due_date IS 'Due date/time (UTC in DB, ISO in API)';
