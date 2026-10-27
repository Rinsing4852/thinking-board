-- Keep individual positions due and all review history; record why a session is shorter.
ALTER TABLE training_sessions ADD COLUMN similar_deferred_count INTEGER NOT NULL DEFAULT 0;
