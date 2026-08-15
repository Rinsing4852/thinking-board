PRAGMA foreign_keys = ON;

CREATE TABLE player_profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
) STRICT;

CREATE TABLE player_aliases (
    id INTEGER PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    UNIQUE(profile_id, normalized_name)
) STRICT;

CREATE TABLE import_batches (
    id TEXT PRIMARY KEY,
    original_pgn TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('processing', 'completed', 'partial', 'failed')),
    imported_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    rejected_count INTEGER NOT NULL DEFAULT 0,
    errors_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    completed_at TEXT
) STRICT;

CREATE TABLE games (
    id TEXT PRIMARY KEY,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    profile_id TEXT NOT NULL REFERENCES player_profiles(id),
    fingerprint TEXT NOT NULL UNIQUE,
    raw_pgn_sha256 TEXT NOT NULL,
    original_pgn TEXT NOT NULL,
    headers_json TEXT NOT NULL,
    initial_fen TEXT NOT NULL,
    white_name TEXT NOT NULL,
    black_name TEXT NOT NULL,
    player_color TEXT NOT NULL CHECK(player_color IN ('white', 'black')),
    result TEXT NOT NULL,
    played_at TEXT,
    analyzed_at TEXT,
    created_at TEXT NOT NULL
) STRICT;

CREATE INDEX games_profile_created_idx ON games(profile_id, created_at DESC);

CREATE TABLE positions (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    ply_index INTEGER NOT NULL,
    fen TEXT NOT NULL,
    side_to_move TEXT NOT NULL CHECK(side_to_move IN ('white', 'black')),
    UNIQUE(game_id, ply_index)
) STRICT;

CREATE TABLE moves (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    ply INTEGER NOT NULL,
    move_number INTEGER NOT NULL,
    mover_color TEXT NOT NULL CHECK(mover_color IN ('white', 'black')),
    from_position_id TEXT NOT NULL REFERENCES positions(id),
    to_position_id TEXT NOT NULL REFERENCES positions(id),
    uci TEXT NOT NULL,
    san TEXT NOT NULL,
    UNIQUE(game_id, ply)
) STRICT;

CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed')),
    progress_current INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL,
    result_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
) STRICT;

CREATE INDEX jobs_status_created_idx ON jobs(status, created_at);

CREATE TABLE analysis_runs (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    engine_name TEXT NOT NULL,
    engine_version TEXT NOT NULL,
    depth INTEGER NOT NULL,
    multipv INTEGER NOT NULL,
    threads INTEGER NOT NULL,
    hash_mb INTEGER NOT NULL,
    analysis_version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
    started_at TEXT NOT NULL,
    completed_at TEXT
) STRICT;

CREATE TABLE position_analyses (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    position_id TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    centipawns_white INTEGER,
    mate_in_white INTEGER,
    depth INTEGER NOT NULL,
    CHECK ((centipawns_white IS NULL) != (mate_in_white IS NULL)),
    UNIQUE(run_id, position_id)
) STRICT;

CREATE TABLE engine_lines (
    id TEXT PRIMARY KEY,
    position_analysis_id TEXT NOT NULL REFERENCES position_analyses(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    move_uci TEXT NOT NULL,
    move_san TEXT NOT NULL,
    centipawns_white INTEGER,
    mate_in_white INTEGER,
    pv_uci_json TEXT NOT NULL,
    pv_san_json TEXT NOT NULL,
    CHECK ((centipawns_white IS NULL) != (mate_in_white IS NULL)),
    UNIQUE(position_analysis_id, rank)
) STRICT;

CREATE TABLE move_assessments (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    move_id TEXT NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
    eval_before_cp_white INTEGER,
    eval_before_mate_white INTEGER,
    eval_after_cp_white INTEGER,
    eval_after_mate_white INTEGER,
    centipawn_loss INTEGER NOT NULL,
    classification TEXT NOT NULL CHECK(classification IN ('good', 'inaccuracy', 'mistake', 'blunder')),
    meaningful INTEGER NOT NULL CHECK(meaningful IN (0, 1)),
    UNIQUE(run_id, move_id)
) STRICT;

CREATE TABLE concepts (
    id TEXT PRIMARY KEY,
    family TEXT NOT NULL,
    label TEXT NOT NULL
) STRICT;

INSERT INTO concepts(id, family, label) VALUES
    ('process.blunder_check', 'thinking_process', 'Blunder check'),
    ('response.check', 'candidate_type', 'Check'),
    ('response.capture', 'candidate_type', 'Capture'),
    ('response.threat', 'candidate_type', 'Threat'),
    ('tactic.hanging_piece', 'tactical', 'Hanging piece'),
    ('tactic.missed_mate', 'tactical', 'Missed mate');

CREATE TABLE training_items (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    source_move_id TEXT NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    generation_kind TEXT NOT NULL DEFAULT 'original',
    variant_parent_id TEXT REFERENCES training_items(id),
    prompt_version INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_at TEXT NOT NULL,
    UNIQUE(mode, source_move_id)
) STRICT;

CREATE TABLE blunder_check_items (
    item_id TEXT PRIMARY KEY REFERENCES training_items(id) ON DELETE CASCADE,
    before_position_id TEXT NOT NULL REFERENCES positions(id),
    after_candidate_position_id TEXT NOT NULL REFERENCES positions(id),
    candidate_move_uci TEXT NOT NULL,
    candidate_move_san TEXT NOT NULL,
    explanation TEXT NOT NULL,
    evidence_json TEXT NOT NULL
) STRICT;

CREATE TABLE acceptable_responses (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES training_items(id) ON DELETE CASCADE,
    move_uci TEXT NOT NULL,
    move_san TEXT NOT NULL,
    categories_json TEXT NOT NULL,
    engine_rank INTEGER NOT NULL,
    loss_from_best_cp INTEGER NOT NULL,
    UNIQUE(item_id, move_uci)
) STRICT;

CREATE TABLE training_item_concepts (
    item_id TEXT NOT NULL REFERENCES training_items(id) ON DELETE CASCADE,
    concept_id TEXT NOT NULL REFERENCES concepts(id),
    source TEXT NOT NULL CHECK(source IN ('automatic', 'manual')),
    confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0, 1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    PRIMARY KEY(item_id, concept_id, source)
) STRICT;

CREATE TABLE training_attempts (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES training_items(id) ON DELETE CASCADE,
    started_at TEXT,
    answered_at TEXT,
    duration_ms INTEGER,
    category_answer TEXT,
    move_answer_uci TEXT,
    category_correct INTEGER,
    move_correct INTEGER,
    score REAL,
    outcome TEXT CHECK(outcome IN ('excellent', 'partial', 'incorrect', 'revealed')),
    feedback_json TEXT,
    created_at TEXT NOT NULL
) STRICT;

CREATE TABLE review_states (
    item_id TEXT PRIMARY KEY REFERENCES training_items(id) ON DELETE CASCADE,
    mastery_level INTEGER NOT NULL DEFAULT 0,
    due_at TEXT NOT NULL,
    last_attempted_at TEXT,
    last_result TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    successes INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    average_response_ms INTEGER
) STRICT;
