-- Backfill delete_after_at for verification-code rows created before auto-delete shipped.
-- Uses received_at + 5 minutes so expired codes are picked up on the next cleanup poll.
UPDATE email_inbox
SET delete_after_at = received_at + interval '5 minutes'
WHERE verification_code IS NOT NULL
  AND delete_after_at IS NULL
  AND received_at IS NOT NULL;
