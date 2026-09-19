CREATE TABLE opening_lesson_attempts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id),
    chapter_id TEXT NOT NULL REFERENCES opening_chapters(id),
    line_id TEXT NOT NULL REFERENCES opening_lines(id),
    current_decision INTEGER NOT NULL DEFAULT 0 CHECK(current_decision >= 0),
    status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'abandoned')),
    step_started_at TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    abandoned_at TEXT,
    created_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX opening_lesson_active_profile_idx
    ON opening_lesson_attempts(profile_id) WHERE status = 'active';

CREATE TABLE opening_lesson_answers (
    id TEXT PRIMARY KEY,
    lesson_attempt_id TEXT NOT NULL REFERENCES opening_lesson_attempts(id) ON DELETE CASCADE,
    decision_index INTEGER NOT NULL CHECK(decision_index >= 0),
    move_id TEXT NOT NULL REFERENCES opening_moves(id),
    move_answer_uci TEXT NOT NULL,
    move_answer_san TEXT NOT NULL,
    move_outcome TEXT NOT NULL CHECK(move_outcome IN ('repertoire', 'alternative', 'outside_repertoire')),
    move_duration_ms INTEGER NOT NULL CHECK(move_duration_ms >= 0),
    move_answered_at TEXT NOT NULL,
    reason_answer TEXT,
    reason_correct INTEGER CHECK(reason_correct IS NULL OR reason_correct IN (0, 1)),
    reason_revealed INTEGER NOT NULL DEFAULT 0 CHECK(reason_revealed IN (0, 1)),
    reason_duration_ms INTEGER CHECK(reason_duration_ms IS NULL OR reason_duration_ms >= 0),
    reason_answered_at TEXT,
    UNIQUE(lesson_attempt_id, decision_index)
) STRICT;

CREATE INDEX opening_lesson_attempts_profile_created_idx
    ON opening_lesson_attempts(profile_id, created_at DESC);
