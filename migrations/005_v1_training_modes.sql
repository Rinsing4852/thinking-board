INSERT OR IGNORE INTO concepts(id, family, label) VALUES
    ('process.failed_candidate_generation', 'thinking_process', 'Failed candidate generation'),
    ('process.missed_forcing_move', 'thinking_process', 'Missed forcing move'),
    ('process.weakest_piece', 'thinking_process', 'Weakest-piece development'),
    ('process.calculation_failure', 'thinking_process', 'Calculation failure'),
    ('process.pattern_failure', 'thinking_process', 'Pattern-recognition failure'),
    ('tactic.fork', 'tactical', 'Fork'),
    ('tactic.pin', 'tactical', 'Pin'),
    ('tactic.skewer', 'tactical', 'Skewer'),
    ('tactic.discovered_attack', 'tactical', 'Discovered attack'),
    ('tactic.overloaded_defender', 'tactical', 'Overloaded defender'),
    ('tactic.removal_of_defender', 'tactical', 'Removal of defender'),
    ('tactic.missed_capture', 'tactical', 'Missed capture'),
    ('tactic.allowed_mate', 'tactical', 'Allowed mate'),
    ('tactic.queen_loss', 'tactical', 'Queen loss'),
    ('tactic.rook_loss', 'tactical', 'Rook loss'),
    ('tactic.minor_piece_loss', 'tactical', 'Minor-piece loss');

CREATE TABLE punish_blunder_items (
    item_id TEXT PRIMARY KEY REFERENCES training_items(id) ON DELETE CASCADE,
    position_id TEXT NOT NULL REFERENCES positions(id),
    bad_move_uci TEXT NOT NULL,
    bad_move_san TEXT NOT NULL,
    explanation TEXT NOT NULL,
    evidence_json TEXT NOT NULL
) STRICT;

CREATE TABLE quiet_position_items (
    item_id TEXT PRIMARY KEY REFERENCES training_items(id) ON DELETE CASCADE,
    position_id TEXT NOT NULL REFERENCES positions(id),
    weakest_squares_json TEXT NOT NULL,
    acceptable_moves_json TEXT NOT NULL,
    explanation TEXT NOT NULL,
    evidence_json TEXT NOT NULL
) STRICT;

CREATE TABLE training_sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    requested_size INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'completed')),
    created_at TEXT NOT NULL,
    completed_at TEXT
) STRICT;

CREATE TABLE training_session_items (
    session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES training_items(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
    PRIMARY KEY(session_id, ordinal),
    UNIQUE(session_id, item_id)
) STRICT;

CREATE INDEX training_attempts_item_created_idx
    ON training_attempts(item_id, created_at DESC);
