import type {
  OpeningCatalogResponse,
  OpeningLineProgress,
  OpeningProgressResponse,
} from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { ensureActiveProfile } from "../training/profile.js";
import {
  compileOpeningCurriculum,
  type CompiledOpeningCurriculum,
  type OpeningCurriculum,
} from "./opening-content.js";

export class OpeningContentService {
  constructor(private readonly db: SqliteDatabase) {}

  sync(curricula: OpeningCurriculum[]): void {
    const compiled = curricula.map(compileOpeningCurriculum);
    this.db.transaction(() => compiled.forEach((curriculum) => this.persist(curriculum)))();
  }

  catalog(): OpeningCatalogResponse {
    const profileId = ensureActiveProfile(this.db);
    const timestamp = now();
    const rows = this.db.prepare(`
      SELECT r.id, r.slug, r.name, r.learner_color, r.first_move_uci, r.first_move_san,
             r.summary, r.audience_label, r.style_json, r.memory_burden,
             r.content_version, r.status, oi.source_title,
             COUNT(DISTINCT CASE WHEN c.active = 1 THEN c.id END) AS chapter_count
      FROM opening_repertoires r
      LEFT JOIN opening_imports oi ON oi.repertoire_id = r.id
      LEFT JOIN opening_chapters c ON c.repertoire_id = r.id
      GROUP BY r.id
      ORDER BY r.learner_color DESC, r.name
    `).all() as Array<Record<string, unknown>>;
    const archivedIds = new Set(this.db.prepare(`
      SELECT repertoire_id FROM opening_repertoire_preferences
      WHERE profile_id = ? AND archived_at IS NOT NULL
    `).pluck().all(profileId) as string[]);
    const lineStats = new Map((this.db.prepare(`
      SELECT repertoire.id AS repertoire_id,
             COUNT(DISTINCT CASE WHEN preference.archived_at IS NULL THEN line.id END) AS active_count,
             COUNT(DISTINCT CASE WHEN preference.archived_at IS NOT NULL THEN line.id END) AS archived_count,
             COUNT(DISTINCT CASE WHEN preference.archived_at IS NULL AND move.active = 1
               AND move.role = 'learner' THEN move.from_position_id END) AS decision_count
      FROM opening_repertoires repertoire
      LEFT JOIN opening_chapters chapter ON chapter.repertoire_id = repertoire.id AND chapter.active = 1
      LEFT JOIN opening_lines line ON line.chapter_id = chapter.id AND line.active = 1
      LEFT JOIN opening_line_preferences preference
        ON preference.line_id = line.id AND preference.profile_id = ?
      LEFT JOIN opening_line_moves membership ON membership.line_id = line.id
      LEFT JOIN opening_moves move ON move.id = membership.move_id
      GROUP BY repertoire.id
    `).all(profileId) as Array<{
      repertoire_id: string; active_count: number; archived_count: number; decision_count: number;
    }>).map((row) => [row.repertoire_id, row]));
    const reviewStats = new Map((this.db.prepare(`
      SELECT ori.repertoire_id,
             SUM(CASE WHEN state <> 0 AND due_at <= ? THEN 1 ELSE 0 END) AS due_count,
             SUM(CASE WHEN state = 0 THEN 1 ELSE 0 END) AS new_count,
             SUM(CASE WHEN state IN (1, 3) THEN 1 ELSE 0 END) AS learning_count,
             SUM(CASE WHEN state = 2 THEN 1 ELSE 0 END) AS reviewed_count,
             COUNT(*) AS item_count
      FROM opening_review_items ori
      JOIN opening_moves trained_move ON trained_move.id = ori.move_id AND trained_move.active = 1
      WHERE ori.profile_id = ? AND ori.knowledge_dimension = 'move'
        AND EXISTS (
          SELECT 1
          FROM opening_line_moves membership
          JOIN opening_lines line ON line.id = membership.line_id AND line.active = 1
          JOIN opening_chapters chapter ON chapter.id = line.chapter_id AND chapter.active = 1
          LEFT JOIN opening_line_preferences preference
            ON preference.line_id = line.id AND preference.profile_id = ori.profile_id
          WHERE membership.move_id = trained_move.id AND preference.archived_at IS NULL
        )
      GROUP BY ori.repertoire_id
    `).all(timestamp, profileId) as Array<Record<string, unknown>>)
      .map((row) => [String(row.repertoire_id), row]));

    return {
      repertoires: rows.map((row) => {
        const repertoireId = String(row.id);
        const lineCounts = lineStats.get(repertoireId);
        const decisionCount = Number(lineCounts?.decision_count ?? 0);
        const review = reviewStats.get(repertoireId);
        const storedItems = Number(review?.item_count ?? 0);
        return {
          id: repertoireId,
          slug: String(row.slug),
          name: String(row.name),
          learnerColor: row.learner_color as "white" | "black",
          firstMoveUci: String(row.first_move_uci),
          firstMoveSan: String(row.first_move_san),
          summary: String(row.summary),
          audienceLabel: String(row.audience_label),
          style: JSON.parse(String(row.style_json)) as string[],
          memoryBurden: row.memory_burden as "low" | "medium" | "high",
          contentVersion: Number(row.content_version),
          status: row.status as "preview" | "published",
          chapterCount: Number(row.chapter_count),
          decisionCount,
          origin: row.source_title === null || row.source_title === undefined ? "built_in" : "imported",
          sourceTitle: row.source_title === null || row.source_title === undefined ? null : String(row.source_title),
          archived: archivedIds.has(repertoireId),
          activeLineCount: Number(lineCounts?.active_count ?? 0),
          archivedLineCount: Number(lineCounts?.archived_count ?? 0),
          review: {
            total: decisionCount,
            due: Number(review?.due_count ?? 0),
            new: Number(review?.new_count ?? 0) + Math.max(0, decisionCount - storedItems),
            learning: Number(review?.learning_count ?? 0),
            reviewed: Number(review?.reviewed_count ?? 0),
          },
        };
      }),
    };
  }

  progress(): OpeningProgressResponse {
    const profileId = ensureActiveProfile(this.db);
    const lines = this.db.prepare(`
      SELECT repertoire.id AS repertoire_id, repertoire.name AS repertoire_name,
             repertoire.learner_color, line.id AS line_id, line.title AS line_title
      FROM opening_repertoires repertoire
      JOIN opening_chapters chapter ON chapter.repertoire_id = repertoire.id AND chapter.active = 1
      JOIN opening_lines line ON line.chapter_id = chapter.id AND line.active = 1
      LEFT JOIN opening_repertoire_preferences repertoire_preference
        ON repertoire_preference.repertoire_id = repertoire.id AND repertoire_preference.profile_id = ?
      LEFT JOIN opening_line_preferences line_preference
        ON line_preference.line_id = line.id AND line_preference.profile_id = ?
      WHERE repertoire_preference.archived_at IS NULL AND line_preference.archived_at IS NULL
      ORDER BY repertoire.name, chapter.sort_order, line.priority, line.title
    `).all(profileId, profileId) as Array<{
      repertoire_id: string;
      repertoire_name: string;
      learner_color: "white" | "black";
      line_id: string;
      line_title: string;
    }>;
    const reviewByLine = new Map((this.db.prepare(`
      SELECT membership.line_id,
             COUNT(DISTINCT move.id) AS decisions,
             COUNT(DISTINCT CASE WHEN item.state = 2 THEN move.id END) AS mastered,
             COALESCE(SUM(item.lapses), 0) AS lapses,
             AVG(item.average_response_ms) AS average_response_ms
      FROM opening_line_moves membership
      JOIN opening_moves move ON move.id = membership.move_id AND move.active = 1 AND move.role = 'learner'
      LEFT JOIN opening_review_items item
        ON item.move_id = move.id AND item.profile_id = ? AND item.knowledge_dimension = 'move'
      GROUP BY membership.line_id
    `).all(profileId) as Array<{
      line_id: string; decisions: number; mastered: number; lapses: number; average_response_ms: number | null;
    }>).map((row) => [row.line_id, row]));
    const attemptsByLine = new Map((this.db.prepare(`
      SELECT membership.line_id, COUNT(*) AS attempts, SUM(event.correct) AS correct
      FROM opening_review_events event
      JOIN opening_review_items item ON item.id = event.review_item_id AND item.profile_id = ?
      JOIN opening_line_moves membership ON membership.move_id = item.move_id
      GROUP BY membership.line_id
    `).all(profileId) as Array<{ line_id: string; attempts: number; correct: number | null }>)
      .map((row) => [row.line_id, row]));
    const missesByLine = new Map((this.db.prepare(`
      SELECT membership.line_id, COUNT(DISTINCT match.game_id) AS game_misses
      FROM game_opening_matches match
      JOIN opening_line_moves membership ON membership.move_id = match.expected_move_id
      WHERE match.profile_id = ? AND match.status = 'player_deviation'
      GROUP BY membership.line_id
    `).all(profileId) as Array<{ line_id: string; game_misses: number }>)
      .map((row) => [row.line_id, Number(row.game_misses)]));
    const progress = lines.map((line): OpeningLineProgress => {
      const review = reviewByLine.get(line.line_id) ?? {
        decisions: 0, mastered: 0, lapses: 0, average_response_ms: null,
      };
      const attempts = attemptsByLine.get(line.line_id) ?? { attempts: 0, correct: null };
      const gameMisses = missesByLine.get(line.line_id) ?? 0;
      return {
        repertoireId: line.repertoire_id,
        repertoireName: line.repertoire_name,
        lineId: line.line_id,
        lineTitle: line.line_title,
        learnerColor: line.learner_color,
        decisions: Number(review.decisions),
        mastered: Number(review.mastered),
        accuracyPercent: Number(attempts.attempts) > 0
          ? Math.round((Number(attempts.correct ?? 0) / Number(attempts.attempts)) * 100)
          : null,
        lapses: Number(review.lapses),
        averageResponseMs: review.average_response_ms === null ? null : Math.round(Number(review.average_response_ms)),
        gameMisses,
      };
    }).filter((line) => line.decisions > 0);
    progress.sort((left, right) =>
      right.gameMisses - left.gameMisses
      || Number(left.accuracyPercent === null) - Number(right.accuracyPercent === null)
      || (left.accuracyPercent ?? 101) - (right.accuracyPercent ?? 101)
      || (left.mastered / left.decisions) - (right.mastered / right.decisions)
      || right.lapses - left.lapses
      || left.lineTitle.localeCompare(right.lineTitle));
    return {
      totalLines: progress.length,
      masteredLines: progress.filter((line) => line.mastered === line.decisions && line.decisions > 0).length,
      weakestLines: progress.slice(0, 5),
    };
  }

  private persist(compiled: CompiledOpeningCurriculum): void {
    const { curriculum } = compiled;
    const timestamp = now();
    const checksum = createHash("sha256").update(JSON.stringify(compiled)).digest("hex");
    const existing = this.db.prepare(`
      SELECT content_version, content_checksum FROM opening_repertoires WHERE id = ?
    `).get(curriculum.id) as { content_version: number; content_checksum: string | null } | undefined;
    if (existing && existing.content_version > curriculum.version) {
      throw new Error(`Opening ${curriculum.id} cannot be downgraded from version ${existing.content_version} to ${curriculum.version}`);
    }
    if (existing?.content_checksum && existing.content_version === curriculum.version
      && existing.content_checksum !== checksum) {
      throw new Error(`Opening ${curriculum.id} changed without a content version increase`);
    }
    this.db.prepare(`
      INSERT INTO opening_repertoires(
        id, slug, name, learner_color, first_move_uci, first_move_san, summary,
        audience_label, style_json, memory_burden, content_version, content_checksum,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug, name = excluded.name, learner_color = excluded.learner_color,
        first_move_uci = excluded.first_move_uci, first_move_san = excluded.first_move_san,
        summary = excluded.summary, audience_label = excluded.audience_label,
        style_json = excluded.style_json, memory_burden = excluded.memory_burden,
        content_version = excluded.content_version, content_checksum = excluded.content_checksum,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      curriculum.id,
      curriculum.slug,
      curriculum.name,
      curriculum.learnerColor,
      curriculum.firstMoveUci,
      compiled.firstMoveSan,
      curriculum.summary,
      curriculum.audienceLabel,
      JSON.stringify(curriculum.style),
      curriculum.memoryBurden,
      curriculum.version,
      checksum,
      curriculum.status,
      timestamp,
      timestamp,
    );

    this.db.prepare("UPDATE opening_chapters SET active = 0 WHERE repertoire_id = ?").run(curriculum.id);
    this.db.prepare("UPDATE opening_moves SET active = 0 WHERE repertoire_id = ?").run(curriculum.id);
    this.db.prepare(`
      UPDATE opening_lines SET active = 0
      WHERE chapter_id IN (SELECT id FROM opening_chapters WHERE repertoire_id = ?)
    `).run(curriculum.id);
    this.db.prepare("DELETE FROM opening_sources WHERE repertoire_id = ?").run(curriculum.id);

    for (const position of compiled.positions) {
      this.db.prepare(`
        INSERT INTO opening_positions(id, position_key, fen, side_to_move)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(position_key) DO UPDATE SET fen = excluded.fen, side_to_move = excluded.side_to_move
      `).run(position.id, position.key, position.fen, position.sideToMove);
    }

    const movesById = new Map(compiled.moves.map((move) => [move.id, move]));
    const moveOrder = new Map<string, number>();
    for (const chapter of compiled.chapters) {
      for (const line of chapter.lines) {
        line.moveIds.forEach((moveId, index) => {
          moveOrder.set(moveId, Math.min(moveOrder.get(moveId) ?? Number.POSITIVE_INFINITY, index));
        });
      }
    }
    for (const move of compiled.moves) {
      this.db.prepare(`
        INSERT INTO opening_moves(
          id, repertoire_id, from_position_id, to_position_id, move_uci, move_san,
          role, move_kind, frequency, sort_order, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          from_position_id = excluded.from_position_id, to_position_id = excluded.to_position_id,
          move_san = excluded.move_san, role = excluded.role, move_kind = excluded.move_kind,
          frequency = excluded.frequency, sort_order = excluded.sort_order, active = 1
      `).run(
        move.id,
        curriculum.id,
        move.fromPositionId,
        move.toPositionId,
        move.moveUci,
        move.san,
        move.role,
        move.kind,
        move.frequency ?? null,
        moveOrder.get(move.id) ?? 0,
      );
      this.db.prepare(`
        INSERT INTO opening_move_annotations(
          move_id, summary, changes_json, concepts_json, opponent_idea,
          resulting_plan, tactical_warning, common_mistake
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(move_id) DO UPDATE SET
          summary = excluded.summary, changes_json = excluded.changes_json,
          concepts_json = excluded.concepts_json, opponent_idea = excluded.opponent_idea,
          resulting_plan = excluded.resulting_plan, tactical_warning = excluded.tactical_warning,
          common_mistake = excluded.common_mistake
      `).run(
        move.id,
        move.explanation.summary,
        JSON.stringify(move.explanation.changes),
        JSON.stringify(move.explanation.concepts),
        move.explanation.opponentIdea ?? null,
        move.explanation.resultingPlan ?? null,
        move.explanation.tacticalWarning ?? null,
        move.explanation.commonMistake ?? null,
      );
    }

    compiled.chapters.forEach((chapter, chapterIndex) => {
      this.db.prepare(`
        INSERT INTO opening_chapters(
          id, repertoire_id, slug, title, introduction, root_position_id, sort_order, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug, title = excluded.title, introduction = excluded.introduction,
          root_position_id = excluded.root_position_id, sort_order = excluded.sort_order, active = 1
      `).run(
        chapter.id,
        curriculum.id,
        chapter.slug,
        chapter.title,
        chapter.introduction,
        chapter.rootPositionId,
        chapterIndex,
      );

      chapter.lines.forEach((line) => {
        this.db.prepare(`
          INSERT INTO opening_lines(id, chapter_id, slug, title, priority, active)
          VALUES (?, ?, ?, ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug, title = excluded.title, priority = excluded.priority, active = 1
        `).run(line.id, chapter.id, line.slug, line.title, line.priority);
        this.db.prepare("DELETE FROM opening_line_moves WHERE line_id = ?").run(line.id);
        line.moveIds.forEach((moveId, index) => {
          if (!movesById.has(moveId)) throw new Error(`Compiled line references missing move ${moveId}`);
          this.db.prepare(`
            INSERT INTO opening_line_moves(line_id, move_id, ply) VALUES (?, ?, ?)
          `).run(line.id, moveId, index + 1);
        });
      });
    });

    for (const source of curriculum.sources) {
      this.db.prepare(`
        INSERT INTO opening_sources(id, repertoire_id, kind, title, url, license, accessed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind, title = excluded.title, url = excluded.url,
          license = excluded.license, accessed_at = excluded.accessed_at
      `).run(
        `${curriculum.id}:${source.id}`,
        curriculum.id,
        source.kind,
        source.title,
        source.url ?? null,
        source.license ?? null,
        source.accessedAt ?? null,
      );
    }
  }
}
import { createHash } from "node:crypto";
