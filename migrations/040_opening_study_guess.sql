-- Study guessing is local learning; it never writes scheduled recall records.
ALTER TABLE opening_study_progress ADD COLUMN quiz_json TEXT;
ALTER TABLE opening_study_progress ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE opening_study_guess_history (
  profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
  line_id TEXT NOT NULL REFERENCES opening_lines(id) ON DELETE CASCADE,
  saved_ply INTEGER NOT NULL,
  position_key TEXT NOT NULL,
  game_id TEXT NOT NULL REFERENCES opening_study_games(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  PRIMARY KEY(profile_id,repertoire_id,line_id,saved_ply,position_key,game_id)
) STRICT;
