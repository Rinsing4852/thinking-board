ALTER TABLE training_sessions ADD COLUMN game_days INTEGER
  CHECK (game_days IS NULL OR game_days IN (1, 2, 7, 30, 90));
