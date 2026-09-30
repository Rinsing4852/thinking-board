ALTER TABLE opening_player_preferences
    ADD COLUMN new_moves_per_session INTEGER NOT NULL DEFAULT 5
    CHECK(new_moves_per_session BETWEEN 1 AND 10);

ALTER TABLE opening_player_preferences
    ADD COLUMN practice_depth INTEGER NOT NULL DEFAULT 8
    CHECK(practice_depth BETWEEN 2 AND 20);

ALTER TABLE opening_player_preferences
    ADD COLUMN board_sounds INTEGER NOT NULL DEFAULT 0
    CHECK(board_sounds IN (0, 1));
