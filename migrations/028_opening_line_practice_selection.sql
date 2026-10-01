-- Practice participation is independent of library visibility and game matching.
CREATE TABLE opening_line_practice_preferences (
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    line_id TEXT NOT NULL REFERENCES opening_lines(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(profile_id, line_id)
) STRICT;
