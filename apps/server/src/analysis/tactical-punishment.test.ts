import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { significantMistake, tacticalPunishment } from "./tactical-punishment.js";

function position(moves: string[]) {
  const game = new Chess(); let before = game.fen();
  for (const move of moves) { before = game.fen(); game.move(move); }
  return { before, after: game.fen() };
}

describe("tactical punishment evidence", () => {
  it("rejects the Ruy Lopez bishop attack and an ordinary equal recapture", () => {
    const ruy = position(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
    expect(tacticalPunishment(ruy.before, ruy.after, "a7a6", JSON.stringify(["a7a6", "b5a4", "g8f6", "e1g1", "f8e7", "f1e1"]), null)).toBeNull();
    const exchange = position(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6"]);
    expect(tacticalPunishment(exchange.before, exchange.after, "d7c6", JSON.stringify(["d7c6", "e1g1", "g8f6", "f1e1"]), null)).toBeNull();
  });

  it("keeps real retained material gains for either colour", () => {
    expect(tacticalPunishment("6k1/8/8/8/8/8/2q5/1R4K1 b - - 0 1", "6k1/8/8/8/8/8/1q6/1R4K1 w - - 1 2", "b1b2", '["b1b2","g8f7","b2b7","f7e6"]', null))
      .toMatchObject({ kind: "material", gainPawns: 9 });
    expect(tacticalPunishment("1r4k1/2Q5/8/8/8/8/8/6K1 w - - 0 1", "1r4k1/1Q6/8/8/8/8/8/6K1 b - - 1 1", "b8b7", '["b8b7","g1f2","b7b2","f2e3"]', null))
      .toMatchObject({ kind: "material", gainPawns: 9 });
  });

  it("requires a complete legal continuation before accepting a material tactic", () => {
    const before = "6k1/8/8/8/8/1r6/2q5/1R4K1 b - - 0 1", after = "6k1/8/8/8/8/1r6/1q6/1R4K1 w - - 1 2";
    // The capture is profitable, but a truncated PV does not establish a retained gain.
    expect(tacticalPunishment(before, after, "b1b2", '["b1b2"]', null)).toBeNull();
    expect(tacticalPunishment(before, after, "b1b2", '["b1b2","b3b2"]', null)).toBeNull();
    expect(tacticalPunishment(before, after, "b1b2", '["b1b2","g8g1"]', null)).toBeNull();
    expect(tacticalPunishment(before, after, "b1b2", 'not json', null)).toBeNull();
  });

  it("does not mistake a delayed recapture for retained material",()=>{
    const before="6k1/8/1r6/8/8/8/2r5/1R4K1 b - - 0 1";
    const after="6k1/8/1r6/8/8/8/1r6/1R4K1 w - - 1 2";
    expect(tacticalPunishment(before,after,"b1b2",'["b1b2","g8f7","b2b3","b6b3"]',null)).toBeNull();
  });

  it("does not count a pinned knight as a legal queen defender",()=>{
    const before="r3k3/4n3/3q4/8/2B5/8/8/3QR2K b - - 0 1",board=new Chess(before);
    board.move('Qd5+');const after=board.fen();board.move('Bxd5');
    expect(board.moves()).not.toContain('Nxd5');
    expect(tacticalPunishment(before,after,"c4d5",'["c4d5","a8a7","d5c4","a7a8"]',null)).toMatchObject({kind:"material",gainPawns:9});
  });

  it("keeps forced mate but rejects a line in which the punishing side gets mated", () => {
    const mate = position(["f3", "e5", "g4"]);
    expect(tacticalPunishment(mate.before, mate.after, "d8h4", '["d8h4"]', -1)).toMatchObject({ kind: "forced_mate", mateIn: 1 });
    const ruy = position(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
    expect(tacticalPunishment(ruy.before, ruy.after, "a7a6", '["a7a6","b5a4"]', 3)).toBeNull();
  });

  it("requires an actual significant evaluation loss rather than trusting a stale blunder label", () => {
    const base = { meaningful: 1, classification: "blunder", eval_before_cp_white: 30, eval_after_cp_white: 20,
      eval_before_mate_white: null, eval_after_mate_white: null };
    expect(significantMistake(base, "white")).toBe(false);
    expect(significantMistake({ ...base, eval_after_cp_white: -300 }, "white")).toBe(true);
    expect(significantMistake({ ...base, eval_before_cp_white: 0, eval_after_cp_white: 300 }, "black")).toBe(true);
    expect(significantMistake({ ...base, eval_after_cp_white: null }, "white")).toBe(false);
  });
  it("recognises a queen lost when its protecting rook moves away",()=>{
    const before="2k5/3b4/8/8/6Q1/8/8/6RK w - - 0 1";
    const board=new Chess(before);expect(board.attackers("g4","w")).toContain("g1");board.move("Rf1");
    expect(board.attackers("g4","w")).toEqual([]);
    expect(tacticalPunishment(before,board.fen(),"d7g4",'["d7g4","h1h2","g4h5","h2g1"]',null)).toMatchObject({kind:"material",gainPawns:9});
  });
});
