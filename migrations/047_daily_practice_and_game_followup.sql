CREATE TABLE daily_practice_plans (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  local_day TEXT NOT NULL,
  game_days INTEGER,
  opening_count INTEGER NOT NULL,
  thinking_count INTEGER NOT NULL,
  opening_lesson_id TEXT REFERENCES opening_lesson_attempts(id) ON DELETE SET NULL,
  opening_session_id TEXT REFERENCES opening_review_sessions(id) ON DELETE SET NULL,
  thinking_session_id TEXT REFERENCES training_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
  created_at TEXT NOT NULL,
  UNIQUE(profile_id,local_day)
) STRICT;

CREATE TABLE game_review_practice_followups (
  profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  source_move_id TEXT NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES training_items(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  PRIMARY KEY(profile_id,source_move_id)
) STRICT;
