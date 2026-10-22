CREATE TABLE opening_master_cache (
  position_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
) STRICT;
CREATE TABLE opening_generated_drafts (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
  line_id TEXT NOT NULL,
  after_ply INTEGER NOT NULL,
  moves_json TEXT NOT NULL,
  before_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  after_json TEXT,
  result_line_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('preview','applied','undone')),
  created_at TEXT NOT NULL
) STRICT;
