CREATE TABLE opening_learning_comments (
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    move_id TEXT NOT NULL REFERENCES opening_moves(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(profile_id, move_id)
) STRICT;

CREATE TABLE opening_review_mistakes (
    id TEXT PRIMARY KEY,
    review_item_id TEXT NOT NULL REFERENCES opening_review_items(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES opening_review_sessions(id) ON DELETE CASCADE,
    queue_entry_id TEXT NOT NULL REFERENCES opening_review_queue(id) ON DELETE CASCADE,
    played_move_uci TEXT NOT NULL,
    played_move_san TEXT NOT NULL,
    response_ms INTEGER NOT NULL CHECK(response_ms >= 0),
    created_at TEXT NOT NULL
) STRICT;

CREATE INDEX opening_review_mistakes_item_created_idx
    ON opening_review_mistakes(review_item_id, created_at DESC);

CREATE INDEX opening_review_mistakes_queue_idx
    ON opening_review_mistakes(queue_entry_id, created_at);
