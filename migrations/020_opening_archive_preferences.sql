CREATE TABLE opening_repertoire_preferences (
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    archived_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(profile_id, repertoire_id)
) STRICT;

CREATE INDEX opening_repertoire_preferences_archived_idx
    ON opening_repertoire_preferences(profile_id, archived_at);

CREATE TABLE opening_line_preferences (
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    line_id TEXT NOT NULL REFERENCES opening_lines(id) ON DELETE CASCADE,
    archived_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(profile_id, line_id)
) STRICT;

CREATE INDEX opening_line_preferences_archived_idx
    ON opening_line_preferences(profile_id, archived_at);
