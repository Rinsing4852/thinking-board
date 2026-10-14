import type { OpeningPlayerPreferences, OpeningRatingPlatform, OpeningPracticePace, OpeningPausePolicy } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { ensureActiveProfile } from "../training/profile.js";

const RATING_GROUPS = new Set([1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]);
const PLATFORMS = new Set<OpeningRatingPlatform>(["lichess", "chess_com", "fide", "not_sure"]);

interface PreferenceRow {
  rating_group: number;
  platform: OpeningRatingPlatform;
  use_explorer: number;
  new_moves_per_session: number;
  daily_practice_goal: number;
  practice_time_zone: string;
  practice_depth: number;
  board_sounds: number;
  practice_pace: OpeningPracticePace;
  pause_after_move: OpeningPausePolicy;
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
      SELECT rating_group, platform, use_explorer, new_moves_per_session, daily_practice_goal, practice_time_zone,
             practice_depth, board_sounds, practice_pace, pause_after_move, updated_at
      FROM opening_player_preferences
      WHERE profile_id = ?
    `).get(profileId) as PreferenceRow | undefined;

    return row ? this.response(row, true) : {
      configured: false,
      ratingGroup: 1600,
      platform: "not_sure",
      useExplorer: false,
      explorerAvailable: this.explorerAvailable,
      newMovesPerSession: 5,
      dailyPracticeGoal: 10,
      practiceTimeZone: "UTC",
      practiceDepth: 8,
      boardSounds: false,
      practicePace: "normal",
      pauseAfterMove: "never",
      updatedAt: null,
    };
  }

  update(input: {
    ratingGroup: number;
    platform: OpeningRatingPlatform;
    useExplorer: boolean;
    newMovesPerSession?: number;
    dailyPracticeGoal?: number;
    practiceTimeZone?: string;
    practiceDepth?: number;
    boardSounds?: boolean;
    practicePace?: OpeningPracticePace;
    pauseAfterMove?: OpeningPausePolicy;
  }): OpeningPlayerPreferences {
    if (!RATING_GROUPS.has(input.ratingGroup)) throw new Error("Choose a supported rating range");
    if (!PLATFORMS.has(input.platform)) throw new Error("Choose where this rating comes from");
    if (typeof input.useExplorer !== "boolean") throw new Error("Choose whether to use practical game data");
    if (input.useExplorer && !this.explorerAvailable) {
      throw new Error("Add LICHESS_API_TOKEN to Docker before enabling practical frequencies");
    }

    const profileId = ensureActiveProfile(this.db);
    const current = this.get();
    const newMovesPerSession = input.newMovesPerSession ?? current.newMovesPerSession;
    const dailyPracticeGoal = input.dailyPracticeGoal ?? current.dailyPracticeGoal;
    const practiceTimeZone = input.practiceTimeZone ?? current.practiceTimeZone;
    if (!Number.isInteger(dailyPracticeGoal) || dailyPracticeGoal < 1 || dailyPracticeGoal > 50) {
      throw new Error("Choose between 1 and 50 daily practice positions");
    }
    if (typeof practiceTimeZone !== "string" || practiceTimeZone.length > 100) throw new Error("Choose a valid practice time zone");
    try { new Intl.DateTimeFormat("en-GB", { timeZone: practiceTimeZone }); }
    catch { throw new Error("Choose a valid practice time zone"); }
    const practiceDepth = input.practiceDepth ?? current.practiceDepth;
    const boardSounds = input.boardSounds ?? current.boardSounds;
    const practicePace = input.practicePace ?? current.practicePace;
    const pauseAfterMove = input.pauseAfterMove ?? current.pauseAfterMove;
    if (!["normal", "relaxed"].includes(practicePace)) throw new Error("Choose normal or relaxed practice pace");
    if (!["never", "mistakes", "notes", "always"].includes(pauseAfterMove)) throw new Error("Choose a supported practice pause setting");
    if (!Number.isInteger(newMovesPerSession) || newMovesPerSession < 1 || newMovesPerSession > 10) {
      throw new Error("Choose between 1 and 10 new moves per session");
    }
    if (!Number.isInteger(practiceDepth) || practiceDepth < 2 || practiceDepth > 20) {
      throw new Error("Choose a practice depth between 2 and 20 moves");
    }
    if (typeof boardSounds !== "boolean") throw new Error("Choose whether board sounds are enabled");
    const updatedAt = now();
    this.db.prepare(`
      INSERT INTO opening_player_preferences(
        profile_id, rating_group, platform, use_explorer,
        new_moves_per_session, daily_practice_goal, practice_time_zone, practice_depth, board_sounds, practice_pace, pause_after_move, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        rating_group = excluded.rating_group,
        platform = excluded.platform,
        use_explorer = excluded.use_explorer,
        new_moves_per_session = excluded.new_moves_per_session,
        daily_practice_goal = excluded.daily_practice_goal,
        practice_time_zone = excluded.practice_time_zone,
        practice_depth = excluded.practice_depth,
        board_sounds = excluded.board_sounds,
        practice_pace = excluded.practice_pace,
        pause_after_move = excluded.pause_after_move,
        updated_at = excluded.updated_at
    `).run(
      profileId, input.ratingGroup, input.platform, input.useExplorer ? 1 : 0,
      newMovesPerSession, dailyPracticeGoal, practiceTimeZone, practiceDepth, boardSounds ? 1 : 0, practicePace, pauseAfterMove, updatedAt,
    );

    return {
      configured: true,
      ratingGroup: input.ratingGroup,
      platform: input.platform,
      useExplorer: input.useExplorer,
      explorerAvailable: this.explorerAvailable,
      newMovesPerSession,
      dailyPracticeGoal,
      practiceTimeZone,
      practiceDepth,
      boardSounds,
      practicePace,
      pauseAfterMove,
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
      newMovesPerSession: row.new_moves_per_session,
      dailyPracticeGoal: row.daily_practice_goal,
      practiceTimeZone: row.practice_time_zone,
      practiceDepth: row.practice_depth,
      boardSounds: row.board_sounds === 1,
      practicePace: row.practice_pace,
      pauseAfterMove: row.pause_after_move,
      updatedAt: row.updated_at,
    };
  }
}
