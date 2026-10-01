import { Chess } from "chess.js";
import type {
  Color, OpeningExplorerPositionResponse, OpeningPreparationAssessment,
  OpeningPreparationChoice, OpeningPositionAnalysisResponse,
} from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { ensureActiveProfile } from "../training/profile.js";
import { openingPositionKey } from "./opening-content.js";
import { assessPreparation, PREPARATION_MIN_SAMPLE } from "./opening-preparation-policy.js";
import type { OpeningExplorerService } from "./opening-explorer-service.js";
import type { OpeningPreferencesService } from "./opening-preferences-service.js";
import type { OpeningAnalysisService } from "./opening-analysis-service.js";

export interface PreparationTarget {
  fen: string;
  opponentMoveUci: string;
  learnerColor: Color;
  repertoireId?: string;
}

export class OpeningPreparationService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly preferences: OpeningPreferencesService,
    private readonly explorer: OpeningExplorerService,
    private readonly analysis: OpeningAnalysisService,
    private readonly toleranceCp: number,
  ) {}

  validate(target: PreparationTarget): { before: Chess; after: Chess } {
    const before = new Chess(target.fen);
    if (before.turn() === (target.learnerColor === "white" ? "w" : "b")) throw new Error("Choose an opponent move to assess");
    if (target.repertoireId) {
      const repertoire = this.db.prepare("SELECT learner_color FROM opening_repertoires WHERE id = ?").get(target.repertoireId) as { learner_color: Color } | undefined;
      if (!repertoire || repertoire.learner_color !== target.learnerColor) throw new Error("Opening repertoire is not available for this colour");
    }
    const after = new Chess(before.fen());
    after.move({ from: target.opponentMoveUci.slice(0, 2), to: target.opponentMoveUci.slice(2, 4),
      ...(target.opponentMoveUci.length === 5 ? { promotion: target.opponentMoveUci[4] } : {}) });
    return { before, after };
  }

  cached(target: PreparationTarget, options?: { ratingGroup: number; useExplorer: boolean }): OpeningPreparationAssessment {
    const { before } = this.validate(target);
    const preference = this.preferences.get();
    const sample = (options?.useExplorer ?? preference.useExplorer)
      ? this.explorer.cachedPosition(before.fen(), options?.ratingGroup ?? preference.ratingGroup) : null;
    return this.build(target, sample);
  }

  async assess(target: PreparationTarget, refresh: boolean, analyze: boolean): Promise<OpeningPreparationAssessment> {
    const { before, after } = this.validate(target);
    const preference = this.preferences.get();
    let sample = preference.useExplorer ? this.explorer.cachedPosition(before.fen(), preference.ratingGroup) : null;
    let unavailable = false;
    let replies: OpeningPositionAnalysisResponse | null = null;
    await Promise.all([
      refresh && preference.useExplorer ? this.explorer.position(before.fen(), preference.ratingGroup, true)
        .then(result => { sample = result; }).catch(() => { unavailable = !sample; }) : Promise.resolve(),
      analyze ? this.analysis.analyze(after.fen()).then(result => { replies = result; }).catch(() => undefined) : Promise.resolve(),
    ]);
    return this.build(target, sample, replies, unavailable);
  }

  save(target: PreparationTarget, choice: OpeningPreparationChoice, note: string): void {
    if (!target.repertoireId) throw new Error("Save a repertoire before keeping preparation notes");
    const { before, after } = this.validate(target);
    if (!["idea", "unprepared", "line"].includes(choice)) throw new Error("Choose a preparation decision");
    if (choice === "idea" && !note.trim()) throw new Error("Write a short idea to remember");
    if (note.length > 2000) throw new Error("Keep your idea under 2,000 characters");
    this.db.prepare(`INSERT INTO opening_preparation_decisions
      (profile_id, repertoire_id, position_key, opponent_move_uci, after_position_key, choice, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(profile_id, repertoire_id, position_key, opponent_move_uci)
      DO UPDATE SET choice = excluded.choice, note = excluded.note, updated_at = excluded.updated_at`)
      .run(ensureActiveProfile(this.db), target.repertoireId, openingPositionKey(before.fen()), target.opponentMoveUci,
        openingPositionKey(after.fen()), choice, note.trim(), now());
  }

  private build(target: PreparationTarget, sample: OpeningExplorerPositionResponse | null,
    analysis: OpeningPositionAnalysisResponse | null = null, unavailable = false): OpeningPreparationAssessment {
    analysis ??= this.analysis.cached(this.validate(target).after.fen());
    const profileId = ensureActiveProfile(this.db);
    const preference = this.preferences.get();
    const move = sample?.replies.find(reply => reply.moveUci === target.opponentMoveUci);
    const frequency: OpeningPreparationAssessment["frequency"] = {
      status: !preference.useExplorer && !sample ? "off" : unavailable ? "unavailable" : !move || !sample?.totalGames ? "unknown"
        : sample.totalGames < PREPARATION_MIN_SAMPLE || move.games < 5 ? "small_sample" : "known",
      percent: move?.frequencyPercent ?? null, moveGames: move?.games ?? null,
      positionGames: sample?.totalGames ?? 0, ratingGroup: sample?.ratingGroup ?? preference.ratingGroup,
      speeds: sample?.speeds ?? ["blitz", "rapid", "classical"], stale: sample?.stale ?? false,
    };
    const candidates = this.db.prepare(`WITH recent AS (
      SELECT id FROM games WHERE profile_id = ? AND player_color = ?
      ORDER BY COALESCE(played_at, created_at) DESC, created_at DESC LIMIT 100
    ) SELECT move.game_id, move.ply, before.fen FROM recent
      JOIN moves move ON move.game_id = recent.id JOIN positions before ON before.id = move.from_position_id
      WHERE move.mover_color <> ? AND move.uci = ? ORDER BY move.ply`)
      .all(profileId, target.learnerColor, target.learnerColor, target.opponentMoveUci) as Array<{ game_id: string; ply: number; fen: string }>;
    const occurrences = new Map<string, { game_id: string; ply: number; fen: string }>();
    for (const move of candidates) if (!occurrences.has(move.game_id)
      && openingPositionKey(move.fen) === openingPositionKey(target.fen)) {
      occurrences.set(move.game_id, move);
    }
    const personal = { occurrences: occurrences.size, responsesAnalyzed: 0, responseMistakes: 0, opponentMistakes: 0 };
    let scores = analysis?.lines.map(line => line.score) ?? [];
    if (occurrences.size) {
      const assessment = this.db.prepare(`SELECT m.ply, m.mover_color, m.from_position_id, run.id AS run_id, a.meaningful
        FROM moves m JOIN analysis_runs run ON run.game_id = m.game_id AND run.status = 'completed'
        JOIN move_assessments a ON a.run_id = run.id AND a.move_id = m.id
        WHERE m.game_id = ? AND m.ply IN (?, ?)
          AND run.id = (SELECT id FROM analysis_runs WHERE game_id = ? AND status = 'completed'
            ORDER BY completed_at DESC, rowid DESC LIMIT 1)`);
      for (const occurrence of occurrences.values()) {
        // A transposition can reach this position at a different ply in each game.
        const rows = assessment.all(occurrence.game_id, occurrence.ply, occurrence.ply + 1, occurrence.game_id) as Array<{
          mover_color: Color; meaningful: number; run_id: string; from_position_id: string;
        }>;
        for (const row of rows) {
          if (row.mover_color === target.learnerColor) {
            personal.responsesAnalyzed++; if (row.meaningful) personal.responseMistakes++;
            if (!scores.length) {
              const stored = this.db.prepare(`SELECT line.centipawns_white, line.mate_in_white FROM engine_lines line
                JOIN position_analyses position ON position.id = line.position_analysis_id
                WHERE position.run_id = ? AND position.position_id = ? ORDER BY line.rank LIMIT 3`)
                .all(row.run_id, row.from_position_id) as Array<{ centipawns_white: number | null; mate_in_white: number | null }>;
              scores = stored.map(line => ({ kind: line.mate_in_white !== null ? "mate" as const : "centipawns" as const,
                value: (line.mate_in_white ?? line.centipawns_white ?? 0) * (target.learnerColor === "white" ? 1 : -1),
                perspective: "side_to_move" as const }));
            }
          }
          else if (row.meaningful) personal.opponentMistakes++;
        }
      }
    }
    let difficulty: OpeningPreparationAssessment["difficulty"] = "unknown";
    if (scores.some(score => score.kind === "mate")) difficulty = "forcing";
    else if (scores.length >= 2 && scores.every(score => score.kind === "centipawns")) {
      if (scores[0]!.value - scores[1]!.value >= 150) difficulty = "precise_reply";
      else if (scores[0]!.value >= -100 && scores[0]!.value - scores[1]!.value <= this.toleranceCp) difficulty = "several_replies";
    }
    const decision = target.repertoireId ? this.db.prepare(`SELECT choice, note, updated_at AS updatedAt
      FROM opening_preparation_decisions WHERE profile_id = ? AND repertoire_id = ? AND position_key = ? AND opponent_move_uci = ?`)
      .get(profileId, target.repertoireId, openingPositionKey(target.fen), target.opponentMoveUci) as OpeningPreparationAssessment["decision"] : null;
    return assessPreparation({ frequency, personal, difficulty, decision });
  }
}
