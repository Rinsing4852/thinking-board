-- Study rating is explicitly Lichess; coverage bands on other platforms are not conversions.
CREATE TABLE opening_study_preferences (
  profile_id TEXT PRIMARY KEY REFERENCES player_profiles(id) ON DELETE CASCADE,
  lichess_rating INTEGER NOT NULL CHECK(lichess_rating BETWEEN 100 AND 4000)
) STRICT;
