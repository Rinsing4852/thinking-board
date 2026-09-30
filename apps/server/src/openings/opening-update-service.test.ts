import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Database } from "../db/database.js";
import { OpeningContentService } from "./opening-content-service.js";
import { OpeningLichessImportService } from "./opening-lichess-import.js";
import { OpeningPgnImportService } from "./opening-pgn-import.js";
import { OpeningUpdateService } from "./opening-update-service.js";
import { OpeningWorkspaceService } from "./opening-workspace-service.js";
import { OpeningReviewService } from "./opening-review-service.js";
import { STARTER_OPENING_CURRICULA } from "./starter-curricula.js";

const PGN = `[Event "Italian notes"]
[ChapterName "Italian"]
[ChapterURL "https://lichess.org/study/abcdefgh/ABCDEFGH"]
[Result "*"]

1. e4 {Control the centre.} e5 2. Nf3 Nc6 (2... Nf6 3. Nxe5) 3. Bc4 *`;
const UPDATED = PGN.replace("Control the centre.", "Occupy the centre and open the bishop.")
  .replace("3. Bc4 *", "3. Bc4 Bc5 (3... Nf6 4. Ng5) 4. c3 *");
const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function setup(pgn = PGN, selectedChapterIndexes?: number[]) {
  const database = new Database(":memory:", path.resolve("migrations"));
  databases.push(database);
  const db = database.connection;
  const content = new OpeningContentService(db);
  const importer = new OpeningPgnImportService(db, content);
  const repertoireId = importer.import({ pgn, learnerColor: "white", ownershipConfirmed: true, selectedChapterIndexes }).repertoireIds[0]!;
  const fetcher = vi.fn(async () => new Response(UPDATED));
  const lichess = new OpeningLichessImportService(importer, "test-private-token", fetcher as typeof fetch);
  return { db, content, importer, repertoireId, fetcher, updates: new OpeningUpdateService(db, lichess), workspace: new OpeningWorkspaceService(db) };
}

describe("opening source updates", () => {
  it("merges nested variations, extends a source line and preserves cards, notes, names and archives", async () => {
    const { db, content, repertoireId, updates, workspace } = setup();
    const detail = workspace.repertoire(repertoireId);
    const main = detail.chapters[0]!.lines[0]!;
    const fork = detail.chapters[0]!.lines[1]!;
    workspace.renameRepertoire(repertoireId, "My personal name");
    workspace.updateLineMetadata(repertoireId, main.id, { title: "My main line" });
    workspace.setLineArchived(repertoireId, fork.id, true);
    workspace.updateLearningComment(repertoireId, main.moves[0]!.id, "My personal explanation.");
    const reviews = new OpeningReviewService(db);
    reviews.start(repertoireId, "new", 3);
    db.prepare(`UPDATE opening_review_items SET state = 2, repetitions = 7, stability = 14, due_at = '2030-01-01T00:00:00.000Z' WHERE repertoire_id = ?`).run(repertoireId);
    const cards = db.prepare("SELECT * FROM opening_review_items WHERE repertoire_id = ? ORDER BY id").all(repertoireId);
    const preview = await updates.preview(repertoireId, { pgn: UPDATED });
    expect(preview).toMatchObject({ addedLines: 1, extendedLines: 1, updatedNotes: 1, retainedLines: 0 });
    const result = updates.apply(repertoireId, preview.previewId, true);
    expect(updates.apply(repertoireId, preview.previewId, true)).toEqual(result);
    expect(db.prepare("SELECT * FROM opening_review_items WHERE repertoire_id = ? ORDER BY id").all(repertoireId)).toEqual(cards);
    const updated = workspace.repertoire(repertoireId);
    expect(updated.repertoire.name).toBe("My personal name");
    const lines = updated.chapters.flatMap(chapter => chapter.lines);
    expect(lines).toHaveLength(3);
    expect(lines.find(line => line.id === fork.id)?.archived).toBe(true);
    const updatedMain = lines.find(line => line.id === main.id)!;
    expect(updatedMain.title).toBe("My main line");
    expect(updatedMain.moves).toHaveLength(7);
    expect(updatedMain.moves[0]!.id).toBe(main.moves[0]!.id);
    expect(updatedMain.moves[0]!.explanation.personalComment).toBe("My personal explanation.");
    expect(updatedMain.moves[0]!.explanation.summary).toBe("Occupy the centre and open the bishop.");
    expect(content.catalog().repertoires).toHaveLength(1);
    expect(content.catalog().repertoires[0]!.sourceUpdatedAt).toBe(result.sourceUpdatedAt);
    expect(db.prepare("SELECT status FROM opening_review_sessions").pluck().get()).toBe("abandoned");
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it("updates comments alone without duplicating or renumbering lines", async () => {
    const { repertoireId, updates, workspace } = setup();
    const before = workspace.repertoire(repertoireId);
    const preview = await updates.preview(repertoireId, { pgn: PGN.replace("Control the centre.", "New source explanation.") });
    expect(preview).toMatchObject({ addedLines: 0, extendedLines: 0, addedMoves: 0, updatedNotes: 1 });
    updates.apply(repertoireId, preview.previewId, true);
    const after = workspace.repertoire(repertoireId);
    expect(after.chapters[0]!.lines.map(line => line.id)).toEqual(before.chapters[0]!.lines.map(line => line.id));
    expect(after.chapters[0]!.lines[0]!.moves[0]!.explanation.summary).toBe("New source explanation.");
    const repeated = await updates.preview(repertoireId, { pgn: PGN.replace("Control the centre.", "New source explanation.") });
    expect(repeated).toMatchObject({ addedLines: 0, addedMoves: 0, updatedNotes: 0 });
  });

  it("keeps absent lines and local branches instead of deleting them", async () => {
    const { repertoireId, updates, workspace } = setup();
    const original = workspace.repertoire(repertoireId).chapters[0]!.lines;
    workspace.addMove({ repertoireId, lineId: original[0]!.id, afterPly: 5, moveUci: "g8f6" });
    const preview = await updates.preview(repertoireId, { pgn: PGN.replace(" (2... Nf6 3. Nxe5)", "") });
    expect(preview.retainedLines).toBe(2);
    updates.apply(repertoireId, preview.previewId, true);
    expect(workspace.repertoire(repertoireId).chapters[0]!.lines).toHaveLength(3);
  });

  it("refreshes only selected study chapters, using private auth and the previewed snapshot", async () => {
    const unselected = `[Event "Other chapter"]\n[ChapterName "Other"]\n[ChapterURL "https://lichess.org/study/abcdefgh/12345678"]\n[Result "*"]\n\n1. d4 d5 *`;
    const { repertoireId, updates, fetcher, workspace } = setup(`${PGN}\n\n${unselected}`, [0]);
    // An unselected custom-position chapter must not prevent refreshing our opening.
    fetcher.mockResolvedValueOnce(new Response(`${unselected.replace('[Result "*"]', '[Result "*"]\n[SetUp "1"]')}\n\n${UPDATED}`));
    const preview = await updates.preview(repertoireId, { studyUrl: "https://lichess.org/study/abcdefgh" });
    expect(preview.chapters).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("variations=true"), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-private-token" }),
    }));
    updates.apply(repertoireId, preview.previewId, true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(workspace.repertoire(repertoireId).chapters).toHaveLength(1);
  });

  it("supports legacy imports and chapter rename/reorder through stable source chapter IDs", async () => {
    const { db, repertoireId, updates, workspace } = setup();
    db.prepare("DELETE FROM opening_import_chapters").run();
    const chapterId = workspace.repertoire(repertoireId).chapters[0]!.id;
    const first = await updates.preview(repertoireId, { pgn: UPDATED.replace('[ChapterName "Italian"]', '[ChapterName "Renamed chapter"]') });
    updates.apply(repertoireId, first.previewId, true);
    expect(workspace.repertoire(repertoireId).chapters[0]!.id).toBe(chapterId);
    const again = await updates.preview(repertoireId, { pgn: UPDATED.replace('[ChapterName "Italian"]', '[ChapterName "Renamed again"]') });
    updates.apply(repertoireId, again.previewId, true);
    expect(workspace.repertoire(repertoireId).chapters).toHaveLength(1);
    expect(workspace.repertoire(repertoireId).chapters[0]!.id).toBe(chapterId);
  });

  it("reuses workspace-created move IDs and positions without breaking references", async () => {
    const { repertoireId, updates, workspace, db } = setup();
    const main = workspace.repertoire(repertoireId).chapters[0]!.lines[0]!;
    const extended = workspace.addMove({ repertoireId, lineId: main.id, afterPly: 5, moveUci: "f8c5" });
    workspace.updateLearningComment(repertoireId, extended.moveId, "Local note on the bishop.");
    const preview = await updates.preview(repertoireId, { pgn: UPDATED });
    updates.apply(repertoireId, preview.previewId, true);
    expect(db.prepare("SELECT COUNT(*) FROM opening_moves WHERE repertoire_id = ? AND move_uci = 'f8c5'").pluck().get(repertoireId)).toBe(1);
    expect(workspace.repertoire(repertoireId).chapters[0]!.lines.flatMap(line => line.moves)
      .find(move => move.id === extended.moveId)?.explanation.personalComment).toBe("Local note on the bishop.");
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it("rejects stale, expired, wrong-target and unconfirmed previews without changing the graph", async () => {
    const { db, repertoireId, updates, workspace } = setup();
    const preview = await updates.preview(repertoireId, { pgn: UPDATED });
    expect(() => updates.apply(repertoireId, preview.previewId, false)).toThrow(/permission/);
    expect(() => updates.apply("wrong-repertoire", preview.previewId, true)).toThrow(/not available/);
    const main = workspace.repertoire(repertoireId).chapters[0]!.lines[0]!;
    workspace.updateLineMetadata(repertoireId, main.id, { title: "Changed while previewing" });
    expect(() => updates.apply(repertoireId, preview.previewId, true)).toThrow(/changed after/);
    const second = await updates.preview(repertoireId, { pgn: UPDATED });
    db.prepare("UPDATE opening_update_previews SET expires_at = '2000-01-01' WHERE id = ?").run(second.previewId);
    expect(() => updates.apply(repertoireId, second.previewId, true)).toThrow(/expired/);
    expect(workspace.repertoire(repertoireId).chapters[0]!.lines).toHaveLength(2);
  });

  it("allows personal notes after preview, but rejects a different opening or study", async () => {
    const { db, repertoireId, updates, workspace } = setup();
    const preview = await updates.preview(repertoireId, { pgn: UPDATED });
    const move = workspace.repertoire(repertoireId).chapters[0]!.lines[0]!.moves[0]!;
    workspace.updateLearningComment(repertoireId, move.id, "Written after preview");
    expect(() => updates.apply(repertoireId, preview.previewId, true)).not.toThrow();
    await expect(updates.preview(repertoireId, { pgn: '[Event "Wrong"]\n\n1. d4 d5 *' })).rejects.toThrow(/different opening/);
    db.prepare("UPDATE opening_imports SET source_title = 'https://lichess.org/study/abcdefgh' WHERE repertoire_id = ?").run(repertoireId);
    await expect(updates.preview(repertoireId, { studyUrl: "https://lichess.org/study/ijklmnop" })).rejects.toThrow(/different Lichess Study/);
  });

  it("refuses built-in updates and rolls back a failed merge completely", async () => {
    const { db, content, repertoireId, updates } = setup();
    content.sync(STARTER_OPENING_CURRICULA);
    await expect(updates.preview(STARTER_OPENING_CURRICULA[0]!.id, { pgn: UPDATED })).rejects.toThrow(/Only private imported/);
    const preview = await updates.preview(repertoireId, { pgn: UPDATED });
    const movesBefore = db.prepare("SELECT * FROM opening_moves ORDER BY id").all();
    db.exec("CREATE TRIGGER reject_update_line BEFORE INSERT ON opening_lines BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    expect(() => updates.apply(repertoireId, preview.previewId, true)).toThrow(/test failure/);
    expect(db.prepare("SELECT * FROM opening_moves ORDER BY id").all()).toEqual(movesBefore);
    expect(db.prepare("SELECT source_updated_at FROM opening_imports WHERE repertoire_id = ?").pluck().get(repertoireId)).toBeNull();
  });

  it("keeps a running session and graph revision unchanged when the source is unchanged", async () => {
    const { db, repertoireId, updates } = setup();
    new OpeningReviewService(db).start(repertoireId, "new", 3);
    const revision = db.prepare("SELECT revision FROM opening_match_revision").pluck().get();
    const preview = await updates.preview(repertoireId, { pgn: PGN });
    expect(updates.apply(repertoireId, preview.previewId, true).message).toMatch(/already matches/);
    expect(db.prepare("SELECT status FROM opening_review_sessions").pluck().get()).toBe("active");
    expect(db.prepare("SELECT revision FROM opening_match_revision").pluck().get()).toBe(revision);
  });

  it("does not duplicate chapters when a full study is reordered and renamed", async () => {
    const second = '[Event "Sicilian"]\n[ChapterName "Sicilian"]\n[ChapterURL "https://lichess.org/study/abcdefgh/12345678"]\n[Result "*"]\n\n1. e4 c5 2. Nf3 *';
    const { repertoireId, updates, fetcher, workspace } = setup(`${PGN}\n\n${second}`);
    const ids = workspace.repertoire(repertoireId).chapters.map(chapter => chapter.id).sort();
    fetcher.mockResolvedValueOnce(new Response(`${second}\n\n${PGN.replace('[ChapterName "Italian"]', '[ChapterName "New Italian title"]')}`));
    const preview = await updates.preview(repertoireId, { studyUrl: "https://lichess.org/study/abcdefgh" });
    expect(preview.addedLines).toBe(0);
    updates.apply(repertoireId, preview.previewId, true);
    expect(workspace.repertoire(repertoireId).chapters.map(chapter => chapter.id).sort()).toEqual(ids);
  });

  it("does not count drawing-only PGN comments as explanations", async () => {
    const { importer, repertoireId, updates, workspace } = setup(PGN.replace("Control the centre.", "[%csl Gc7]"));
    expect(importer.preview({ pgn: PGN.replace("Control the centre.", "[%csl Gc7]"), learnerColor: "white" }).explainedDecisionCount).toBe(0);
    const preview = await updates.preview(repertoireId, { pgn: PGN.replace("Control the centre.", "[%csl Gc7] Prose explanation.") });
    updates.apply(repertoireId, preview.previewId, true);
    expect(workspace.repertoire(repertoireId).chapters[0]!.lines[0]!.moves[0]!.explanation.summary).toBe("Prose explanation.");
  });

  it("imports and refreshes all seven deeply nested Ruy Lopez branches", async () => {
    const ruyLopez = `[StudyName "KiS-2.0 Ruy Lopez Study"]
[ChapterName "C1. KiS Ruy Lopez 7.N3"]
[ChapterURL "https://lichess.org/study/Wf7nKYRg/AiFfFUFz"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. d3 b5 6. Bb3 { [%csl Gc7] } 6... Bc5 7. Nc3 d6 (7... O-O 8. Nd5 d6 (8... h6 9. c3 d6 10. Nxf6+ Qxf6 11. Bd5 Bd7 12. Rg1 Rae8 (12... h5 13. h3 Rae8 14. g4 hxg4 (14... Ne7 15. Bg5 Qg6 16. gxh5 Qxh5 17. Bf6 Ng6 18. Nxe5) 15. hxg4 Ne7 16. Bg5 Qg6 17. Bxe7 Rxe7 18. g5) 13. g4 Qg6 14. g5 hxg5 15. Bxg5) 9. Bg5 Bg4 10. Qd2) (7... h6 8. Nd5 d6 9. c3 Be6 (9... Rb8 10. d4 Ba7 11. Be3) 10. Nxf6+ Qxf6 11. O-O O-O 12. Bxe6 fxe6 13. b4 Bb6 14. a4) 8. Nd5 Nxd5 9. Bxd5 Bd7 10. Bg5 Qc8 11. Nh4 *`;
    const { repertoireId, importer, updates, workspace } = setup(ruyLopez);
    expect(importer.preview({ pgn: ruyLopez, learnerColor: "white" })).toMatchObject({ chapterCount: 1, lineCount: 7, learnerDecisionCount: 40, explainedDecisionCount: 0 });
    const before = workspace.repertoire(repertoireId).chapters[0]!.lines.map(line => line.id);
    const preview = await updates.preview(repertoireId, { pgn: ruyLopez.replace("[%csl Gc7]", "[%csl Gc7] Keep the bishop on its active diagonal.").replace("7. Nc3 d6", "7. Nc3 d6 (7... Ba7 8. O-O)") });
    expect(preview).toMatchObject({ addedLines: 1, extendedLines: 0, updatedNotes: 1, retainedLines: 0 });
    updates.apply(repertoireId, preview.previewId, true);
    const after = workspace.repertoire(repertoireId).chapters[0]!.lines;
    expect(after).toHaveLength(8);
    expect(after.map(line => line.id)).toEqual(expect.arrayContaining(before));
    expect(after.some(line => line.moves.at(-1)?.moveSan === "Nxe5" && line.moves.length === 35)).toBe(true);
  });
});
