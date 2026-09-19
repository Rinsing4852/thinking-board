CREATE TABLE opening_imports (
    id TEXT PRIMARY KEY,
    repertoire_id TEXT NOT NULL UNIQUE REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    learner_color TEXT NOT NULL CHECK(learner_color IN ('white', 'black')),
    source_type TEXT NOT NULL CHECK(source_type IN ('self_authored', 'book_notes', 'lichess_study', 'licensed_pgn')),
    source_title TEXT NOT NULL,
    source_author TEXT,
    original_pgn TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility = 'private'),
    ownership_confirmed INTEGER NOT NULL CHECK(ownership_confirmed = 1),
    imported_at TEXT NOT NULL,
    UNIQUE(fingerprint, learner_color)
) STRICT;

CREATE INDEX opening_imports_fingerprint_idx
    ON opening_imports(fingerprint, learner_color);
