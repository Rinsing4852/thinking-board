INSERT OR IGNORE INTO concepts(id, family, label) VALUES
    ('process.last_move_awareness', 'thinking_process', 'Last-move awareness'),
    ('change.attacked_piece', 'position_change', 'Attacked piece');

CREATE TABLE what_changed_items (
    item_id TEXT PRIMARY KEY REFERENCES training_items(id) ON DELETE CASCADE,
    opponent_move_id TEXT NOT NULL REFERENCES moves(id),
    before_opponent_position_id TEXT NOT NULL REFERENCES positions(id),
    after_opponent_position_id TEXT NOT NULL REFERENCES positions(id),
    opponent_move_uci TEXT NOT NULL,
    opponent_move_san TEXT NOT NULL,
    answer_category TEXT NOT NULL,
    answer_squares_json TEXT NOT NULL,
    explanation TEXT NOT NULL,
    evidence_json TEXT NOT NULL
) STRICT;

ALTER TABLE training_attempts ADD COLUMN response_json TEXT;
