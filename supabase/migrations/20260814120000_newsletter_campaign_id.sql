-- Group broadcast sends so dashboard cancel/reschedule treats one campaign as one row.

ALTER TABLE newsletter_queue ADD COLUMN IF NOT EXISTS campaign_id TEXT;

CREATE INDEX IF NOT EXISTS newsletter_queue_job_idx
  ON newsletter_queue (job_slug) WHERE job_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS newsletter_queue_campaign_idx
  ON newsletter_queue (campaign_id) WHERE campaign_id IS NOT NULL;
