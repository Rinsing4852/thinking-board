ALTER TABLE opening_imports ADD COLUMN source_updated_at TEXT;

-- Source identity is separate from editable chapter titles and display order.
CREATE TABLE opening_import_chapters (
    repertoire_id TEXT NOT NULL REFERENCES opening_imports(repertoire_id) ON DELETE CASCADE,
    source_key TEXT NOT NULL,
    chapter_id TEXT NOT NULL REFERENCES opening_chapters(id) ON DELETE CASCADE,
    PRIMARY KEY(repertoire_id, source_key)
) STRICT;

-- Confirmation applies the downloaded snapshot, not a second network fetch.
CREATE TABLE opening_update_previews (
    id TEXT PRIMARY KEY,
    repertoire_id TEXT NOT NULL REFERENCES opening_imports(repertoire_id) ON DELETE CASCADE,
    original_pgn TEXT NOT NULL,
    source_url TEXT,
    base_checksum TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    result_json TEXT
) STRICT;
