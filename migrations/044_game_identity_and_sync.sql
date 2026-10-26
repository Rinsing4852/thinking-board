-- Keep game IDs, analysis, notes and attempts. ImportService fills legacy
-- identities from retained headers/content without reanalysing games.
ALTER TABLE games ADD COLUMN content_fingerprint TEXT;
ALTER TABLE games ADD COLUMN identity_key TEXT;
UPDATE games SET content_fingerprint=fingerprint;
CREATE UNIQUE INDEX games_profile_identity_idx ON games(profile_id,identity_key) WHERE identity_key IS NOT NULL;
CREATE INDEX games_profile_played_idx ON games(profile_id,played_at);
ALTER TABLE lichess_connections ADD COLUMN more_available INTEGER NOT NULL DEFAULT 0 CHECK(more_available IN (0,1));
