import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { openingBuildGuidance } from "./opening-build-guidance";
import type { OpeningMoveEvidence } from "./use-opening-move-evidence";

const start = new Chess().fen();
const game = new Chess(); game.move("e4");
const afterE4 = game.fen();
const empty: OpeningMoveEvidence = { analysis: null, explorer: null, analysisBusy: false, explorerBusy: false, analysisError: "", explorerError: "" };
const own = { ...empty, analysis: { fen: start, depth: 14, lines: [{ rank: 1, moveUci: "e2e4", moveSan: "e4", pvSan: [], score: { kind: "centipawns" as const, value: 30, perspective: "side_to_move" as const } }] } };
const opponents: OpeningMoveEvidence = { ...empty,
  analysis: { fen: afterE4, depth: 14, lines: [{ rank: 1, moveUci: "d7d5", moveSan: "d5", pvSan: [], score: { kind: "centipawns", value: 0, perspective: "side_to_move" } }] },
  explorer: { fen: afterE4, ratingGroup: 1600, speeds: ["blitz"], totalGames: 1000, cached: false, stale: false, fetchedAt: "2026-10-14T12:00:00Z", opening: null,
    replies: [["e7e6", "e6", 150], ["c7c5", "c5", 500], ["e7e5", "e5", 250], ["d7d5", "d5", 100]].map(([uci, san, games]) => ({ moveUci: String(uci), moveSan: String(san), games: Number(games), frequencyPercent: Number(games) / 10, whiteWins: Number(games), blackWins: 0, draws: 0 })) },
};

describe("building suggestions", () => {
  it("shows the strongest engine move on our turn", () => {
    expect(openingBuildGuidance(start, "white", 1600, true, own).arrows).toEqual([{ from: "e2", to: "e4", color: "green" }]);
  });
  it("ranks three opponent replies by sample frequency rather than engine strength", () => {
    const result = openingBuildGuidance(afterE4, "white", 1600, true, opponents);
    expect(result.moves.map(move => move.san)).toEqual(["c5", "e5", "e6"]);
    expect(result.arrows.every(arrow => arrow.color === "blue")).toBe(true);
    expect(result.message).toContain("not engine strength");
  });
  it("uses the repertoire side rather than fixed white and black roles", () => {
    expect(openingBuildGuidance(afterE4, "black", 1600, true, opponents).moves.map(move => move.san)).toEqual(["d5"]);
    expect(openingBuildGuidance(start, "black", 1600, false, own).arrows).toEqual([]);
  });
  it("does not turn engine replies into likely-reply arrows when frequencies are off or fail", () => {
    expect(openingBuildGuidance(afterE4, "white", 1600, false, opponents).arrows).toEqual([]);
    expect(openingBuildGuidance(afterE4, "white", 1600, true, { ...opponents, explorer: null, explorerError: "Unavailable" }))
      .toMatchObject({ arrows: [], message: "Unavailable" });
  });
  it("rejects stale, small, wrong-position and wrong-rating samples", () => {
    for (const patch of [{ stale: true }, { totalGames: 50 }, { fen: start }, { ratingGroup: 2000 }]) {
      expect(openingBuildGuidance(afterE4, "white", 1600, true, { ...opponents, explorer: { ...opponents.explorer!, ...patch } }).arrows).toEqual([]);
    }
    expect(openingBuildGuidance(afterE4, "black", 1600, true, own).arrows).toEqual([]);
  });
  it("never draws an illegal move or fabricates a third reply from too few observations", () => {
    const sample = { ...opponents.explorer!, replies: [opponents.explorer!.replies[0]!, { ...opponents.explorer!.replies[1]!, moveUci: "a1a8" }, { ...opponents.explorer!.replies[2]!, games: 2 }] };
    expect(openingBuildGuidance(afterE4, "white", 1600, true, { ...opponents, explorer: sample }).moves.map(move => move.san)).toEqual(["e6"]);
  });
});
