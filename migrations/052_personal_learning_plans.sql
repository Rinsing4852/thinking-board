CREATE TABLE personal_learning_plans (
 id TEXT PRIMARY KEY,
 profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('active','replaced')),
 chosen_at TEXT NOT NULL,
 reviewed_at TEXT NOT NULL,
 replaced_at TEXT,
 snapshot_json TEXT NOT NULL,
 evidence_json TEXT NOT NULL,
 baseline_json TEXT NOT NULL,
 kept_suggestion TEXT,
 first_studied_at TEXT,
 first_attempt_id TEXT REFERENCES training_attempts(id) ON DELETE SET NULL
) STRICT;
CREATE UNIQUE INDEX personal_learning_plan_active ON personal_learning_plans(profile_id) WHERE status='active';
