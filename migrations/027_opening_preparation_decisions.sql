CREATE TABLE opening_preparation_decisions (
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    position_key TEXT NOT NULL,
    opponent_move_uci TEXT NOT NULL,
    after_position_key TEXT NOT NULL,
    choice TEXT NOT NULL CHECK(choice IN ('idea', 'unprepared', 'line')),
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY(profile_id, repertoire_id, position_key, opponent_move_uci)
) STRICT;
CREATE INDEX opening_preparation_after_idx
    ON opening_preparation_decisions(profile_id, repertoire_id, after_position_key);
