ALTER TABLE opening_move_annotations ADD COLUMN board_annotations_json TEXT NOT NULL DEFAULT '[]'
    CHECK(json_valid(board_annotations_json));
