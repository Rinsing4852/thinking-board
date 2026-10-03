-- Source annotations belong to a path; memory cards and personal notes remain shared.
CREATE TABLE opening_line_annotations (
    line_id TEXT NOT NULL,
    ply INTEGER NOT NULL,
    explanation_json TEXT NOT NULL,
    PRIMARY KEY(line_id, ply),
    FOREIGN KEY(line_id, ply) REFERENCES opening_line_moves(line_id, ply) ON DELETE CASCADE
) STRICT;
