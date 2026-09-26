CREATE TABLE opening_player_preferences (
    profile_id TEXT PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,
    rating_group INTEGER NOT NULL CHECK(rating_group IN (1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500)),
    platform TEXT NOT NULL CHECK(platform IN ('lichess', 'chess_com', 'fide', 'not_sure')),
    use_explorer INTEGER NOT NULL DEFAULT 0 CHECK(use_explorer IN (0, 1)),
    updated_at TEXT NOT NULL
) STRICT;
