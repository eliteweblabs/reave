-- Online reviews inbox — fetched reviews + response to-do workflow.

CREATE TABLE IF NOT EXISTS online_reviews_config (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  google_place_id  TEXT,
  sync_enabled     BOOLEAN NOT NULL DEFAULT true,
  last_sync_at     TIMESTAMPTZ,
  last_sync_error  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS online_reviews (
  id               UUID PRIMARY KEY,
  platform         TEXT NOT NULL
    CHECK (platform IN ('google', 'yelp', 'facebook', 'tripadvisor', 'other')),
  external_id      TEXT,
  author_name      TEXT,
  rating           NUMERIC(2, 1),
  review_text      TEXT,
  review_url       TEXT,
  reviewed_at      TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'todo', 'responded', 'dismissed')),
  response_draft   TEXT,
  response_text    TEXT,
  responded_at     TIMESTAMPTZ,
  notes            TEXT,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_online_reviews_status ON online_reviews (status, reviewed_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_online_reviews_platform ON online_reviews (platform, reviewed_at DESC NULLS LAST);

COMMENT ON TABLE online_reviews IS 'Company reviews from Google/Yelp/etc. with manual response to-do workflow.';
COMMENT ON COLUMN online_reviews.status IS 'new = unseen, todo = queued for response, responded = done, dismissed = no reply needed';
