CREATE TABLE game_opening_matches (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN (
        'in_repertoire',
        'player_deviation',
        'opponent_deviation',
        'repertoire_ended',
        'not_covered'
    )),
    matched_plies INTEGER NOT NULL DEFAULT 0 CHECK(matched_plies >= 0),
    matched_player_moves INTEGER NOT NULL DEFAULT 0 CHECK(matched_player_moves >= 0),
    last_book_ply INTEGER NOT NULL DEFAULT 0 CHECK(last_book_ply >= 0),
    departure_move_id TEXT REFERENCES moves(id) ON DELETE CASCADE,
    expected_move_id TEXT REFERENCES opening_moves(id) ON DELETE SET NULL,
    matched_at TEXT NOT NULL,
    UNIQUE(game_id, repertoire_id)
) STRICT;

CREATE INDEX game_opening_matches_profile_game_idx
    ON game_opening_matches(profile_id, game_id, matched_plies DESC);

ALTER TABLE opening_review_sessions
    ADD COLUMN focus_game_id TEXT REFERENCES games(id) ON DELETE SET NULL;
