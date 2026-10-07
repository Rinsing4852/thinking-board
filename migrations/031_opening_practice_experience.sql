-- Additive preferences and help evidence; existing cards and source notes are untouched.
ALTER TABLE opening_player_preferences ADD COLUMN practice_pace TEXT NOT NULL DEFAULT 'normal'
    CHECK(practice_pace IN ('normal', 'relaxed'));
ALTER TABLE opening_player_preferences ADD COLUMN pause_after_move TEXT NOT NULL DEFAULT 'never'
    CHECK(pause_after_move IN ('never', 'mistakes', 'notes', 'always'));
ALTER TABLE opening_learning_comments ADD COLUMN idea_hint TEXT;
ALTER TABLE opening_review_queue ADD COLUMN idea_hint INTEGER NOT NULL DEFAULT 0 CHECK(idea_hint IN (0, 1));

-- An uncertain network response must not create the same branch twice.
CREATE TABLE opening_builder_requests (
    request_id TEXT PRIMARY KEY,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    source_line_id TEXT NOT NULL REFERENCES opening_lines(id) ON DELETE CASCADE,
    after_ply INTEGER NOT NULL,
    move_uci TEXT NOT NULL,
    line_id TEXT NOT NULL REFERENCES opening_lines(id) ON DELETE CASCADE,
    move_id TEXT NOT NULL REFERENCES opening_moves(id) ON DELETE CASCADE,
    created_branch INTEGER NOT NULL CHECK(created_branch IN (0, 1))
) STRICT;
