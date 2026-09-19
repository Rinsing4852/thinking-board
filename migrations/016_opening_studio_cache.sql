CREATE TABLE opening_explorer_cache (
    position_key TEXT NOT NULL,
    fen TEXT NOT NULL,
    rating_group INTEGER NOT NULL,
    speeds TEXT NOT NULL,
    total_games INTEGER NOT NULL CHECK(total_games >= 0),
    moves_json TEXT NOT NULL,
    opening_json TEXT,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY(position_key, rating_group, speeds)
) STRICT;
