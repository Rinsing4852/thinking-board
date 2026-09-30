ALTER TABLE opening_review_queue
    ADD COLUMN source_line_id TEXT REFERENCES opening_lines(id) ON DELETE SET NULL;

ALTER TABLE opening_review_queue
    ADD COLUMN expected_move_id TEXT REFERENCES opening_moves(id) ON DELETE SET NULL;
