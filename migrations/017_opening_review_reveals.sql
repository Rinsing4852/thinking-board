ALTER TABLE opening_review_events
    ADD COLUMN revealed INTEGER NOT NULL DEFAULT 0 CHECK(revealed IN (0, 1));
