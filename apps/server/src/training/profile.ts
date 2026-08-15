import type { SqliteDatabase } from "../db/database.js";

export function activeProfileId(db: SqliteDatabase): string | null {
  const configured = db.prepare(`
    SELECT value FROM app_state WHERE key = 'active_profile_id'
  `).get() as { value: string } | undefined;
  if (configured && db.prepare("SELECT 1 FROM player_profiles WHERE id = ?").get(configured.value)) {
    return configured.value;
  }
  const first = db.prepare("SELECT id FROM player_profiles ORDER BY created_at LIMIT 1")
    .get() as { id: string } | undefined;
  if (first) {
    db.prepare(`
      INSERT INTO app_state(key, value) VALUES ('active_profile_id', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(first.id);
  }
  return first?.id ?? null;
}

export function setActiveProfile(db: SqliteDatabase, profileId: string): void {
  if (!db.prepare("SELECT 1 FROM player_profiles WHERE id = ?").get(profileId)) {
    throw new Error("Player profile not found");
  }
  db.prepare(`
    INSERT INTO app_state(key, value) VALUES ('active_profile_id', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(profileId);
}
