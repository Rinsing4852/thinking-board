-- Position recall accepts any saved reply; move recall measures a particular
-- branch. Both share positions across transpositions, but not alternatives.
CREATE TABLE opening_move_review_cards (
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    move_id TEXT NOT NULL REFERENCES opening_moves(id) ON DELETE CASCADE,
    scheduler_version TEXT NOT NULL,
    state INTEGER NOT NULL DEFAULT 0 CHECK(state BETWEEN 0 AND 3),
    due_at TEXT NOT NULL,
    stability REAL NOT NULL DEFAULT 0 CHECK(stability >= 0),
    difficulty REAL NOT NULL DEFAULT 0 CHECK(difficulty >= 0),
    scheduled_days INTEGER NOT NULL DEFAULT 0 CHECK(scheduled_days >= 0),
    learning_steps INTEGER NOT NULL DEFAULT 0 CHECK(learning_steps >= 0),
    repetitions INTEGER NOT NULL DEFAULT 0 CHECK(repetitions >= 0),
    lapses INTEGER NOT NULL DEFAULT 0 CHECK(lapses >= 0),
    last_reviewed_at TEXT,
    last_result TEXT CHECK(last_result IS NULL OR last_result IN ('again', 'hard', 'good', 'easy')),
    average_response_ms INTEGER CHECK(average_response_ms IS NULL OR average_response_ms >= 0),
    PRIMARY KEY(profile_id, move_id)
) STRICT;

ALTER TABLE opening_review_queue ADD COLUMN piece_hint INTEGER NOT NULL DEFAULT 0 CHECK(piece_hint IN (0, 1));
ALTER TABLE opening_review_queue ADD COLUMN move_shown INTEGER NOT NULL DEFAULT 0 CHECK(move_shown IN (0, 1));

CREATE INDEX opening_review_queue_branch_idx ON opening_review_queue(expected_move_id, session_id);
