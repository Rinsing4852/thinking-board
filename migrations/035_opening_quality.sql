CREATE TABLE opening_quality_preferences (
  profile_id TEXT PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,
  goal_games INTEGER NOT NULL DEFAULT 200 CHECK(goal_games BETWEEN 10 AND 10000),
  speeds TEXT NOT NULL DEFAULT 'blitz,rapid,classical'
);
CREATE TABLE opening_task_choices (
  profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK(choice IN ('later','skip')),
  until_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(profile_id, repertoire_id, task_id)
);
CREATE TABLE opening_eval_cache (
  cache_key TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
