CREATE TABLE lichess_connections (
    profile_id TEXT PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    normalized_username TEXT NOT NULL,
    last_synced_at TEXT,
    last_game_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE opening_position_statistics (
    position_id TEXT NOT NULL REFERENCES opening_positions(id) ON DELETE CASCADE,
    rating_group INTEGER NOT NULL,
    speeds TEXT NOT NULL,
    total_games INTEGER NOT NULL CHECK(total_games >= 0),
    moves_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY(position_id, rating_group, speeds)
) STRICT;

CREATE INDEX lichess_connections_username_idx
    ON lichess_connections(normalized_username);
