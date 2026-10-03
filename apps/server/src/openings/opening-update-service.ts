import { createHash } from "node:crypto";

import type { Color, OpeningUpdatePreviewResponse, OpeningUpdateResponse } from "../../../../packages/contracts/src/api.js";
import { splitPgnGames } from "../chess/pgn.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { compileOpeningCurriculum, type CompiledOpeningCurriculum, type MoveExplanation } from "./opening-content.js";
import { buildImportedCurriculum, openingPgnChapterSourceKey, parseOpeningPgn } from "./opening-pgn-import.js";
import { OpeningLichessImportService, resolveLichessStudyUrl } from "./opening-lichess-import.js";
import { sourceExplanation, storeSourceExplanations } from "./opening-context.js";

interface SourceRow {
  id: string;
  name: string;
  learner_color: Color;
  first_move_uci: string;
  original_pgn: string;
  source_title: string;
  source_author: string | null;
}

interface StoredLine {
  id: string;
  chapter_id: string;
  sequence: string;
}

interface UpdatePlan {
  changed: boolean;
  compiled: CompiledOpeningCurriculum;
  chapterKeys: Array<{ sourceKey: string; chapterId: string }>;
  lineTargets: Map<string, { id: string; existing: boolean; extended: boolean }>;
  preview: Omit<OpeningUpdatePreviewResponse, "previewId">;
}

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function annotationValues(explanation: MoveExplanation): Array<string | null> {
  return [explanation.summary, JSON.stringify(explanation.changes), JSON.stringify(explanation.concepts),
    explanation.opponentIdea ?? null, explanation.resultingPlan ?? null,
    explanation.tacticalWarning ?? null, explanation.commonMistake ?? null];
}

/** Non-destructive source refresh. Never replaces the repertoire or its review cards. */
export class OpeningUpdateService {
  constructor(private readonly db: SqliteDatabase, private readonly lichess: OpeningLichessImportService) {}

  async preview(repertoireId: string, input: { pgn?: string; studyUrl?: string }): Promise<OpeningUpdatePreviewResponse> {
    let source = this.source(repertoireId);
    let pgn = input.pgn;
    let sourceUrl: string | null = null;
    if (input.studyUrl) {
      sourceUrl = resolveLichessStudyUrl(input.studyUrl).canonicalUrl;
      if (source.source_title.startsWith("https://lichess.org/study/")) {
        if (resolveLichessStudyUrl(source.source_title).studyId !== resolveLichessStudyUrl(sourceUrl).studyId) {
          throw new Error("This is a different Lichess Study. Import it separately instead of updating this repertoire.");
        }
      }
      pgn = await this.lichess.downloadStudy(sourceUrl);
      // A full-study refresh must not silently add previously unselected chapters.
      const keys = new Set(this.chapterIdentities(source).keys());
      const selected = splitPgnGames(pgn).filter(chunk => keys.has(openingPgnChapterSourceKey(chunk)));
      if (selected.length === 0) throw new Error("No previously imported chapters were found in this study. Use a chapter link or paste the updated chapter PGN.");
      pgn = selected.join("\n\n");
    }
    if (typeof pgn !== "string" || !pgn.trim()) throw new Error("Paste the updated opening PGN or enter its Lichess Study link");
    if (Buffer.byteLength(pgn, "utf8") > 5 * 1024 * 1024) throw new Error("Opening PGN must be smaller than 5 MB");
    source = this.source(repertoireId);
    const plan = this.plan(source, pgn);
    const previewId = id();
    this.db.prepare("DELETE FROM opening_update_previews WHERE expires_at < ?").run(now());
    this.db.prepare(`
      INSERT INTO opening_update_previews(id, repertoire_id, original_pgn, source_url, base_checksum, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(previewId, repertoireId, pgn, sourceUrl, this.revision(repertoireId), new Date(Date.now() + 30 * 60_000).toISOString());
    return { ...plan.preview, previewId };
  }

  apply(repertoireId: string, previewId: string, ownershipConfirmed: boolean): OpeningUpdateResponse {
    if (!ownershipConfirmed) throw new Error("Confirm that you own or have permission to use this material before updating");
    return this.db.transaction(() => {
      const preview = this.db.prepare(`SELECT * FROM opening_update_previews WHERE id = ? AND repertoire_id = ?`)
        .get(previewId, repertoireId) as { original_pgn: string; source_url: string | null; base_checksum: string; expires_at: string; result_json: string | null } | undefined;
      if (!preview) throw new Error("This update preview is not available. Preview the source again.");
      if (preview.result_json) return JSON.parse(preview.result_json) as OpeningUpdateResponse;
      if (preview.expires_at < now()) throw new Error("This update preview expired. Preview the source again.");
      if (preview.base_checksum !== this.revision(repertoireId)) {
        throw new Error("The repertoire changed after this preview. Preview again before updating.");
      }
      const source = this.source(repertoireId);
      const plan = this.plan(source, preview.original_pgn);
      if (plan.changed) this.persist(plan);
      else this.persistChapterIdentities(repertoireId, plan.chapterKeys);
      const timestamp = now();
      this.db.prepare(`UPDATE opening_imports SET original_pgn = ?, source_title = ?, source_updated_at = ? WHERE repertoire_id = ?`)
        .run(preview.original_pgn, preview.source_url ?? source.source_title, timestamp, repertoireId);
      if (plan.changed) this.db.prepare(`UPDATE opening_repertoires SET content_version = content_version + 1, content_checksum = NULL, updated_at = ? WHERE id = ?`)
        .run(timestamp, repertoireId);
      // Keep historical attempts/results, but don't continue a session against a changed line.
      for (const table of plan.changed ? ["opening_review_sessions", "opening_lesson_attempts"] : []) {
        this.db.prepare(`UPDATE ${table} SET status = 'abandoned', abandoned_at = ? WHERE repertoire_id = ? AND status = 'active'`)
          .run(timestamp, repertoireId);
      }
      const result: OpeningUpdateResponse = {
        repertoireId, sourceUpdatedAt: timestamp,
        message: plan.changed
          ? `Repertoire updated: ${plan.preview.addedLines} new lines, ${plan.preview.extendedLines} extended lines and ${plan.preview.updatedNotes} refreshed notes. Existing progress and personal notes were kept.`
          : "Your repertoire already matches these source lines and notes. Nothing was changed; your practice session can continue.",
      };
      this.db.prepare("UPDATE opening_update_previews SET result_json = ? WHERE id = ?").run(JSON.stringify(result), previewId);
      return result;
    })();
  }

  private source(repertoireId: string): SourceRow {
    const row = this.db.prepare(`
      SELECT r.id, r.name, r.learner_color, r.first_move_uci, oi.original_pgn, oi.source_title, oi.source_author
      FROM opening_repertoires r JOIN opening_imports oi ON oi.repertoire_id = r.id WHERE r.id = ?
    `).get(repertoireId) as SourceRow | undefined;
    if (!row) throw new Error("Only private imported repertoires can be updated from a source");
    return row;
  }

  private revision(repertoireId: string): string {
    // Reviews and personal comments may change without invalidating a source preview.
    return checksum([
      this.source(repertoireId),
      this.db.prepare("SELECT * FROM opening_chapters WHERE repertoire_id = ? ORDER BY id").all(repertoireId),
      this.db.prepare(`SELECT l.*, lm.ply, lm.move_id FROM opening_lines l JOIN opening_chapters c ON c.id = l.chapter_id
        LEFT JOIN opening_line_moves lm ON lm.line_id = l.id WHERE c.repertoire_id = ? ORDER BY l.id, lm.ply`).all(repertoireId),
      this.db.prepare(`SELECT m.*, a.* FROM opening_moves m LEFT JOIN opening_move_annotations a ON a.move_id = m.id
        WHERE m.repertoire_id = ? ORDER BY m.id`).all(repertoireId),
      this.db.prepare(`SELECT a.* FROM opening_line_annotations a JOIN opening_lines l ON l.id = a.line_id
        JOIN opening_chapters c ON c.id = l.chapter_id WHERE c.repertoire_id = ? ORDER BY a.line_id, a.ply`).all(repertoireId),
    ]);
  }

  private chapterIdentities(source: SourceRow): Map<string, string> {
    const identities = new Map((this.db.prepare("SELECT source_key, chapter_id FROM opening_import_chapters WHERE repertoire_id = ?")
      .all(source.id) as Array<{ source_key: string; chapter_id: string }>).map(row => [row.source_key, row.chapter_id]));
    // Backwards compatibility for imports made before source identities were recorded.
    const chapters = this.db.prepare("SELECT id, title FROM opening_chapters WHERE repertoire_id = ? ORDER BY sort_order")
      .all(source.id) as Array<{ id: string; title: string }>;
    for (const chunk of splitPgnGames(source.original_pgn)) {
      try {
        const chapter = parseOpeningPgn(chunk).chapters[0]!;
        const matches = chapters.filter(stored => stored.title === chapter.title);
        if (!identities.has(chapter.sourceKey) && matches.length === 1) identities.set(chapter.sourceKey, matches[0]!.id);
      } catch { /* Legacy builder snapshots or text-only chapters have no source identity. */ }
    }
    return identities;
  }

  private storedLines(repertoireId: string): StoredLine[] {
    const rows = this.db.prepare(`
      SELECT l.id, l.chapter_id, m.move_uci FROM opening_lines l
      JOIN opening_chapters c ON c.id = l.chapter_id
      JOIN opening_line_moves lm ON lm.line_id = l.id JOIN opening_moves m ON m.id = lm.move_id
      WHERE c.repertoire_id = ? AND c.active = 1 AND l.active = 1 ORDER BY l.id, lm.ply
    `).all(repertoireId) as Array<{ id: string; chapter_id: string; move_uci: string }>;
    const lines = new Map<string, StoredLine>();
    for (const row of rows) {
      const line = lines.get(row.id) ?? { id: row.id, chapter_id: row.chapter_id, sequence: "" };
      line.sequence = `${line.sequence} ${row.move_uci}`.trim();
      lines.set(row.id, line);
    }
    return [...lines.values()];
  }

  private plan(source: SourceRow, pgn: string): UpdatePlan {
    const parsed = parseOpeningPgn(pgn);
    if (parsed.firstMoveUci !== source.first_move_uci) throw new Error("This PGN starts with a different opening. Import it as a separate repertoire.");
    const curriculum = buildImportedCurriculum(parsed, source.learner_color, source.name, source.source_title, source.source_author, false);
    curriculum.id = source.id;
    const compiled = compileOpeningCurriculum(curriculum);
    const identities = this.chapterIdentities(source);
    const stored = this.storedLines(source.id);
    const oldSourceSequences = new Set<string>();
    const oldMainSequences = new Map<string, string>();
    for (const chunk of splitPgnGames(source.original_pgn)) {
      try {
        const old = parseOpeningPgn(chunk).chapters[0]!;
        const chapterId = identities.get(old.sourceKey);
        if (chapterId) oldMainSequences.set(chapterId, old.lines[0]!.moves.map(move => move.uci).join(" "));
        for (const line of old.lines) oldSourceSequences.add(`${identities.get(old.sourceKey)}|${line.moves.map(move => move.uci).join(" ")}`);
      } catch { /* Ignore non-opening legacy chapters. */ }
    }
    const chapterKeys: UpdatePlan["chapterKeys"] = [];
    const lineTargets: UpdatePlan["lineTargets"] = new Map();
    const used = new Set<string>();
    let addedLines = 0;
    let extendedLines = 0;
    compiled.chapters.forEach((chapter, chapterIndex) => {
      const sourceKey = parsed.chapters[chapterIndex]!.sourceKey;
      chapter.id = identities.get(sourceKey) ?? `${source.id}:source-${checksum(sourceKey).slice(0, 16)}`;
      chapter.slug = chapter.id.slice(source.id.length + 1);
      chapterKeys.push({ sourceKey, chapterId: chapter.id });
      // Match all exact paths first so an extension cannot steal another incoming line.
      const sequences = parsed.chapters[chapterIndex]!.lines.map(line => line.moves.map(move => move.uci).join(" "));
      chapter.lines.forEach((line, lineIndex) => {
        const sequence = sequences[lineIndex]!;
        const exact = stored.find(candidate => candidate.chapter_id === chapter.id && candidate.sequence === sequence && !used.has(candidate.id));
        if (exact) { lineTargets.set(line.id, { id: exact.id, existing: true, extended: false }); used.add(exact.id); }
      });
      chapter.lines.forEach((line, lineIndex) => {
        if (lineTargets.has(line.id)) return;
        const sequence = parsed.chapters[chapterIndex]!.lines[lineIndex]!.moves.map(move => move.uci).join(" ");
        const prefixes = stored.filter(candidate => candidate.chapter_id === chapter.id && !used.has(candidate.id)
          && sequence.startsWith(`${candidate.sequence} `) && oldSourceSequences.has(`${chapter.id}|${candidate.sequence}`)
          && (sequences.filter(incoming => incoming.startsWith(`${candidate.sequence} `)).length === 1
            || (lineIndex === 0 && oldMainSequences.get(chapter.id) === candidate.sequence)));
        const extended = prefixes.length === 1 ? prefixes[0] : undefined;
        if (extended) { extendedLines += 1; used.add(extended.id); }
        else addedLines += 1;
        lineTargets.set(line.id, { id: extended?.id ?? `${chapter.id}:source-${checksum(sequence).slice(0, 16)}`, existing: Boolean(extended), extended: Boolean(extended) });
      });
    });
    let addedMoves = 0;
    const changedNoteMoves = new Set<string>();
    const positionsById = new Map(compiled.positions.map(position => [position.id, position]));
    for (const move of compiled.moves) {
      const position = positionsById.get(move.fromPositionId)!;
      const existing = this.db.prepare(`SELECT m.id, a.* FROM opening_moves m JOIN opening_positions p ON p.id = m.from_position_id
        JOIN opening_move_annotations a ON a.move_id = m.id WHERE m.repertoire_id = ? AND p.position_key = ? AND m.move_uci = ?`)
        .get(source.id, position.key, move.moveUci) as Record<string, string | null> | undefined;
      if (!existing) addedMoves += 1;
      else if (this.shouldUpdateNote(existing, move.explanation)
        || String(existing.board_annotations_json ?? "[]") !== JSON.stringify(move.explanation.boardAnnotations ?? [])) changedNoteMoves.add(move.id);
    }
    const retainedLines = stored.filter(line => !used.has(line.id)).length;
    for (const chapter of compiled.chapters) for (const line of chapter.lines) {
      const target = lineTargets.get(line.id)!;
      if (!target.existing) continue;
      line.explanations.forEach((explanation, index) => {
        if (!this.db.prepare("SELECT 1 FROM opening_line_moves WHERE line_id = ? AND ply = ?").get(target.id, index + 1)) return;
        if (JSON.stringify(sourceExplanation(this.db, target.id, index + 1)) !== JSON.stringify(explanation)) changedNoteMoves.add(line.moveIds[index]!);
      });
    }
    const chapterChanged = compiled.chapters.some(chapter => {
      const storedChapter = this.db.prepare("SELECT title, introduction FROM opening_chapters WHERE id = ?").get(chapter.id) as { title: string; introduction: string } | undefined;
      return !storedChapter || storedChapter.title !== chapter.title || storedChapter.introduction !== chapter.introduction;
    });
    const updatedNotes = changedNoteMoves.size;
    const changed = chapterChanged || addedLines + extendedLines + addedMoves + updatedNotes > 0;
    return { changed, compiled, chapterKeys, lineTargets, preview: {
      repertoireId: source.id, addedLines, extendedLines, retainedLines, updatedNotes, addedMoves,
      chapters: parsed.chapters.map(chapter => ({ title: chapter.title, lineCount: chapter.lines.length })),
      warnings: [
        "Existing learning progress, personal notes and archived lines are kept.",
        "Lines absent from this source are kept, not deleted. You can archive them afterwards.",
        changed ? "Any current practice session for this repertoire will end; its recorded results are kept." : "These source lines and notes are already up to date. Practice can continue.",
        "Lichess refreshes only previously imported chapters. Import other chapters separately.",
      ],
    } };
  }

  private shouldUpdateNote(stored: Record<string, string | null>, explanation: MoveExplanation): boolean {
    if (String(stored.concepts_json).includes('"personal_explanation"')) return false;
    if (!explanation.concepts.includes("imported_note") && !String(stored.concepts_json).includes('"imported_note"')) return false;
    return JSON.stringify([stored.summary, stored.changes_json, stored.concepts_json, stored.opponent_idea,
      stored.resulting_plan, stored.tactical_warning, stored.common_mistake]) !== JSON.stringify(annotationValues(explanation));
  }

  private persist(plan: UpdatePlan): void {
    const { compiled } = plan;
    const repertoireId = compiled.curriculum.id;
    const positionIds = new Map<string, string>();
    for (const position of compiled.positions) {
      const existing = this.db.prepare("SELECT id FROM opening_positions WHERE position_key = ?").pluck().get(position.key) as string | undefined;
      if (!existing) this.db.prepare("INSERT INTO opening_positions(id, position_key, fen, side_to_move) VALUES (?, ?, ?, ?)")
        .run(position.id, position.key, position.fen, position.sideToMove);
      positionIds.set(position.id, existing ?? position.id);
    }
    const moveIds = new Map<string, string>();
    for (const move of compiled.moves) {
      const fromId = positionIds.get(move.fromPositionId)!;
      const existing = this.db.prepare(`SELECT m.id, a.* FROM opening_moves m LEFT JOIN opening_move_annotations a ON a.move_id = m.id
        WHERE m.repertoire_id = ? AND m.from_position_id = ? AND m.move_uci = ?`).get(repertoireId, fromId, move.moveUci) as Record<string, string | null> | undefined;
      const moveId = existing?.id ?? move.id;
      moveIds.set(move.id, moveId);
      if (!existing) this.db.prepare(`INSERT INTO opening_moves(id, repertoire_id, from_position_id, to_position_id,
        move_uci, move_san, role, move_kind, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`)
        .run(moveId, repertoireId, fromId, positionIds.get(move.toPositionId)!, move.moveUci, move.san, move.role, move.kind);
      else this.db.prepare("UPDATE opening_moves SET active = 1 WHERE id = ? AND active = 0").run(moveId);
      if (!existing || this.shouldUpdateNote(existing, move.explanation)) {
        this.db.prepare(`INSERT INTO opening_move_annotations(move_id, summary, changes_json, concepts_json, opponent_idea,
          resulting_plan, tactical_warning, common_mistake) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(move_id) DO UPDATE SET summary = excluded.summary, changes_json = excluded.changes_json,
          concepts_json = excluded.concepts_json, opponent_idea = excluded.opponent_idea, resulting_plan = excluded.resulting_plan,
          tactical_warning = excluded.tactical_warning, common_mistake = excluded.common_mistake`)
          .run(moveId, ...annotationValues(move.explanation));
      }
      this.db.prepare("UPDATE opening_move_annotations SET board_annotations_json = ? WHERE move_id = ?")
        .run(JSON.stringify(move.explanation.boardAnnotations ?? []), moveId);
    }
    compiled.chapters.forEach((chapter, index) => {
      this.db.prepare(`INSERT INTO opening_chapters(id, repertoire_id, slug, title, introduction, root_position_id, sort_order, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET title = excluded.title, introduction = excluded.introduction`)
        .run(chapter.id, repertoireId, chapter.slug, chapter.title, chapter.introduction, positionIds.get(chapter.rootPositionId)!, index);
      for (const line of chapter.lines) {
        const target = plan.lineTargets.get(line.id)!;
        if (!target.existing) this.db.prepare("INSERT INTO opening_lines(id, chapter_id, slug, title, priority, active) VALUES (?, ?, ?, ?, ?, 1)")
          .run(target.id, chapter.id, target.id.slice(chapter.id.length + 1), line.title, line.priority);
        if (!target.existing || target.extended) {
          this.db.prepare("DELETE FROM opening_line_moves WHERE line_id = ?").run(target.id);
          line.moveIds.forEach((moveId, ply) => this.db.prepare("INSERT INTO opening_line_moves(line_id, move_id, ply) VALUES (?, ?, ?)")
            .run(target.id, moveIds.get(moveId)!, ply + 1));
        }
        storeSourceExplanations(this.db, target.id, line.explanations);
      }
    });
    this.persistChapterIdentities(repertoireId, plan.chapterKeys);
  }

  private persistChapterIdentities(repertoireId: string, chapters: UpdatePlan["chapterKeys"]): void {
    for (const chapter of chapters) this.db.prepare(`INSERT INTO opening_import_chapters(repertoire_id, source_key, chapter_id)
      VALUES (?, ?, ?) ON CONFLICT(repertoire_id, source_key) DO UPDATE SET chapter_id = excluded.chapter_id`)
      .run(repertoireId, chapter.sourceKey, chapter.chapterId);
  }
}
