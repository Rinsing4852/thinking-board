import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { Database } from "../db/database.js";
import { compileOpeningCurriculum, type OpeningCurriculum } from "./opening-content.js";
import { OpeningContentService } from "./opening-content-service.js";
import { STARTER_OPENING_CURRICULA } from "./starter-curricula.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function transposingCurriculum(): OpeningCurriculum {
  const explanation = {
    summary: "A legal developing move.",
    changes: ["The position changes in a useful way."],
    concepts: ["development" as const],
  };
  const opponent = (moveUci: string) => ({
    moveUci,
    explanation: { ...explanation, opponentIdea: "Black develops and contests the centre." },
  });
  return {
    id: "test-transposition",
    slug: "test-transposition",
    version: 1,
    status: "preview",
    name: "Test transposition",
    learnerColor: "white",
    firstMoveUci: "d2d4",
    summary: "Test content",
    audienceLabel: "Test",
    style: ["test"],
    memoryBurden: "low",
    sources: [{ id: "test-author", kind: "authored", title: "Test fixture" }],
    chapters: [{
      id: "chapter",
      title: "Move-order test",
      introduction: "Two move orders should reach one stored position.",
      lines: [
        {
          id: "knight-first",
          title: "Knight first",
          priority: 1,
          moves: [
            { moveUci: "d2d4", explanation },
            opponent("g8f6"),
            { moveUci: "g1f3", explanation },
            opponent("d7d5"),
          ],
        },
        {
          id: "pawn-first",
          title: "Pawn first",
          priority: 2,
          moves: [
            { moveUci: "d2d4", explanation },
            opponent("d7d5"),
            { moveUci: "g1f3", explanation },
            opponent("g8f6"),
          ],
        },
      ],
    }],
  };
}

describe("opening curriculum compiler", () => {
  it("compiles authored lines into a graph and merges transpositions", () => {
    const compiled = compileOpeningCurriculum(transposingCurriculum());
    const lines = compiled.chapters[0]!.lines;
    expect(lines).toHaveLength(2);
    expect(lines[0]!.positionIds.at(-1)).toBe(lines[1]!.positionIds.at(-1));
    expect(compiled.positions.length).toBeLessThan(10);
  });

  it("rejects illegal moves with their authored location", () => {
    const curriculum = transposingCurriculum();
    curriculum.chapters[0]!.lines[0]!.moves[2]!.moveUci = "g1g5";
    expect(() => compileOpeningCurriculum(curriculum)).toThrow(/knight-first ply 3.*illegal/);
  });

  it("requires an explanation of every opponent move's idea", () => {
    const curriculum = transposingCurriculum();
    delete curriculum.chapters[0]!.lines[0]!.moves[1]!.explanation.opponentIdea;
    expect(() => compileOpeningCurriculum(curriculum)).toThrow(/opponent idea is required/);
  });

  it("rejects a line that never gives the learner a decision", () => {
    const curriculum = transposingCurriculum();
    curriculum.learnerColor = "black";
    curriculum.chapters[0]!.lines = [{
      id: "white-only",
      title: "Incomplete line",
      priority: 1,
      moves: [{
        ...curriculum.chapters[0]!.lines[0]!.moves[0]!,
        explanation: {
          ...curriculum.chapters[0]!.lines[0]!.moves[0]!.explanation,
          opponentIdea: "White claims the centre.",
        },
      }],
    }];
    expect(() => compileOpeningCurriculum(curriculum)).toThrow(/at least one learner decision/);
  });

  it("requires cited provenance and validates authored metadata", () => {
    const curriculum = transposingCurriculum();
    curriculum.sources = [];
    expect(() => compileOpeningCurriculum(curriculum)).toThrow(/cite at least one source/);

    const invalidKind = transposingCurriculum();
    invalidKind.chapters[0]!.lines[0]!.moves[1]!.kind = "alternative";
    expect(() => compileOpeningCurriculum(invalidKind)).toThrow(/opponent reply/);
  });
});

describe("opening content persistence", () => {
  it("loads the starter repertoire idempotently with annotations and provenance", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-board-openings-"));
    tempDirectories.push(directory);
    const database = new Database(path.join(directory, "trainer.sqlite3"), path.resolve("migrations"));
    const service = new OpeningContentService(database.connection);

    service.sync(STARTER_OPENING_CURRICULA);
    service.sync(STARTER_OPENING_CURRICULA);

    expect(service.catalog()).toMatchObject({
      repertoires: expect.arrayContaining([expect.objectContaining({
        id: "repertoire.white-e4-principled",
        learnerColor: "white",
        firstMoveSan: "e4",
        chapterCount: 7,
        decisionCount: 29,
        status: "published",
      }), expect.objectContaining({
        id: "repertoire.black-modern-e4",
        learnerColor: "black",
        chapterCount: 3,
        decisionCount: 12,
        status: "published",
      })]),
    });
    expect(database.connection.prepare("SELECT COUNT(*) FROM opening_move_annotations").pluck().get())
      .toBe(database.connection.prepare("SELECT COUNT(*) FROM opening_moves").pluck().get());
    expect(database.connection.prepare("SELECT license FROM opening_sources WHERE kind = 'dataset'").pluck().get())
      .toBe("CC0-1.0");
    expect(database.connection.prepare("SELECT COUNT(*) FROM opening_moves WHERE frequency IS NOT NULL").pluck().get())
      .toBe(0);
    expect(database.connection.prepare("SELECT length(content_checksum) FROM opening_repertoires").pluck().get())
      .toBe(64);
    expect(database.connection.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });

  it("requires a version increase when persisted curriculum content changes", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-board-opening-version-"));
    tempDirectories.push(directory);
    const database = new Database(path.join(directory, "trainer.sqlite3"), path.resolve("migrations"));
    const service = new OpeningContentService(database.connection);
    const curriculum = transposingCurriculum();
    service.sync([curriculum]);

    const changed = structuredClone(curriculum);
    changed.summary = "Changed without a version bump";
    expect(() => service.sync([changed])).toThrow(/without a content version increase/);
    changed.version += 1;
    expect(() => service.sync([changed])).not.toThrow();
    expect(() => service.sync([curriculum])).toThrow(/cannot be downgraded/);
    database.close();
  });
});
