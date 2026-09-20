CREATE TABLE game_opening_review_states (
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    match_signature TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(game_id, repertoire_id)
) STRICT;

CREATE INDEX game_opening_review_states_profile_reviewed_idx
    ON game_opening_review_states(profile_id, reviewed_at DESC);
