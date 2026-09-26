import type { OpeningPlayerPreferences, OpeningRatingPlatform } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { ensureActiveProfile } from "../training/profile.js";

const RATING_GROUPS = new Set([1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]);
const PLATFORMS = new Set<OpeningRatingPlatform>(["lichess", "chess_com", "fide", "not_sure"]);

interface PreferenceRow {
  rating_group: number;
  platform: OpeningRatingPlatform;
  use_explorer: number;
  updated_at: string;
}

export class OpeningPreferencesService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly explorerAvailable: boolean,
  ) {}

  get(): OpeningPlayerPreferences {
    const profileId = ensureActiveProfile(this.db);
    const row = this.db.prepare(`
      SELECT rating_group, platform, use_explorer, updated_at
      FROM opening_player_preferences
      WHERE profile_id = ?
    `).get(profileId) as PreferenceRow | undefined;

    return row ? this.response(row, true) : {
      configured: false,
      ratingGroup: 1600,
      platform: "not_sure",
      useExplorer: false,
      explorerAvailable: this.explorerAvailable,
      updatedAt: null,
    };
  }

  update(input: {
    ratingGroup: number;
    platform: OpeningRatingPlatform;
    useExplorer: boolean;
  }): OpeningPlayerPreferences {
    if (!RATING_GROUPS.has(input.ratingGroup)) throw new Error("Choose a supported rating range");
    if (!PLATFORMS.has(input.platform)) throw new Error("Choose where this rating comes from");
    if (typeof input.useExplorer !== "boolean") throw new Error("Choose whether to use practical game data");
    if (input.useExplorer && !this.explorerAvailable) {
      throw new Error("Add LICHESS_API_TOKEN to Docker before enabling practical frequencies");
    }

    const profileId = ensureActiveProfile(this.db);
    const updatedAt = now();
    this.db.prepare(`
      INSERT INTO opening_player_preferences(profile_id, rating_group, platform, use_explorer, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        rating_group = excluded.rating_group,
        platform = excluded.platform,
        use_explorer = excluded.use_explorer,
        updated_at = excluded.updated_at
    `).run(profileId, input.ratingGroup, input.platform, input.useExplorer ? 1 : 0, updatedAt);

    return {
      configured: true,
      ratingGroup: input.ratingGroup,
      platform: input.platform,
      useExplorer: input.useExplorer,
      explorerAvailable: this.explorerAvailable,
      updatedAt,
    };
  }

  private response(row: PreferenceRow, configured: boolean): OpeningPlayerPreferences {
    return {
      configured,
      ratingGroup: row.rating_group,
      platform: row.platform,
      useExplorer: row.use_explorer === 1 && this.explorerAvailable,
      explorerAvailable: this.explorerAvailable,
      updatedAt: row.updated_at,
    };
  }
}
