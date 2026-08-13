-- Calendar booking reminder queue (push + dashboard, default 15 minutes before start).

CREATE TABLE IF NOT EXISTS calendar_reminders (
  id              TEXT PRIMARY KEY,
  booking_uid     TEXT NOT NULL,
  offset_minutes  INT NOT NULL DEFAULT 15,
  fire_at         TIMESTAMPTZ NOT NULL,
  start_time      TIMESTAMPTZ NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  attendee        TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',
  dedup_key       TEXT NOT NULL UNIQUE,
  sent_at         TIMESTAMPTZ,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_reminders_due_idx
  ON calendar_reminders (status, fire_at);
CREATE INDEX IF NOT EXISTS calendar_reminders_booking_idx
  ON calendar_reminders (booking_uid, status);
