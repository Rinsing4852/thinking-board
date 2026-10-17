-- Study games and replay progress do not participate in recall or played games.
CREATE TABLE opening_study_games (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  source_label TEXT NOT NULL,
  pgn TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  moves_json TEXT NOT NULL,
  initial_fen TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(profile_id, fingerprint)
) STRICT;
CREATE TABLE opening_study_positions (
  game_id TEXT NOT NULL REFERENCES opening_study_games(id) ON DELETE CASCADE,
  position_key TEXT NOT NULL,
  ply INTEGER NOT NULL,
  PRIMARY KEY(game_id, ply)
) STRICT;
CREATE INDEX opening_study_position_idx ON opening_study_positions(position_key, game_id);
CREATE TABLE opening_study_progress (
  profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
  line_id TEXT NOT NULL REFERENCES opening_lines(id) ON DELETE CASCADE,
  saved_ply INTEGER NOT NULL,
  position_key TEXT NOT NULL,
  game_id TEXT NOT NULL REFERENCES opening_study_games(id) ON DELETE CASCADE,
  match_ply INTEGER NOT NULL,
  current_ply INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(profile_id, repertoire_id, line_id, saved_ply)
) STRICT;
