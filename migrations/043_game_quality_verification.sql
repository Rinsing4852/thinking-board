CREATE TABLE game_move_verification (
    run_id TEXT NOT NULL,
    move_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    initial_grade TEXT NOT NULL,
    depth INTEGER NOT NULL,
    PRIMARY KEY(run_id, move_id),
    FOREIGN KEY(run_id, move_id) REFERENCES game_move_quality(run_id, move_id) ON DELETE CASCADE
) STRICT;
