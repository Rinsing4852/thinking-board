ALTER TABLE opening_lesson_attempts ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1 CHECK(content_version > 0);
ALTER TABLE opening_lesson_answers ADD COLUMN feedback_acknowledged_at TEXT;
ALTER TABLE opening_repertoires ADD COLUMN content_checksum TEXT;

UPDATE opening_lesson_attempts
SET content_version = COALESCE((
    SELECT content_version
    FROM opening_repertoires
    WHERE opening_repertoires.id = opening_lesson_attempts.repertoire_id
), 1);
