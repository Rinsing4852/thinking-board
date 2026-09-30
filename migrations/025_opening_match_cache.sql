CREATE TABLE opening_match_revision (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    revision INTEGER NOT NULL DEFAULT 0
) STRICT;
INSERT INTO opening_match_revision(id) VALUES (1);

CREATE TABLE game_opening_match_cache (
    game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    repertoire_revision INTEGER NOT NULL
) STRICT;

-- Invalidate derived matches on graph/visibility changes, not on notes, reviews
-- or engine analysis. Imports and all editors use the same database paths.
CREATE TRIGGER opening_match_moves_insert AFTER INSERT ON opening_moves BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_moves_update AFTER UPDATE ON opening_moves BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_moves_delete AFTER DELETE ON opening_moves BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_lines_update AFTER UPDATE ON opening_lines BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_membership_insert AFTER INSERT ON opening_line_moves BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_membership_delete AFTER DELETE ON opening_line_moves BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_membership_update AFTER UPDATE ON opening_line_moves BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_chapters_update AFTER UPDATE ON opening_chapters BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_repertoires_update AFTER UPDATE ON opening_repertoires BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_repertoire_preference_insert AFTER INSERT ON opening_repertoire_preferences BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_repertoire_preference_update AFTER UPDATE ON opening_repertoire_preferences BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_repertoire_preference_delete AFTER DELETE ON opening_repertoire_preferences BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_line_preference_insert AFTER INSERT ON opening_line_preferences BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_line_preference_update AFTER UPDATE ON opening_line_preferences BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_line_preference_delete AFTER DELETE ON opening_line_preferences BEGIN
    UPDATE opening_match_revision SET revision = revision + 1 WHERE id = 1;
END;
CREATE TRIGGER opening_match_game_moves_insert AFTER INSERT ON moves BEGIN
    DELETE FROM game_opening_match_cache WHERE game_id = NEW.game_id;
END;
CREATE TRIGGER opening_match_game_moves_update AFTER UPDATE ON moves BEGIN
    DELETE FROM game_opening_match_cache WHERE game_id IN (OLD.game_id, NEW.game_id);
END;
CREATE TRIGGER opening_match_game_moves_delete AFTER DELETE ON moves BEGIN
    DELETE FROM game_opening_match_cache WHERE game_id = OLD.game_id;
END;
CREATE TRIGGER opening_match_game_player_update AFTER UPDATE OF profile_id, player_color ON games BEGIN
    DELETE FROM game_opening_match_cache WHERE game_id = NEW.id;
END;
