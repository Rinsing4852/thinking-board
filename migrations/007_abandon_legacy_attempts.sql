-- Migration 006 corrected this for fresh installations. Keep this migration
-- separately so databases that started briefly on the first stable-v1 image
-- also discard attempts created merely by rendering an exercise panel.
UPDATE training_attempts
SET abandoned_at = created_at
WHERE answered_at IS NULL
  AND abandoned_at IS NULL;
