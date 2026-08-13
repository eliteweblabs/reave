-- Allow Apple Maps as a reviews-triage platform (same listing as Apple Business Connect).

ALTER TABLE online_reviews DROP CONSTRAINT IF EXISTS online_reviews_platform_check;
ALTER TABLE online_reviews ADD CONSTRAINT online_reviews_platform_check
  CHECK (platform IN ('google', 'apple', 'yelp', 'facebook', 'tripadvisor', 'other'));

COMMENT ON TABLE online_reviews IS 'Company reviews from Google, Apple Maps, Yelp, Facebook, Tripadvisor, etc. with manual response to-do workflow.';
