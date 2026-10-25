CREATE INDEX analysis_runs_game_completed_idx ON analysis_runs(game_id, status, completed_at DESC);

CREATE TABLE game_move_quality (
    run_id TEXT NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    move_id TEXT NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
    rule_version TEXT NOT NULL,
    chances_before REAL NOT NULL,
    chances_after REAL NOT NULL,
    chance_loss REAL NOT NULL,
    accuracy REAL NOT NULL,
    grade TEXT NOT NULL CHECK(grade IN ('best','good','inaccuracy','mistake','blunder')),
    best_uci TEXT NOT NULL,
    best_san TEXT NOT NULL,
    PRIMARY KEY(run_id, move_id)
) STRICT;
-- Historical automatic work must not start merely because this version opens.
-- Completed results and user games are retained; unfinished work can be requested again.
UPDATE jobs SET status='failed', error_message='Analysis now runs on request. Select the games you want to analyse.', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE kind='analyze_games' AND status IN ('queued','running') AND json_extract(payload_json,'$.requestedByUser') IS NOT 1;
