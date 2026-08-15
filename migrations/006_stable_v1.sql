CREATE TABLE app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

INSERT INTO app_state(key, value)
SELECT 'active_profile_id', id FROM player_profiles ORDER BY created_at LIMIT 1;

ALTER TABLE move_assessments RENAME TO move_assessments_v1;

CREATE TABLE move_assessments (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    move_id TEXT NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
    eval_before_cp_white INTEGER,
    eval_before_mate_white INTEGER,
    eval_after_cp_white INTEGER,
    eval_after_mate_white INTEGER,
    centipawn_loss INTEGER,
    comparison_loss INTEGER NOT NULL,
    classification TEXT NOT NULL CHECK(classification IN ('good', 'inaccuracy', 'mistake', 'blunder')),
    meaningful INTEGER NOT NULL CHECK(meaningful IN (0, 1)),
    UNIQUE(run_id, move_id),
    CHECK (centipawn_loss IS NULL OR centipawn_loss >= 0)
) STRICT;

INSERT INTO move_assessments(
    id, run_id, move_id, eval_before_cp_white, eval_before_mate_white,
    eval_after_cp_white, eval_after_mate_white, centipawn_loss,
    comparison_loss, classification, meaningful
)
SELECT id, run_id, move_id, eval_before_cp_white, eval_before_mate_white,
       eval_after_cp_white, eval_after_mate_white,
       CASE WHEN eval_before_mate_white IS NOT NULL OR eval_after_mate_white IS NOT NULL
            THEN NULL ELSE centipawn_loss END,
       centipawn_loss, classification, meaningful
FROM move_assessments_v1;

DROP TABLE move_assessments_v1;

ALTER TABLE training_attempts ADD COLUMN abandoned_at TEXT;
ALTER TABLE training_attempts ADD COLUMN session_id TEXT REFERENCES training_sessions(id) ON DELETE SET NULL;

-- Earlier builds created an unanswered attempt whenever an exercise panel loaded.
-- Those rows do not represent genuine training and must not remain "in progress".
UPDATE training_attempts
SET abandoned_at = created_at
WHERE answered_at IS NULL;
ALTER TABLE training_session_items ADD COLUMN attempt_id TEXT REFERENCES training_attempts(id) ON DELETE SET NULL;
ALTER TABLE training_session_items ADD COLUMN completed_at TEXT;

CREATE INDEX training_attempts_open_idx
    ON training_attempts(item_id, answered_at, abandoned_at, created_at DESC);
CREATE INDEX training_session_items_progress_idx
    ON training_session_items(session_id, completed, ordinal);

CREATE TRIGGER complete_session_item_after_attempt
AFTER UPDATE OF answered_at ON training_attempts
WHEN OLD.answered_at IS NULL AND NEW.answered_at IS NOT NULL
BEGIN
    UPDATE training_session_items
    SET completed = 1, completed_at = NEW.answered_at
    WHERE attempt_id = NEW.id;

    UPDATE training_sessions
    SET status = 'completed', completed_at = NEW.answered_at
    WHERE id = NEW.session_id
      AND NEW.session_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM training_session_items
        WHERE session_id = NEW.session_id AND completed = 0
      );
END;
