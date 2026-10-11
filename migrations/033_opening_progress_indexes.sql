-- Progress and game-miss summaries start with a move, not a line. The primary
-- key (line_id, ply) cannot serve these shared-move lookups.
CREATE INDEX opening_line_moves_move_line_idx ON opening_line_moves(move_id, line_id);
