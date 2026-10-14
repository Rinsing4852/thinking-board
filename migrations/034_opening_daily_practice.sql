ALTER TABLE opening_player_preferences ADD COLUMN daily_practice_goal INTEGER NOT NULL DEFAULT 10 CHECK(daily_practice_goal BETWEEN 1 AND 50);
ALTER TABLE opening_player_preferences ADD COLUMN practice_time_zone TEXT NOT NULL DEFAULT 'UTC';
