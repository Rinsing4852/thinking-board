import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { detectNewlyAttackedPieces } from "./what-changed-generator.js";

describe("last-move change detection", () => {
  it("finds direct and discovered attacks created by Nc5", () => {
    const game = new Chess();
    const moves = [
      "e4", "e5", "f4", "d5", "exd5", "Qxd5", "Nc3", "Qd8", "Nf3", "Ne7",
      "Nxe5", "f6", "Nc4", "Nbc6", "Ne4", "Nd5", "g3", "Bb4", "c3", "Ba5",
      "d4", "O-O", "b4", "Bb6", "f5", "a6", "Qg4", "Ba7", "a4", "Bd7",
      "b5", "axb5", "h3", "bxc4", "Bxc4", "Rf7", "Rb1", "Bb6", "Bxd5", "Ne7",
      "Nxf6+", "Kf8", "Bxf7", "Kxf7", "Ne4", "Bxf5", "O-O", "Ke8", "Qe2", "Rxa4",
    ];
    for (const move of moves) game.move(move);
    const before = game.fen();
    game.move("Nc5");

    expect(detectNewlyAttackedPieces(before, game.fen(), "black")).toEqual([
      { square: "a4", piece: "r" },
      { square: "e7", piece: "n" },
    ]);
  });

  it("ignores newly attacked pawns in the first slice", () => {
    const after = new Chess("4k3/8/8/3p4/8/8/4P3/4K3 w - - 0 1");
    const before = after.fen();
    after.move("e4");
    expect(detectNewlyAttackedPieces(before, after.fen(), "black")).toEqual([]);
  });
});
