-- A demonstration is a persisted stage of a scheduled item, not a review event.
ALTER TABLE opening_review_queue ADD COLUMN introduction_pending INTEGER NOT NULL DEFAULT 0 CHECK(introduction_pending IN (0, 1));
ALTER TABLE opening_review_queue ADD COLUMN introduction_completed_at TEXT;
