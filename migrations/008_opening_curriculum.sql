CREATE TABLE opening_repertoires (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    learner_color TEXT NOT NULL CHECK(learner_color IN ('white', 'black')),
    first_move_uci TEXT NOT NULL,
    first_move_san TEXT NOT NULL,
    summary TEXT NOT NULL,
    audience_label TEXT NOT NULL,
    style_json TEXT NOT NULL,
    memory_burden TEXT NOT NULL CHECK(memory_burden IN ('low', 'medium', 'high')),
    content_version INTEGER NOT NULL CHECK(content_version > 0),
    status TEXT NOT NULL CHECK(status IN ('preview', 'published')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE opening_positions (
    id TEXT PRIMARY KEY,
    position_key TEXT NOT NULL UNIQUE,
    fen TEXT NOT NULL,
    side_to_move TEXT NOT NULL CHECK(side_to_move IN ('white', 'black'))
) STRICT;

CREATE TABLE opening_chapters (
    id TEXT PRIMARY KEY,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    introduction TEXT NOT NULL,
    root_position_id TEXT NOT NULL REFERENCES opening_positions(id),
    sort_order INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    UNIQUE(repertoire_id, slug)
) STRICT;

CREATE TABLE opening_moves (
    id TEXT PRIMARY KEY,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    from_position_id TEXT NOT NULL REFERENCES opening_positions(id),
    to_position_id TEXT NOT NULL REFERENCES opening_positions(id),
    move_uci TEXT NOT NULL,
    move_san TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('learner', 'opponent')),
    move_kind TEXT NOT NULL CHECK(move_kind IN ('primary', 'alternative', 'response')),
    frequency REAL CHECK(frequency IS NULL OR (frequency >= 0 AND frequency <= 1)),
    sort_order INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    UNIQUE(repertoire_id, from_position_id, move_uci)
) STRICT;

CREATE TABLE opening_move_annotations (
    move_id TEXT PRIMARY KEY REFERENCES opening_moves(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    changes_json TEXT NOT NULL,
    concepts_json TEXT NOT NULL,
    opponent_idea TEXT,
    resulting_plan TEXT,
    tactical_warning TEXT,
    common_mistake TEXT
) STRICT;

CREATE TABLE opening_lines (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES opening_chapters(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    priority INTEGER NOT NULL CHECK(priority > 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    UNIQUE(chapter_id, slug)
) STRICT;

CREATE TABLE opening_line_moves (
    line_id TEXT NOT NULL REFERENCES opening_lines(id) ON DELETE CASCADE,
    move_id TEXT NOT NULL REFERENCES opening_moves(id),
    ply INTEGER NOT NULL CHECK(ply > 0),
    PRIMARY KEY(line_id, ply)
) STRICT;

CREATE TABLE opening_sources (
    id TEXT PRIMARY KEY,
    repertoire_id TEXT NOT NULL REFERENCES opening_repertoires(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('authored', 'dataset', 'statistics')),
    title TEXT NOT NULL,
    url TEXT,
    license TEXT,
    accessed_at TEXT
) STRICT;

CREATE INDEX opening_moves_from_position_idx
    ON opening_moves(repertoire_id, from_position_id, active);
CREATE INDEX opening_lines_chapter_idx
    ON opening_lines(chapter_id, active, priority);
