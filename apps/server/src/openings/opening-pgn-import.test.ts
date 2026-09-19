import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { Database } from "../db/database.js";
import { OpeningContentService } from "./opening-content-service.js";
import { OpeningPgnImportService, parseOpeningPgn } from "./opening-pgn-import.js";

const BOOK_PGN = `[Event "My book notes"]
[Opening "Italian notes"]
[Result "*"]

1. e4 {Claims space in the centre in my own words.} e5
2. Nf3 Nc6 (2... Nf6 3. Nxe5 {Check whether the centre is safe.})
3. Bc4 *`;

const MIXED_STUDY_PGN = `[Event "1.e4 chapter"]
[Result "*"]

1. e4 e5 2. Nf3 *

[Event "1.d4 chapter"]
[Result "*"]

1. d4 d5 2. c4 *`;

const STUDY_WITH_INTRO = `[Event "Introduction"]
[Result "*"]

*

[Event "Italian line"]
[Result "*"]

1. e4 e5 2. Nf3 *`;

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function services(): { database: Database; importer: OpeningPgnImportService; content: OpeningContentService } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-board-opening-import-"));
  tempDirectories.push(directory);
  const database = new Database(path.join(directory, "trainer.sqlite3"), path.resolve("migrations"));
  const content = new OpeningContentService(database.connection);
  return { database, content, importer: new OpeningPgnImportService(database.connection, content) };
}

describe("opening PGN parsing", () => {
  it("preserves a main line, side variation, and comments", () => {
    const parsed = parseOpeningPgn(BOOK_PGN);
    expect(parsed.suggestedName).toBe("Italian notes");
    expect(parsed.firstMoveSan).toBe("e4");
    expect(parsed.chapters).toHaveLength(1);
    expect(parsed.chapters[0]?.lines.map((line) => line.moves.map((move) => move.san))).toEqual([
      ["e4", "e5", "Nf3", "Nc6", "Bc4"],
      ["e4", "e5", "Nf3", "Nf6", "Nxe5"],
    ]);
    expect(parsed.chapters[0]?.lines[0]?.moves[0]?.comment).toMatch(/Claims space/);
  });

  it("gives useful errors for illegal moves and mixed first moves", () => {
    expect(() => parseOpeningPgn("1. e4 e5 2. Bh6 *")).toThrow(/Illegal or unsupported move/);
    expect(() => parseOpeningPgn("1. e4 (1. d4) *")).toThrow(/mixes different first moves/);
    expect(() => parseOpeningPgn("[SetUp \"1\"]\n[FEN \"8/8/8/8/8/8/8/K6k w - - 0 1\"]\n1. Ka2 *"))
      .toThrow(/normal starting position/);
  });

  it("can preview a mixed study and select compatible chapters before import", () => {
    const { database, importer } = services();
    const preview = importer.previewStudy({ pgn: MIXED_STUDY_PGN, learnerColor: "white" });
    expect(preview).toMatchObject({ firstMoveSan: "Multiple", chapterCount: 2 });
    expect(preview.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/different first moves/i)]));
    expect(() => importer.preview({ pgn: MIXED_STUDY_PGN, learnerColor: "white" })).toThrow(/mixes different first moves/);
    expect(importer.preview({
      pgn: MIXED_STUDY_PGN,
      learnerColor: "white",
      selectedChapterIndexes: [1],
    })).toMatchObject({ firstMoveSan: "d4", chapterCount: 1 });
    database.close();
  });

  it("skips text-only study chapters while preserving source indexes", () => {
    const { database, importer } = services();
    const preview = importer.previewStudy({ pgn: STUDY_WITH_INTRO, learnerColor: "white" });
    expect(preview.chapters).toEqual([expect.objectContaining({
      sourceIndex: 1,
      title: "Italian line",
      importable: true,
    })]);
    expect(preview.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/without moves will be skipped/i)]));
    database.close();
  });
});

describe("opening PGN import persistence", () => {
  it("previews and imports both sides as private, deduplicated repertoires", () => {
    const { database, importer, content } = services();
    const input = {
      pgn: BOOK_PGN,
      learnerColor: "both" as const,
      name: "My Italian",
      sourceType: "book_notes" as const,
      sourceTitle: "A book I own",
      sourceAuthor: "Example Author",
    };
    const preview = importer.preview(input);
    expect(preview).toMatchObject({
      learnerColors: ["white", "black"],
      firstMoveSan: "e4",
      chapterCount: 1,
      lineCount: 2,
    });
    expect(preview.learnerDecisionCount).toBeGreaterThan(0);
    expect(preview.explainedDecisionCount).toBeGreaterThan(0);
    expect(preview.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/variations were detected/i)]));

    expect(() => importer.import({ ...input, ownershipConfirmed: false })).toThrow(/Confirm that you own/);
    const imported = importer.import({ ...input, ownershipConfirmed: true });
    expect(imported).toMatchObject({ imported: 2, duplicates: 0 });
    expect(content.catalog().repertoires).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "My Italian — White", learnerColor: "white", origin: "imported", sourceTitle: "A book I own" }),
      expect.objectContaining({ name: "My Italian — Black", learnerColor: "black", origin: "imported", sourceTitle: "A book I own" }),
    ]));
    expect(database.connection.prepare("SELECT COUNT(*) FROM opening_imports").pluck().get()).toBe(2);
    expect(database.connection.prepare("SELECT visibility FROM opening_imports LIMIT 1").pluck().get()).toBe("private");
    expect(database.connection.prepare("SELECT original_pgn FROM opening_imports LIMIT 1").pluck().get()).toBe(BOOK_PGN);
    expect(database.connection.pragma("foreign_key_check")).toEqual([]);

    expect(importer.import({ ...input, ownershipConfirmed: true })).toMatchObject({ imported: 0, duplicates: 2 });
    database.close();
  });
});
