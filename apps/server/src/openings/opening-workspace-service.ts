import type {
  OpeningChapterDetail,
  OpeningLineDetail,
  OpeningLineMove,
  OpeningRepertoireDetailResponse,
  OpeningLineMutationResponse,
  OpeningLineDeletionResponse,
  OpeningLearningCommentResponse,
  OpeningRepertoireDeletionResponse,
  OpeningLibraryDeletionResponse,
  OpeningSurprisePreparationResponse,
  OpeningArchiveResponse,
  OpeningMetadataMutationResponse,
  OpeningMoveUndoResponse,
} from "../../../../packages/contracts/src/api.js";
import { Chess } from "chess.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { openingPositionKey } from "./opening-content.js";
import { ensureActiveProfile } from "../training/profile.js";
import type { MoveExplanation } from "./opening-content.js";
import { chapterMovetext, pgnTag } from "./opening-pgn-export.js";

interface RepertoireRow {
  id: string;
  name: string;
  learner_color: "white" | "black";
  summary: string;
  source_title: string | null;
  editable: number;
  archived_at: string | null;
}

interface ChapterRow {
  id: string;
  title: string;
  introduction: string;
}

interface LineRow {
  id: string;
  title: string;
  priority: number;
  archived_at: string | null;
  practice_enabled: number;
}

interface MoveRow {
  id: string;
  ply: number;
  move_uci: string;
  move_san: string;
  role: "learner" | "opponent";
  move_kind: "primary" | "alternative" | "response";
  fen_before: string;
  fen_after: string;
  summary: string;
  changes_json: string;
  concepts_json: string;
  opponent_idea: string | null;
  resulting_plan: string | null;
  tactical_warning: string | null;
  common_mistake: string | null;
  personal_comment: string | null;
  idea_hint: string | null;
  board_annotations_json: string;
  source_explanation_json: string | null;
}

export class OpeningWorkspaceService {
  constructor(private readonly db: SqliteDatabase) {}

  repertoire(repertoireId: string): OpeningRepertoireDetailResponse {
    const profileId = ensureActiveProfile(this.db);
    const repertoire = this.db.prepare(`
      SELECT r.id, r.name, r.learner_color, r.summary, oi.source_title,
             CASE WHEN oi.repertoire_id IS NULL THEN 0 ELSE 1 END AS editable,
             preference.archived_at
      FROM opening_repertoires r
      LEFT JOIN opening_imports oi ON oi.repertoire_id = r.id
      LEFT JOIN opening_repertoire_preferences preference
        ON preference.repertoire_id = r.id AND preference.profile_id = ?
      WHERE r.id = ?
    `).get(profileId, repertoireId) as RepertoireRow | undefined;
    if (!repertoire) throw new Error("Opening repertoire is not available");

    const chapters = this.db.prepare(`
      SELECT id, title, introduction
      FROM opening_chapters
      WHERE repertoire_id = ? AND active = 1
      ORDER BY sort_order, title
    `).all(repertoireId) as ChapterRow[];

    return {
      repertoire: {
        id: repertoire.id,
        name: repertoire.name,
        learnerColor: repertoire.learner_color,
        summary: repertoire.summary,
        origin: repertoire.source_title === null ? "built_in" : "imported",
        sourceTitle: repertoire.source_title,
        editable: repertoire.editable === 1,
        archived: repertoire.archived_at !== null,
      },
      chapters: chapters.map((chapter): OpeningChapterDetail => ({
        id: chapter.id,
        title: chapter.title,
        introduction: chapter.introduction,
        lines: this.lines(chapter.id, profileId),
      })),
    };
  }

  addMove(input: {
    repertoireId: string;
    lineId: string;
    afterPly: number;
    moveUci: string;
    branchTitle?: string | undefined;
    summary?: string | undefined;
    requestId?: string | undefined;
  }): OpeningLineMutationResponse {
    this.assertEditable(input.repertoireId);
    const profileId = ensureActiveProfile(this.db);
    if (!Number.isInteger(input.afterPly) || input.afterPly < 0) throw new Error("Choose a valid place in the line");
    const moveUci = input.moveUci.trim().toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveUci)) throw new Error("Move must be legal UCI notation");
    if (input.requestId !== undefined) {
      if (!/^[\w-]{1,128}$/.test(input.requestId)) throw new Error("Invalid builder request ID");
      const saved = this.db.prepare("SELECT * FROM opening_builder_requests WHERE request_id = ?").get(input.requestId) as {
        repertoire_id: string; source_line_id: string; after_ply: number; move_uci: string;
        line_id: string; move_id: string; created_branch: number;
      } | undefined;
      if (saved) {
        if (saved.repertoire_id !== input.repertoireId || saved.source_line_id !== input.lineId
          || saved.after_ply !== input.afterPly || saved.move_uci !== moveUci) throw new Error("Builder request has already been used for a different move");
        if (!this.db.prepare("SELECT 1 FROM opening_line_moves WHERE line_id = ? AND move_id = ? AND ply = ?")
          .get(saved.line_id, saved.move_id, input.afterPly + 1)) throw new Error("This saved move was undone. Choose it again to add a new move.");
        return { detail: this.repertoire(input.repertoireId), lineId: saved.line_id, moveId: saved.move_id,
          createdBranch: saved.created_branch === 1, changed: false, message: "Move already saved. Your line is up to date." };
      }
    }
    const line = this.db.prepare(`
      SELECT l.id, l.title, l.chapter_id, l.priority, r.learner_color
      FROM opening_lines l
      JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
      JOIN opening_repertoires r ON r.id = c.repertoire_id
      WHERE l.id = ? AND c.repertoire_id = ? AND l.active = 1
    `).get(input.lineId, input.repertoireId) as {
      id: string; title: string; chapter_id: string; priority: number; learner_color: "white" | "black";
    } | undefined;
    if (!line) throw new Error("Opening line is not available");
    const moves = this.moves(line.id, profileId);
    if (input.afterPly > moves.length) throw new Error("That place is beyond the end of this line");
    const fen = input.afterPly === 0 ? moves[0]?.fenBefore : moves[input.afterPly - 1]?.fenAfter;
    if (!fen) throw new Error("The line has no starting position");
    const nextMove = moves[input.afterPly];
    if (nextMove?.moveUci === moveUci) throw new Error(`${nextMove.moveSan} is already the next move in this line`);
    if (input.afterPly === 0 && nextMove) {
      throw new Error("A repertoire keeps one first move. Create a separate repertoire for a different first move.");
    }

    const chess = new Chess(fen);
    let played;
    try {
      played = chess.move({
        from: moveUci.slice(0, 2),
        to: moveUci.slice(2, 4),
        ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
      });
    } catch {
      played = null;
    }
    if (!played) throw new Error("That move is not legal in this position");
    const summary = input.summary?.trim().slice(0, 600) || null;
    const createdBranch = Boolean(nextMove);
    let targetLineId = line.id;
    let savedMoveId = "";

    this.db.transaction(() => {
      const fromPositionId = this.ensurePosition(fen);
      const fenAfter = chess.fen();
      const toPositionId = this.ensurePosition(fenAfter);
      const moverColor = fen.split(" ")[1] === "b" ? "black" : "white";
      const role = moverColor === line.learner_color ? "learner" : "opponent";
      const existingMove = this.db.prepare(`
        SELECT id FROM opening_moves
        WHERE repertoire_id = ? AND from_position_id = ? AND move_uci = ?
      `).get(input.repertoireId, fromPositionId, moveUci) as { id: string } | undefined;
      const moveId = existingMove?.id ?? id();
      savedMoveId = moveId;
      if (existingMove) {
        this.db.prepare("UPDATE opening_moves SET active = 1 WHERE id = ?").run(moveId);
      } else {
        const siblingCount = Number(this.db.prepare(`
          SELECT COUNT(*) FROM opening_moves
          WHERE repertoire_id = ? AND from_position_id = ? AND role = ? AND active = 1
        `).pluck().get(input.repertoireId, fromPositionId, role));
        const sortOrder = Number(this.db.prepare(`
          SELECT COALESCE(MAX(sort_order), -1) + 1 FROM opening_moves
          WHERE repertoire_id = ? AND from_position_id = ?
        `).pluck().get(input.repertoireId, fromPositionId));
        const moveKind = role === "opponent" ? "response" : siblingCount === 0 ? "primary" : "alternative";
        this.db.prepare(`
          INSERT INTO opening_moves(
            id, repertoire_id, from_position_id, to_position_id, move_uci, move_san,
            role, move_kind, sort_order, active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(moveId, input.repertoireId, fromPositionId, toPositionId, moveUci, played.san, role, moveKind, sortOrder);
        const defaultSummary = role === "learner"
          ? `No explanation has been added for ${played.san} yet.`
          : `${played.san} is an opponent response you added on the board.`;
        this.db.prepare(`
          INSERT INTO opening_move_annotations(
            move_id, summary, changes_json, concepts_json, opponent_idea,
            resulting_plan, tactical_warning, common_mistake
          ) VALUES (?, ?, '[]', ?, ?, NULL, NULL, NULL)
        `).run(
          moveId,
          summary ?? defaultSummary,
          summary ? '["personal_explanation"]' : '["missing_explanation"]',
          role === "opponent" ? summary ?? "Add what this reply is trying to achieve." : null,
        );
      }

      if (createdBranch) {
        targetLineId = id();
        const branchTitle = input.branchTitle?.trim().slice(0, 120)
          || `${line.title} — ${played.san} branch`;
        const priority = Number(this.db.prepare(`
          SELECT COALESCE(MAX(priority), 0) + 1 FROM opening_lines WHERE chapter_id = ?
        `).pluck().get(line.chapter_id));
        this.db.prepare(`
          INSERT INTO opening_lines(id, chapter_id, slug, title, priority, active)
          VALUES (?, ?, ?, ?, ?, 1)
        `).run(targetLineId, line.chapter_id, `branch-${targetLineId.slice(0, 8)}`, branchTitle, priority);
        this.db.prepare(`
          INSERT INTO opening_line_moves(line_id, move_id, ply)
          SELECT ?, move_id, ply FROM opening_line_moves
          WHERE line_id = ? AND ply <= ? ORDER BY ply
        `).run(targetLineId, line.id, input.afterPly);
        this.db.prepare(`INSERT INTO opening_line_annotations(line_id, ply, explanation_json)
          SELECT ?, ply, explanation_json FROM opening_line_annotations WHERE line_id = ? AND ply <= ?`)
          .run(targetLineId, line.id, input.afterPly);
      }
      this.db.prepare(`
        INSERT INTO opening_line_moves(line_id, move_id, ply) VALUES (?, ?, ?)
      `).run(targetLineId, moveId, input.afterPly + 1);
      if (input.requestId) this.db.prepare(`INSERT INTO opening_builder_requests
        (request_id, repertoire_id, source_line_id, after_ply, move_uci, line_id, move_id, created_branch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(input.requestId, input.repertoireId, line.id, input.afterPly, moveUci, targetLineId, moveId, createdBranch ? 1 : 0);
      this.touch(input.repertoireId);
    })();

    return {
      detail: this.repertoire(input.repertoireId),
      lineId: targetLineId,
      moveId: savedMoveId,
      createdBranch,
      changed: true,
      message: createdBranch
        ? `${played.san} was saved as a new branch; the original line is unchanged.`
        : `${played.san} was added to the end of this line.`,
    };
  }

  addSequence(repertoireId: string, lineId: string, afterPly: number, moveUcis: string[], requestId: string): OpeningLineMutationResponse {
    if (!Array.isArray(moveUcis) || moveUcis.length < 1 || moveUcis.length > 24
      || moveUcis.some(move => typeof move !== "string")) throw new Error("Choose between 1 and 24 analysis moves to add");
    if (!/^[\w-]{1,90}$/.test(requestId)) throw new Error("Invalid analysis request ID");
    if (!Number.isInteger(afterPly) || afterPly < 0) throw new Error("Choose a valid place in the line");
    this.assertEditable(repertoireId);
    // Save as one transaction: an invalid later move must not leave half a sequence behind.
    return this.db.transaction(() => {
      let targetLineId = lineId;
      let targetPly = afterPly;
      let result: OpeningLineMutationResponse | null = null;
      moveUcis.forEach((moveUci, index) => {
        const detail = this.repertoire(repertoireId);
        const target = detail.chapters.flatMap(chapter => chapter.lines).find(line => line.id === targetLineId);
        if (!target || targetPly > target.moves.length) throw new Error("Analysis starting position is no longer available");
        const saved = target.moves[targetPly];
        if (saved?.moveUci === moveUci && !this.db.prepare("SELECT 1 FROM opening_builder_requests WHERE request_id = ?").get(`${requestId}-${index}`)) {
          result = { detail, lineId: targetLineId, moveId: saved.id, createdBranch: false, changed: false,
            message: "Followed existing saved moves." };
        } else {
          result = this.addMove({ repertoireId, lineId: targetLineId, afterPly: targetPly, moveUci, requestId: `${requestId}-${index}` });
          targetLineId = result.lineId;
        }
        targetPly += 1;
      });
      return { ...result!, detail: this.repertoire(repertoireId), message: "Analysis sequence saved. Original lines are kept." };
    })();
  }

  undoLastMove(repertoireId: string, lineId: string, moveId: string): OpeningMoveUndoResponse {
    this.assertEditable(repertoireId);
    const profileId = ensureActiveProfile(this.db);
    const last = this.db.prepare(`
      SELECT membership.move_id, membership.ply, move.move_san
      FROM opening_line_moves membership
      JOIN opening_moves move ON move.id = membership.move_id
      JOIN opening_lines line ON line.id = membership.line_id
      JOIN opening_chapters chapter ON chapter.id = line.chapter_id
      WHERE membership.line_id = ? AND chapter.repertoire_id = ?
      ORDER BY membership.ply DESC LIMIT 1
    `).get(lineId, repertoireId) as { move_id: string; ply: number; move_san: string } | undefined;
    if (!last || last.move_id !== moveId) throw new Error("Only the most recently added move can be undone");
    if (last.ply <= 1) throw new Error("The first move cannot be removed from this editor");
    const timestamp = now();
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM opening_lesson_attempts WHERE profile_id = ? AND line_id = ?").run(profileId, lineId);
      this.abandonPractice(profileId, repertoireId, timestamp);
      this.db.prepare("DELETE FROM opening_line_moves WHERE line_id = ? AND move_id = ?").run(lineId, moveId);
      const stillUsed = Boolean(this.db.prepare("SELECT 1 FROM opening_line_moves WHERE move_id = ? LIMIT 1").get(moveId));
      if (!stillUsed) {
        this.db.prepare("DELETE FROM opening_review_items WHERE profile_id = ? AND move_id = ?").run(profileId, moveId);
        this.db.prepare("DELETE FROM opening_moves WHERE id = ?").run(moveId);
      }
      this.touch(repertoireId);
    })();
    return {
      detail: this.repertoire(repertoireId),
      lineId,
      message: `${last.move_san} was removed.`,
    };
  }

  deleteLine(repertoireId: string, lineId: string): OpeningLineDeletionResponse {
    const line = this.db.prepare(`
      SELECT l.id, l.title, l.chapter_id
      FROM opening_lines l
      JOIN opening_chapters c ON c.id = l.chapter_id
      WHERE l.id = ? AND c.repertoire_id = ? AND l.active = 1
    `).get(lineId, repertoireId) as { id: string; title: string; chapter_id: string } | undefined;
    if (!line) throw new Error("Opening line is not available");
    const lineCount = Number(this.db.prepare(`
      SELECT COUNT(*)
      FROM opening_lines l
      JOIN opening_chapters c ON c.id = l.chapter_id
      WHERE c.repertoire_id = ? AND l.active = 1 AND c.active = 1
    `).pluck().get(repertoireId));
    if (lineCount <= 1) {
      const result = this.deleteRepertoire(repertoireId);
      return { ...result, deletedLineId: lineId, detail: null, nextLineId: null,
        message: "The final line and its repertoire were deleted. Your imported games were kept." };
    }

    this.db.transaction(() => {
      this.db.prepare("DELETE FROM opening_lesson_attempts WHERE line_id = ?").run(lineId);
      this.db.prepare(`
        UPDATE opening_review_sessions
        SET status = 'abandoned', abandoned_at = ?
        WHERE repertoire_id = ? AND status = 'active'
      `).run(now(), repertoireId);
      this.db.prepare("DELETE FROM opening_lines WHERE id = ?").run(lineId);
      this.db.prepare(`
        DELETE FROM opening_review_items
        WHERE repertoire_id = ?
          AND move_id IN (
            SELECT id FROM opening_moves
            WHERE repertoire_id = ?
              AND NOT EXISTS (
                SELECT 1 FROM opening_line_moves olm WHERE olm.move_id = opening_moves.id
              )
          )
      `).run(repertoireId, repertoireId);
      this.db.prepare(`
        DELETE FROM opening_moves
        WHERE repertoire_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM opening_line_moves olm WHERE olm.move_id = opening_moves.id
          )
      `).run(repertoireId);
      this.db.prepare(`
        DELETE FROM opening_chapters
        WHERE id = ?
          AND NOT EXISTS (SELECT 1 FROM opening_lines WHERE chapter_id = opening_chapters.id)
      `).run(line.chapter_id);
      this.touch(repertoireId);
    })();

    const detail = this.repertoire(repertoireId);
    const nextLineId = detail.chapters.flatMap((chapter) => chapter.lines)[0]?.id;
    if (!nextLineId) throw new Error("The repertoire no longer has a line to display");
    return {
      detail,
      deletedLineId: lineId,
      nextLineId,
      message: `${line.title} was deleted. Shared moves remain in your other lines.`,
    };
  }

  deleteRepertoire(repertoireId: string): OpeningRepertoireDeletionResponse {
    const repertoire = this.db.prepare(`
      SELECT id, name FROM opening_repertoires WHERE id = ?
    `).get(repertoireId) as { id: string; name: string } | undefined;
    if (!repertoire) throw new Error("Opening repertoire is not available");

    this.db.transaction(() => {
      this.db.prepare("DELETE FROM opening_lesson_attempts WHERE repertoire_id = ?").run(repertoireId);
      this.db.prepare("DELETE FROM opening_repertoires WHERE id = ?").run(repertoireId);
    })();
    return {
      deletedRepertoireId: repertoireId,
      message: `${repertoire.name} was deleted. Your imported games were kept.`,
    };
  }

  deleteLibrary(repertoireIds: string[], confirmed: boolean): OpeningLibraryDeletionResponse {
    if (confirmed !== true) throw new Error("Confirm deletion of the opening library first");
    return this.db.transaction(() => {
      const existing = this.db.prepare("SELECT id FROM opening_repertoires ORDER BY id").pluck().all() as string[];
      if (JSON.stringify([...new Set(repertoireIds)].sort()) !== JSON.stringify(existing)) {
        throw new Error("The opening library changed. Reload it and confirm the current list before deleting.");
      }
      for (const repertoireId of existing) this.deleteRepertoire(repertoireId);
      return { deletedRepertoireIds: existing, message: "All opening repertoires, lines, notes and opening-review results were deleted. Your imported games and settings were kept." };
    })();
  }

  setRepertoireArchived(repertoireId: string, archived: boolean): OpeningArchiveResponse {
    const profileId = ensureActiveProfile(this.db);
    const repertoire = this.db.prepare(`
      SELECT name FROM opening_repertoires WHERE id = ?
    `).get(repertoireId) as { name: string } | undefined;
    if (!repertoire) throw new Error("Opening repertoire is not available");
    const timestamp = now();
    this.db.transaction(() => {
      if (archived) {
        this.db.prepare(`
          INSERT INTO opening_repertoire_preferences(profile_id, repertoire_id, archived_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(profile_id, repertoire_id) DO UPDATE SET
            archived_at = excluded.archived_at, updated_at = excluded.updated_at
        `).run(profileId, repertoireId, timestamp, timestamp);
        this.abandonPractice(profileId, repertoireId, timestamp);
      } else {
        this.db.prepare(`
          DELETE FROM opening_repertoire_preferences WHERE profile_id = ? AND repertoire_id = ?
        `).run(profileId, repertoireId);
      }
    })();
    return {
      entity: "repertoire",
      id: repertoireId,
      archived,
      message: archived
        ? `${repertoire.name} was archived. Its lines and progress are preserved.`
        : `${repertoire.name} was restored to opening practice.`,
    };
  }

  setLineArchived(repertoireId: string, lineId: string, archived: boolean): OpeningArchiveResponse {
    const profileId = ensureActiveProfile(this.db);
    const line = this.db.prepare(`
      SELECT line.title
      FROM opening_lines line
      JOIN opening_chapters chapter ON chapter.id = line.chapter_id
      WHERE line.id = ? AND chapter.repertoire_id = ? AND line.active = 1 AND chapter.active = 1
    `).get(lineId, repertoireId) as { title: string } | undefined;
    if (!line) throw new Error("Opening line is not available");
    if (archived) {
      const visibleLines = Number(this.db.prepare(`
        SELECT COUNT(*)
        FROM opening_lines candidate
        JOIN opening_chapters chapter ON chapter.id = candidate.chapter_id AND chapter.active = 1
        LEFT JOIN opening_line_preferences preference
          ON preference.line_id = candidate.id AND preference.profile_id = ?
        WHERE chapter.repertoire_id = ? AND candidate.active = 1 AND preference.archived_at IS NULL
      `).pluck().get(profileId, repertoireId));
      if (visibleLines <= 1) {
        throw new Error("This is the final active line. Archive the repertoire instead.");
      }
    }
    const timestamp = now();
    this.db.transaction(() => {
      if (archived) {
        this.db.prepare(`
          INSERT INTO opening_line_preferences(profile_id, line_id, archived_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(profile_id, line_id) DO UPDATE SET
            archived_at = excluded.archived_at, updated_at = excluded.updated_at
        `).run(profileId, lineId, timestamp, timestamp);
        this.abandonPractice(profileId, repertoireId, timestamp);
      } else {
        this.db.prepare(`
          DELETE FROM opening_line_preferences WHERE profile_id = ? AND line_id = ?
        `).run(profileId, lineId);
      }
    })();
    return {
      entity: "line",
      id: lineId,
      archived,
      message: archived
        ? `${line.title} was archived. Its moves and progress are preserved.`
        : `${line.title} was restored to practice.`,
      detail: this.repertoire(repertoireId),
    };
  }

  renameRepertoire(repertoireId: string, nameValue: string): OpeningMetadataMutationResponse {
    this.assertEditable(repertoireId);
    const name = nameValue.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!name) throw new Error("Enter a repertoire name");
    this.db.transaction(() => {
      this.db.prepare(`UPDATE opening_repertoires SET name = ? WHERE id = ?`).run(name, repertoireId);
      this.touch(repertoireId);
    })();
    return { detail: this.repertoire(repertoireId), message: `Repertoire renamed to ${name}.` };
  }

  updateLineMetadata(
    repertoireId: string,
    lineId: string,
    input: { title?: string; direction?: "earlier" | "later" },
  ): OpeningMetadataMutationResponse {
    this.assertEditable(repertoireId);
    const line = this.db.prepare(`
      SELECT line.id, line.title, line.priority, line.chapter_id
      FROM opening_lines line
      JOIN opening_chapters chapter ON chapter.id = line.chapter_id
      WHERE line.id = ? AND chapter.repertoire_id = ? AND line.active = 1
    `).get(lineId, repertoireId) as {
      id: string; title: string; priority: number; chapter_id: string;
    } | undefined;
    if (!line) throw new Error("Opening line is not available");
    const title = input.title === undefined
      ? line.title
      : input.title.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!title) throw new Error("Enter a line name");

    let moved = false;
    this.db.transaction(() => {
      this.db.prepare("UPDATE opening_lines SET title = ? WHERE id = ?").run(title, lineId);
      if (input.direction) {
        const sibling = this.db.prepare(`
          SELECT id, priority
          FROM opening_lines
          WHERE chapter_id = ? AND active = 1 AND id <> ?
            AND priority ${input.direction === "earlier" ? "<" : ">"} ?
          ORDER BY priority ${input.direction === "earlier" ? "DESC" : "ASC"}, title
          LIMIT 1
        `).get(line.chapter_id, lineId, line.priority) as { id: string; priority: number } | undefined;
        if (sibling) {
          this.db.prepare("UPDATE opening_lines SET priority = ? WHERE id = ?").run(sibling.priority, lineId);
          this.db.prepare("UPDATE opening_lines SET priority = ? WHERE id = ?").run(line.priority, sibling.id);
          moved = true;
        }
      }
      this.touch(repertoireId);
    })();
    return {
      detail: this.repertoire(repertoireId),
      message: input.direction
        ? moved
          ? `${title} moved ${input.direction === "earlier" ? "earlier" : "later"} in this chapter.`
          : `${title} is already ${input.direction === "earlier" ? "first" : "last"} in this chapter.`
        : `Line renamed to ${title}.`,
    };
  }

  exportPgn(repertoireId: string): { filename: string; pgn: string } {
    const detail = this.repertoire(repertoireId);
    const lines = detail.chapters.flatMap((chapter) => chapter.lines.map((line) => ({ chapter, line })));
    if (lines.length === 0) throw new Error("Add at least one line before exporting this repertoire");
    const cleanTag = pgnTag;
    const games = detail.chapters.filter(chapter => chapter.lines.length > 0).map(chapter => {
      const sourceKey = this.db.prepare("SELECT source_key FROM opening_import_chapters WHERE chapter_id = ?")
        .pluck().get(chapter.id) as string | undefined;
      const tags = [
        `[Event "${cleanTag(detail.repertoire.name)}"]`,
        `[Site "Thinking Board"]`,
        `[Round "-"]`,
        `[White "${detail.repertoire.learnerColor === "white" ? "Repertoire" : "Opponent"}"]`,
        `[Black "${detail.repertoire.learnerColor === "black" ? "Repertoire" : "Opponent"}"]`,
        `[Result "*"]`,
        `[Opening "${cleanTag(chapter.title)}"]`,
        `[ChapterName "${cleanTag(chapter.title)}"]`,
        `[Description "${cleanTag(chapter.introduction)}"]`,
        `[Repertoire "${cleanTag(detail.repertoire.name)}"]`,
        `[TBChapterKey "${cleanTag(sourceKey ?? chapter.id)}"]`,
        `[TBFormat "1"]`,
      ];
      return `${tags.join("\n")}\n\n${chapterMovetext(chapter.lines)}`;
    });
    const filename = `${detail.repertoire.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "repertoire"}.pgn`;
    return { filename, pgn: games.join("\n\n") };
  }

  prepareOpponentSurprise(input: {
    repertoireId: string;
    fenBefore: string;
    opponentMoveUci: string;
    replyMoveUci: string;
    opponentSummary?: string | undefined;
    replySummary?: string | undefined;
  }): Omit<OpeningSurprisePreparationResponse, "inbox"> {
    const original = this.db.prepare(`
      SELECT id, name FROM opening_repertoires WHERE id = ?
    `).get(input.repertoireId) as { id: string; name: string } | undefined;
    if (!original) throw new Error("Opening repertoire is not available");

    const opponent = this.legalMove(input.fenBefore, input.opponentMoveUci, "Opponent move");
    const reply = this.legalMove(opponent.fenAfter, input.replyMoveUci, "Your reply");
    const learnerColor = opponent.fenAfter.split(" ")[1] === "b" ? "black" : "white";
    const repertoireColor = this.db.prepare(`
      SELECT learner_color FROM opening_repertoires WHERE id = ?
    `).pluck().get(input.repertoireId);
    if (learnerColor !== repertoireColor) {
      throw new Error("Choose a reply for your side of this repertoire");
    }

    return this.db.transaction(() => {
      const copiedFromBuiltIn = !this.isEditable(input.repertoireId);
      const repertoireId = copiedFromBuiltIn
        ? this.cloneForEditing(input.repertoireId)
        : input.repertoireId;
      const target = this.lineAtPosition(repertoireId, input.fenBefore);
      if (!target) throw new Error("Could not find this game position in the repertoire");

      const opponentResult = this.addMove({
        repertoireId,
        lineId: target.lineId,
        afterPly: target.afterPly,
        moveUci: input.opponentMoveUci,
        branchTitle: `Against ${opponent.san}`,
        summary: input.opponentSummary,
      });
      const replyResult = this.addMove({
        repertoireId,
        lineId: opponentResult.lineId,
        afterPly: target.afterPly + 1,
        moveUci: input.replyMoveUci,
        summary: input.replySummary,
      });
      const repertoire = replyResult.detail.repertoire;
      return {
        repertoire: {
          id: repertoire.id,
          name: repertoire.name,
          copiedFromBuiltIn,
        },
        lineId: replyResult.lineId,
        opponentMove: { moveUci: input.opponentMoveUci, moveSan: opponent.san },
        replyMove: { moveUci: input.replyMoveUci, moveSan: reply.san },
        message: copiedFromBuiltIn
          ? `Created ${repertoire.name} and saved ${opponent.san} with your ${reply.san} reply.`
          : `Saved ${opponent.san} with your ${reply.san} reply to ${repertoire.name}.`,
      };
    })();
  }

  updateExplanation(repertoireId: string, moveId: string, summaryValue: string): OpeningRepertoireDetailResponse {
    this.assertEditable(repertoireId);
    const summary = summaryValue.trim().replace(/\s+/g, " ").slice(0, 600);
    if (!summary) throw new Error("Write a short explanation before saving");
    const move = this.db.prepare(`
      SELECT m.id, m.role FROM opening_moves m
      WHERE m.id = ? AND m.repertoire_id = ? AND m.active = 1
    `).get(moveId, repertoireId) as { id: string; role: "learner" | "opponent" } | undefined;
    if (!move) throw new Error("Opening move is not available");
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE opening_move_annotations
        SET summary = ?, concepts_json = '["personal_explanation"]',
            opponent_idea = CASE WHEN ? = 'opponent' THEN ? ELSE opponent_idea END,
            changes_json = '[]', resulting_plan = NULL
        WHERE move_id = ?
      `).run(summary, move.role, summary, move.id);
      this.touch(repertoireId);
    })();
    return this.repertoire(repertoireId);
  }

  updateLearningComment(
    repertoireId: string,
    moveId: string,
    commentValue: string,
    ideaHintValue?: string,
  ): OpeningLearningCommentResponse {
    const profileId = ensureActiveProfile(this.db);
    const move = this.db.prepare(`
      SELECT id FROM opening_moves
      WHERE id = ? AND repertoire_id = ? AND active = 1
    `).get(moveId, repertoireId);
    if (!move) throw new Error("Opening move is not available");

    const comment = commentValue.trim().replace(/\s+/g, " ").slice(0, 1000);
    const previousHint = this.db.prepare("SELECT idea_hint FROM opening_learning_comments WHERE profile_id = ? AND move_id = ?")
      .pluck().get(profileId, moveId) as string | null | undefined;
    const ideaHint = ideaHintValue === undefined ? previousHint ?? null
      : ideaHintValue.trim().replace(/\s+/g, " ").slice(0, 280) || null;
    const timestamp = now();
    if (!comment && !ideaHint) {
      this.db.prepare(`
        DELETE FROM opening_learning_comments WHERE profile_id = ? AND move_id = ?
      `).run(profileId, moveId);
      return { moveId, comment: null, ideaHint: null };
    }

    this.db.prepare(`
      INSERT INTO opening_learning_comments(profile_id, move_id, comment, idea_hint, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, move_id) DO UPDATE SET
        comment = excluded.comment,
        idea_hint = excluded.idea_hint,
        updated_at = excluded.updated_at
    `).run(profileId, moveId, comment, ideaHint, timestamp, timestamp);
    return { moveId, comment: comment || null, ideaHint };
  }

  private assertEditable(repertoireId: string): void {
    if (!this.isEditable(repertoireId)) {
      throw new Error("Built-in repertoires are read-only. Create a personal repertoire to edit lines.");
    }
  }

  private abandonPractice(profileId: string, repertoireId: string, timestamp: string): void {
    this.db.prepare(`
      UPDATE opening_lesson_attempts SET status = 'abandoned', abandoned_at = ?
      WHERE profile_id = ? AND repertoire_id = ? AND status = 'active'
    `).run(timestamp, profileId, repertoireId);
    this.db.prepare(`
      UPDATE opening_review_sessions SET status = 'abandoned', abandoned_at = ?
      WHERE profile_id = ? AND repertoire_id = ? AND status = 'active'
    `).run(timestamp, profileId, repertoireId);
  }

  private isEditable(repertoireId: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM opening_imports WHERE repertoire_id = ?").get(repertoireId));
  }

  private legalMove(fen: string, moveUciValue: string, label: string): { fenAfter: string; san: string } {
    const moveUci = moveUciValue.trim().toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveUci)) throw new Error(`${label} is not valid`);
    const chess = new Chess(fen);
    let played;
    try {
      played = chess.move({
        from: moveUci.slice(0, 2),
        to: moveUci.slice(2, 4),
        ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
      });
    } catch {
      played = null;
    }
    if (!played) throw new Error(`${label} is not legal in this position`);
    return { fenAfter: chess.fen(), san: played.san };
  }

  private lineAtPosition(repertoireId: string, fen: string): { lineId: string; afterPly: number } | null {
    const profileId = ensureActiveProfile(this.db);
    const row = this.db.prepare(`
      SELECT l.id AS line_id, olm.ply AS after_ply
      FROM opening_positions p
      JOIN opening_moves m ON m.to_position_id = p.id AND m.repertoire_id = ? AND m.active = 1
      JOIN opening_line_moves olm ON olm.move_id = m.id
      JOIN opening_lines l ON l.id = olm.line_id AND l.active = 1
      JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
      LEFT JOIN opening_line_preferences preference
        ON preference.line_id = l.id AND preference.profile_id = ?
      WHERE p.position_key = ? AND preference.archived_at IS NULL
      ORDER BY c.sort_order, l.priority, olm.ply
      LIMIT 1
    `).get(repertoireId, profileId, openingPositionKey(fen)) as { line_id: string; after_ply: number } | undefined;
    return row ? { lineId: row.line_id, afterPly: row.after_ply } : null;
  }

  private cloneForEditing(sourceRepertoireId: string): string {
    const source = this.db.prepare(`
      SELECT * FROM opening_repertoires WHERE id = ?
    `).get(sourceRepertoireId) as Record<string, unknown> | undefined;
    if (!source) throw new Error("Opening repertoire is not available");

    const repertoireId = id();
    const timestamp = now();
    const name = `${String(source.name)} — My repertoire`;
    this.db.prepare(`
      INSERT INTO opening_repertoires(
        id, slug, name, learner_color, first_move_uci, first_move_san,
        summary, audience_label, style_json, memory_burden, content_version,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'published', ?, ?)
    `).run(
      repertoireId,
      `personal-${repertoireId}`,
      name,
      source.learner_color,
      source.first_move_uci,
      source.first_move_san,
      source.summary,
      "Personal repertoire",
      source.style_json,
      source.memory_burden,
      timestamp,
      timestamp,
    );
    this.db.prepare(`
      INSERT INTO opening_imports(
        id, repertoire_id, fingerprint, learner_color, source_type, source_title,
        original_pgn, ownership_confirmed, imported_at
      ) VALUES (?, ?, ?, ?, 'self_authored', ?, '', 1, ?)
    `).run(id(), repertoireId, `personal-copy:${repertoireId}`, source.learner_color, `Personal copy of ${String(source.name)}`, timestamp);

    const chapterMap = new Map<string, string>();
    const chapters = this.db.prepare(`
      SELECT * FROM opening_chapters WHERE repertoire_id = ? ORDER BY sort_order
    `).all(sourceRepertoireId) as Array<Record<string, unknown>>;
    for (const chapter of chapters) {
      const chapterId = id();
      chapterMap.set(String(chapter.id), chapterId);
      this.db.prepare(`
        INSERT INTO opening_chapters(
          id, repertoire_id, slug, title, introduction, root_position_id, sort_order, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        chapterId, repertoireId, chapter.slug, chapter.title, chapter.introduction,
        chapter.root_position_id, chapter.sort_order, chapter.active,
      );
    }

    const moveMap = new Map<string, string>();
    const moves = this.db.prepare(`
      SELECT m.*, a.summary, a.changes_json, a.concepts_json, a.opponent_idea,
             a.resulting_plan, a.tactical_warning, a.common_mistake, a.board_annotations_json
      FROM opening_moves m
      JOIN opening_move_annotations a ON a.move_id = m.id
      WHERE m.repertoire_id = ?
    `).all(sourceRepertoireId) as Array<Record<string, unknown>>;
    for (const move of moves) {
      const moveId = id();
      moveMap.set(String(move.id), moveId);
      this.db.prepare(`
        INSERT INTO opening_moves(
          id, repertoire_id, from_position_id, to_position_id, move_uci, move_san,
          role, move_kind, frequency, sort_order, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        moveId, repertoireId, move.from_position_id, move.to_position_id,
        move.move_uci, move.move_san, move.role, move.move_kind,
        move.frequency, move.sort_order, move.active,
      );
      this.db.prepare(`
        INSERT INTO opening_move_annotations(
          move_id, summary, changes_json, concepts_json, opponent_idea,
          resulting_plan, tactical_warning, common_mistake, board_annotations_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        moveId, move.summary, move.changes_json, move.concepts_json, move.opponent_idea,
        move.resulting_plan, move.tactical_warning, move.common_mistake, move.board_annotations_json,
      );
    }

    const lineMap = new Map<string, string>();
    const lines = this.db.prepare(`
      SELECT l.* FROM opening_lines l
      JOIN opening_chapters c ON c.id = l.chapter_id
      WHERE c.repertoire_id = ?
      ORDER BY c.sort_order, l.priority
    `).all(sourceRepertoireId) as Array<Record<string, unknown>>;
    for (const line of lines) {
      const lineId = id();
      lineMap.set(String(line.id), lineId);
      this.db.prepare(`
        INSERT INTO opening_lines(id, chapter_id, slug, title, priority, active)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(lineId, chapterMap.get(String(line.chapter_id)), line.slug, line.title, line.priority, line.active);
    }

    const memberships = this.db.prepare(`
      SELECT olm.line_id, olm.move_id, olm.ply
      FROM opening_line_moves olm
      JOIN opening_lines l ON l.id = olm.line_id
      JOIN opening_chapters c ON c.id = l.chapter_id
      WHERE c.repertoire_id = ?
      ORDER BY olm.line_id, olm.ply
    `).all(sourceRepertoireId) as Array<{ line_id: string; move_id: string; ply: number }>;
    const addMembership = this.db.prepare(`
      INSERT INTO opening_line_moves(line_id, move_id, ply) VALUES (?, ?, ?)
    `);
    for (const membership of memberships) {
      addMembership.run(lineMap.get(membership.line_id), moveMap.get(membership.move_id), membership.ply);
      this.db.prepare(`INSERT INTO opening_line_annotations(line_id, ply, explanation_json)
        SELECT ?, ply, explanation_json FROM opening_line_annotations WHERE line_id = ? AND ply = ?`)
        .run(lineMap.get(membership.line_id), membership.line_id, membership.ply);
    }

    return repertoireId;
  }

  private ensurePosition(fen: string): string {
    const key = openingPositionKey(fen);
    const existing = this.db.prepare("SELECT id FROM opening_positions WHERE position_key = ?")
      .get(key) as { id: string } | undefined;
    if (existing) return existing.id;
    const positionId = id();
    this.db.prepare(`
      INSERT INTO opening_positions(id, position_key, fen, side_to_move) VALUES (?, ?, ?, ?)
    `).run(positionId, key, fen, fen.split(" ")[1] === "b" ? "black" : "white");
    return positionId;
  }

  private touch(repertoireId: string): void {
    this.db.prepare(`
      UPDATE opening_repertoires
      SET content_version = content_version + 1, content_checksum = NULL, updated_at = ?
      WHERE id = ?
    `).run(now(), repertoireId);
  }

  private lines(chapterId: string, profileId: string): OpeningLineDetail[] {
    const lines = this.db.prepare(`
      SELECT line.id, line.title, line.priority, preference.archived_at,
             COALESCE(practice.enabled, 1) AS practice_enabled
      FROM opening_lines line
      LEFT JOIN opening_line_preferences preference
        ON preference.line_id = line.id AND preference.profile_id = ?
      LEFT JOIN opening_line_practice_preferences practice
        ON practice.line_id = line.id AND practice.profile_id = ?
      WHERE line.chapter_id = ? AND line.active = 1
      ORDER BY CASE WHEN preference.archived_at IS NULL THEN 0 ELSE 1 END, line.priority, line.title
    `).all(profileId, profileId, chapterId) as LineRow[];
    return lines.map((line) => {
      const moves = this.moves(line.id, profileId);
      return {
        id: line.id,
        title: line.title,
        priority: line.priority,
        moveCount: moves.length,
        learnerDecisionCount: moves.filter((move) => move.role === "learner").length,
        sanSequence: formatSanSequence(moves),
        archived: line.archived_at !== null,
        practiceEnabled: line.practice_enabled !== 0,
        moves,
      };
    });
  }

  private moves(lineId: string, profileId: string): OpeningLineMove[] {
    const rows = this.db.prepare(`
      SELECT m.id, olm.ply, m.move_uci, m.move_san, m.role, m.move_kind,
             before.fen AS fen_before, after.fen AS fen_after,
             a.summary, a.changes_json, a.concepts_json, a.opponent_idea,
             a.resulting_plan, a.tactical_warning, a.common_mistake, a.board_annotations_json,
             NULLIF(lc.comment, '') AS personal_comment, lc.idea_hint, context.explanation_json AS source_explanation_json
      FROM opening_line_moves olm
      JOIN opening_moves m ON m.id = olm.move_id AND m.active = 1
      JOIN opening_positions before ON before.id = m.from_position_id
      JOIN opening_positions after ON after.id = m.to_position_id
      JOIN opening_move_annotations a ON a.move_id = m.id
      LEFT JOIN opening_line_annotations context ON context.line_id = olm.line_id AND context.ply = olm.ply
      LEFT JOIN opening_learning_comments lc ON lc.move_id = m.id AND lc.profile_id = ?
      WHERE olm.line_id = ?
      ORDER BY olm.ply
    `).all(profileId, lineId) as MoveRow[];
    return rows.map((row) => {
      const source = row.source_explanation_json ? JSON.parse(row.source_explanation_json) as MoveExplanation : null;
      const personal = row.concepts_json.includes('"personal_explanation"');
      return {
        id: row.id,
        ply: row.ply,
        moveUci: row.move_uci,
        moveSan: row.move_san,
        role: row.role,
        moveKind: row.move_kind,
        fenBefore: row.fen_before,
        fenAfter: row.fen_after,
        explanation: {
          summary: row.summary,
          changes: JSON.parse(row.changes_json) as string[],
          concepts: JSON.parse(row.concepts_json) as string[],
          opponentIdea: row.opponent_idea,
          resultingPlan: row.resulting_plan,
          tacticalWarning: row.tactical_warning,
          commonMistake: row.common_mistake,
          personalComment: row.personal_comment,
          ideaHint: row.idea_hint,
          boardAnnotations: JSON.parse(row.board_annotations_json),
          ...(source && !personal ? { summary: source.summary, changes: [...source.changes],
            concepts: [...source.concepts], opponentIdea: source.opponentIdea ?? null,
            resultingPlan: source.resultingPlan ?? null, tacticalWarning: source.tacticalWarning ?? null,
            commonMistake: source.commonMistake ?? null, boardAnnotations: source.boardAnnotations ?? [] } : {}),
          ...(source && personal ? { sourceSummary: source.summary, boardAnnotations: source.boardAnnotations ?? [] } : {}),
        },
      };
    });
  }
}

function formatSanSequence(moves: OpeningLineMove[]): string {
  const parts: string[] = [];
  for (const move of moves) {
    if (move.ply % 2 === 1) parts.push(`${Math.ceil(move.ply / 2)}. ${move.moveSan}`);
    else parts.push(move.moveSan);
  }
  return parts.join(" ");
}
