-- Saved game feedback and local retries never count as scheduled review answers.
CREATE TABLE game_review_snapshots (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  source_revision TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX game_review_snapshots_game_idx ON game_review_snapshots(game_id,profile_id);
CREATE TABLE game_review_replays (
  game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES game_review_snapshots(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE game_review_local_attempts (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES game_review_snapshots(id) ON DELETE CASCADE,
  checkpoint_id TEXT NOT NULL,
  move_uci TEXT,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
-- Annotation edits also make an older saved feedback snapshot refreshable.
CREATE TRIGGER game_review_annotation_insert AFTER INSERT ON opening_move_annotations BEGIN
  UPDATE opening_match_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER game_review_annotation_update AFTER UPDATE ON opening_move_annotations BEGIN
  UPDATE opening_match_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER game_review_annotation_delete AFTER DELETE ON opening_move_annotations BEGIN
  UPDATE opening_match_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER game_review_comment_insert AFTER INSERT ON opening_learning_comments BEGIN
  UPDATE opening_match_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER game_review_comment_update AFTER UPDATE ON opening_learning_comments BEGIN
  UPDATE opening_match_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER game_review_comment_delete AFTER DELETE ON opening_learning_comments BEGIN
  UPDATE opening_match_revision SET revision=revision+1 WHERE id=1;
END;
