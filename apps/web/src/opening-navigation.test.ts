import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { OpeningChapterDetail, OpeningLineDetail } from "../../../packages/contracts/src/api";
import { fenPositionKey } from "./opening-line-position";
import { buildOpeningNavigation, currentPositionRoutes, openingGraphKey, openingMoveLabel, otherMoveOrders, savedContinuations, switchLineDestination } from "./opening-navigation";

function line(id: string, sequence: string, title = id, archived = false, fen?: string): OpeningLineDetail {
  const chess = new Chess(fen);
  const moves = sequence.split(" ").filter(Boolean).map((san, index) => {
    const before = chess.fen(); const move = chess.move(san);
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    return { id: `${fenPositionKey(before)}:${uci}`, ply: index + 1, moveUci: uci, moveSan: move.san,
      fenBefore: before, fenAfter: chess.fen(), role: move.color === "w" ? "learner" as const : "opponent" as const,
      moveKind: "primary" as const, explanation: { summary: "", changes: [], concepts: [], opponentIdea: null, resultingPlan: null, tacticalWarning: null, commonMistake: null, personalComment: null } };
  });
  return { id, title, archived, priority: 1, moveCount: moves.length, learnerDecisionCount: moves.filter(move => move.role === "learner").length, sanSequence: sequence, moves };
}
function chapter(lines: OpeningLineDetail[], id = "chapter"): OpeningChapterDetail { return { id, title: id, introduction: "", lines }; }
const main = () => line("main", "e4 e5 Nf3 Nc6 Bb5 a6", "Main line");
const philidor = () => line("philidor", "e4 e5 Nf3 d6 d4", "Variation 2");
const nested = () => line("nested", "e4 e5 Nf3 d6 Bc4", "Variation 3");

describe("opening branch navigation", () => {
  it("invalidates coverage for graph changes, but not personal notes or renaming", () => {
    const original = chapter([main()]);
    const renamed = chapter([{ ...main(), title: "My renamed line", moves: main().moves.map(move => ({ ...move, explanation: { ...move.explanation, personalComment: "My reminder" } })) }]);
    expect(openingGraphKey([original])).toBe(openingGraphKey([renamed]));
    expect(openingGraphKey([original])).not.toBe(openingGraphKey([chapter([{ ...main(), archived: true }])]));
    expect(openingGraphKey([original])).not.toBe(openingGraphKey([chapter([main(), philidor()])]));
  });
  it("describes nested variations at their actual branching point without changing source titles", () => {
    const lines = [main(), philidor(), nested()];
    const index = buildOpeningNavigation([chapter(lines)]);
    expect(index.branches.get("philidor")).toMatchObject({ title: "2...d6 branch", sharedPly: 3, parentLineId: "main" });
    expect(index.branches.get("nested")).toMatchObject({ title: "3.Bc4 branch", sharedPly: 4, parentLineId: "philidor" });
    expect(lines[2]!.title).toBe("Variation 3");
  });
  it("preserves custom names and keeps chapters' prefix descriptions independent", () => {
    const index = buildOpeningNavigation([chapter([main()]), chapter([line("custom", "e4 e5 Nf3 d6", "My practical reply")], "other")]);
    expect(index.branches.get("custom")).toMatchObject({ title: "My practical reply", parentLineId: null, sharedPly: 0 });
    expect(savedContinuations(index, "main", 3)).toHaveLength(2);
  });
  it("groups the saved replies once and prefers staying on the exact selected branch", () => {
    const index = buildOpeningNavigation([chapter([main(), philidor(), nested()])]);
    expect(savedContinuations(index, "main", 3)).toEqual([
      expect.objectContaining({ label: "2...Nc6", selected: true, lineCount: 1, target: expect.objectContaining({ lineId: "main", ply: 4 }) }),
      expect.objectContaining({ label: "2...d6", selected: false, lineCount: 2, target: expect.objectContaining({ lineId: "philidor", ply: 4 }) }),
    ]);
    expect(savedContinuations(index, "nested", 4)[0]).toMatchObject({ label: "3.Bc4", target: { lineId: "nested", ply: 5 } });
  });
  it("does not offer archived replies while retaining their shared-note membership", () => {
    const archived = { ...philidor(), archived: true };
    const index = buildOpeningNavigation([chapter([main(), archived, nested()])]);
    expect(savedContinuations(index, "main", 3).find(choice => choice.moveUci === "d7d6"))
      .toMatchObject({ lineCount: 1, target: { lineId: "nested" } });
    expect(index.moveUses.get(main().moves[0]!.id)?.size).toBe(3);
  });
  it("keeps the current board when switching before a fork and returns to the fork after it", () => {
    const index = buildOpeningNavigation([chapter([main(), philidor()])]);
    expect(switchLineDestination(index, "main", 3, "philidor")).toMatchObject({ ply: 3, reason: "shared" });
    expect(switchLineDestination(index, "main", 5, "philidor")).toMatchObject({ ply: 3, reason: "branch" });
    expect(switchLineDestination(index, "main", 0, "philidor")).toMatchObject({ ply: 0, reason: "shared" });
  });
  it("does not call shared opening moves transpositions", () => {
    const index = buildOpeningNavigation([chapter([main(), philidor(), nested()])]);
    expect(otherMoveOrders(index, "main", 0)).toEqual([]);
    expect(otherMoveOrders(index, "main", 3)).toEqual([]);
  });
  it("switches genuine move orders at the same position and shares their later move annotations", () => {
    const first = line("first", "Nf3 d5 d4 Nf6 c4 e6");
    const second = line("second", "d4 Nf6 Nf3 d5 c4 e6");
    const index = buildOpeningNavigation([chapter([first, second])]);
    expect(switchLineDestination(index, "first", 4, "second")).toMatchObject({ ply: 4, reason: "transposition" });
    expect(otherMoveOrders(index, "first", 4)).toEqual([expect.objectContaining({ lineId: "second", ply: 4 })]);
    expect(savedContinuations(index, "first", 4)[0]).toMatchObject({ lineCount: 2, target: { lineId: "first", ply: 5 } });
    expect(index.moveUses.get(first.moves[4]!.id)?.size).toBe(2);
  });
  it("keeps repeated board occurrences distinct by move order", () => {
    const cycle = line("cycle", "Nf3 Nf6 Ng1 Ng8 e4");
    const direct = line("direct", "e4 e5");
    const index = buildOpeningNavigation([chapter([cycle, direct])]);
    expect(currentPositionRoutes(index, "cycle", 4).filter(route => route.lineId === "cycle")).toHaveLength(2);
    expect(switchLineDestination(index, "cycle", 4, "cycle")).toMatchObject({ ply: 4, reason: "shared" });
    expect(switchLineDestination(index, "cycle", 4, "direct")).toMatchObject({ ply: 0, reason: "transposition" });
  });
  it("handles ended lines and different starting positions safely", () => {
    const chess = new Chess(); chess.move("e4");
    const custom = line("custom", "c5 Nf3", "Custom", false, chess.fen());
    const index = buildOpeningNavigation([chapter([main(), custom])]);
    expect(openingMoveLabel(custom.moves[0]!)).toBe("1...c5");
    expect(switchLineDestination(index, "main", 6, "custom")).toMatchObject({ ply: 0, reason: "start" });
    expect(savedContinuations(index, "main", 6)).toEqual([]);
    expect(savedContinuations(index, "missing", 0)).toEqual([]);
  });
  it("indexes a large set of shared lines without generating duplicate move choices", () => {
    const lines = Array.from({ length: 300 }, (_, i) => ({ ...main(), id: `line-${i}` }));
    const index = buildOpeningNavigation([chapter(lines)]);
    expect(index.lines.size).toBe(300);
    expect(savedContinuations(index, "line-150", 3)).toHaveLength(1);
    expect(savedContinuations(index, "line-150", 3)[0]).toMatchObject({ lineCount: 300, target: { lineId: "line-150" } });
  });
});
