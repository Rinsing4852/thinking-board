import type { OpeningCatalogResponse } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { activeProfileId } from "../training/profile.js";
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
    const profileId = activeProfileId(this.db);
    const timestamp = now();
    const rows = this.db.prepare(`
      SELECT r.id, r.slug, r.name, r.learner_color, r.first_move_uci, r.first_move_san,
             r.summary, r.audience_label, r.style_json, r.memory_burden,
             r.content_version, r.status, oi.source_title,
             COUNT(DISTINCT CASE WHEN c.active = 1 THEN c.id END) AS chapter_count,
             COUNT(DISTINCT CASE WHEN m.active = 1 AND m.role = 'learner' THEN m.from_position_id END) AS decision_count
      FROM opening_repertoires r
      LEFT JOIN opening_imports oi ON oi.repertoire_id = r.id
      LEFT JOIN opening_chapters c ON c.repertoire_id = r.id
      LEFT JOIN opening_moves m ON m.repertoire_id = r.id
      GROUP BY r.id
      ORDER BY r.learner_color DESC, r.name
    `).all() as Array<Record<string, unknown>>;

    return {
      repertoires: rows.map((row) => {
        const decisionCount = Number(row.decision_count);
        const review = profileId
          ? this.db.prepare(`
            SELECT
              SUM(CASE WHEN state <> 0 AND due_at <= ? THEN 1 ELSE 0 END) AS due_count,
              SUM(CASE WHEN state = 0 THEN 1 ELSE 0 END) AS new_count,
              SUM(CASE WHEN state IN (1, 3) THEN 1 ELSE 0 END) AS learning_count,
              SUM(CASE WHEN state = 2 THEN 1 ELSE 0 END) AS reviewed_count,
              COUNT(*) AS item_count
            FROM opening_review_items ori
            JOIN opening_moves trained_move ON trained_move.id = ori.move_id AND trained_move.active = 1
            WHERE ori.profile_id = ? AND ori.repertoire_id = ? AND ori.knowledge_dimension = 'move'
          `).get(timestamp, profileId, String(row.id)) as Record<string, unknown>
          : null;
        const storedItems = Number(review?.item_count ?? 0);
        return {
          id: String(row.id),
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
