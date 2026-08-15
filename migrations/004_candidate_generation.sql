INSERT OR IGNORE INTO concepts(id, family, label) VALUES
    ('process.candidate_generation', 'thinking_process', 'Candidate generation'),
    ('response.improve', 'candidate_type', 'Weakest-piece improvement');

CREATE TABLE candidate_generation_items (
    item_id TEXT PRIMARY KEY REFERENCES training_items(id) ON DELETE CASCADE,
    position_id TEXT NOT NULL REFERENCES positions(id),
    played_move_id TEXT NOT NULL REFERENCES moves(id),
    reference_lines_json TEXT NOT NULL,
    explanation TEXT NOT NULL,
    evidence_json TEXT NOT NULL
) STRICT;
