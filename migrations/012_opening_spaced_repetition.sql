CREATE TABLE opening_review_items (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    position_id TEXT NOT NULL REFERENCES opening_positions(id),
    move_id TEXT NOT NULL REFERENCES opening_moves(id),
    knowledge_dimension TEXT NOT NULL DEFAULT 'move'
        CHECK(knowledge_dimension IN ('move', 'purpose', 'opponent_awareness')),
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(profile_id, repertoire_id, move_id, knowledge_dimension)
) STRICT;

CREATE INDEX opening_review_items_due_idx
    ON opening_review_items(profile_id, repertoire_id, knowledge_dimension, due_at);

CREATE TABLE opening_review_sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'abandoned')),
    selection_pool TEXT NOT NULL CHECK(selection_pool IN ('due', 'new', 'mixed', 'early')),
    initial_item_count INTEGER NOT NULL CHECK(initial_item_count > 0),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    abandoned_at TEXT,
    created_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX opening_review_active_profile_idx
    ON opening_review_sessions(profile_id) WHERE status = 'active';

CREATE TABLE opening_review_queue (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES opening_review_sessions(id) ON DELETE CASCADE,
    review_item_id TEXT NOT NULL REFERENCES opening_review_items(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK(sequence >= 0),
    presentation_kind TEXT NOT NULL CHECK(presentation_kind IN ('scheduled', 'lapse_repeat')),
    status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'completed')),
    started_at TEXT,
    answered_at TEXT,
    UNIQUE(session_id, sequence)
) STRICT;

CREATE INDEX opening_review_queue_next_idx
    ON opening_review_queue(session_id, status, sequence);

CREATE TABLE opening_review_events (
    id TEXT PRIMARY KEY,
    review_item_id TEXT NOT NULL REFERENCES opening_review_items(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES opening_review_sessions(id) ON DELETE CASCADE,
    queue_entry_id TEXT NOT NULL UNIQUE REFERENCES opening_review_queue(id) ON DELETE CASCADE,
    played_move_uci TEXT NOT NULL,
    played_move_san TEXT NOT NULL,
    correct INTEGER NOT NULL CHECK(correct IN (0, 1)),
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 4),
    response_ms INTEGER NOT NULL CHECK(response_ms >= 0),
    previous_state INTEGER NOT NULL CHECK(previous_state BETWEEN 0 AND 3),
    next_state INTEGER NOT NULL CHECK(next_state BETWEEN 0 AND 3),
    next_due_at TEXT NOT NULL,
    created_at TEXT NOT NULL
) STRICT;

CREATE INDEX opening_review_events_item_created_idx
    ON opening_review_events(review_item_id, created_at DESC);
