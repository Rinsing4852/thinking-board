ALTER TABLE opening_review_events
    ADD COLUMN assisted INTEGER NOT NULL DEFAULT 0 CHECK(assisted IN (0, 1));

-- A position is the memory target. If an authored primary move changes later,
-- keep the learner's schedule and point it at the new reference move instead of
-- creating a second card for the same board position.
--
-- Older installs could have one card for each accepted move from the same
-- position. Move their immutable queue and event history to the most-practised
-- card before removing duplicates. ON DELETE CASCADE would otherwise erase it.
UPDATE opening_review_queue
SET review_item_id = (
    SELECT keeper.id
    FROM opening_review_items old_item
    JOIN opening_review_items keeper
      ON keeper.profile_id = old_item.profile_id
     AND keeper.repertoire_id = old_item.repertoire_id
     AND keeper.position_id = old_item.position_id
     AND keeper.knowledge_dimension = old_item.knowledge_dimension
    WHERE old_item.id = opening_review_queue.review_item_id
    ORDER BY keeper.repetitions DESC,
             keeper.last_reviewed_at IS NULL,
             keeper.last_reviewed_at DESC,
             keeper.id
    LIMIT 1
);

UPDATE opening_review_events
SET review_item_id = (
    SELECT keeper.id
    FROM opening_review_items old_item
    JOIN opening_review_items keeper
      ON keeper.profile_id = old_item.profile_id
     AND keeper.repertoire_id = old_item.repertoire_id
     AND keeper.position_id = old_item.position_id
     AND keeper.knowledge_dimension = old_item.knowledge_dimension
    WHERE old_item.id = opening_review_events.review_item_id
    ORDER BY keeper.repetitions DESC,
             keeper.last_reviewed_at IS NULL,
             keeper.last_reviewed_at DESC,
             keeper.id
    LIMIT 1
);

DELETE FROM opening_review_items
WHERE id <> (
    SELECT keeper.id
    FROM opening_review_items keeper
    WHERE keeper.profile_id = opening_review_items.profile_id
      AND keeper.repertoire_id = opening_review_items.repertoire_id
      AND keeper.position_id = opening_review_items.position_id
      AND keeper.knowledge_dimension = opening_review_items.knowledge_dimension
    ORDER BY keeper.repetitions DESC,
             keeper.last_reviewed_at IS NULL,
             keeper.last_reviewed_at DESC,
             keeper.id
    LIMIT 1
);

CREATE UNIQUE INDEX opening_review_items_position_dimension_idx
    ON opening_review_items(profile_id, repertoire_id, position_id, knowledge_dimension);
