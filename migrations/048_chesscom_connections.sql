CREATE TABLE chesscom_connections (
  profile_id TEXT PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  last_imported_at TEXT,
  last_month TEXT,
  updated_at TEXT NOT NULL
) STRICT;
