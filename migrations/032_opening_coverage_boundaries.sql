-- A stopping point is a preparation choice, not a deletion or a memory claim.
ALTER TABLE opening_review_sessions ADD COLUMN focus_move_id TEXT
    REFERENCES opening_moves(id) ON DELETE SET NULL;

CREATE TABLE opening_coverage_boundaries (
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    position_id TEXT NOT NULL REFERENCES opening_positions(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY(profile_id, repertoire_id, position_id)
) STRICT;
