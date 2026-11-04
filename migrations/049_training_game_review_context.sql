-- Preserve which analysis and feedback an exercise belonged to when it started.
-- Results remain in training_attempts; scheduled recall is not duplicated here.
CREATE TABLE training_game_review_context (
  attempt_id TEXT PRIMARY KEY REFERENCES training_attempts(id) ON DELETE CASCADE,
  analysis_run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
  exercise_fingerprint TEXT NOT NULL,
  snapshot_id TEXT REFERENCES game_review_snapshots(id) ON DELETE SET NULL
) STRICT;
CREATE INDEX training_game_review_context_pending_idx
  ON training_game_review_context(analysis_run_id,snapshot_id);
