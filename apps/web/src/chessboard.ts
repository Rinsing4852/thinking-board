import { Chess, type Square } from "chess.js";
import type { Dests, Key } from "@lichess-org/chessground/types";
import type { Color } from "../../../packages/contracts/src/api";

export function boardSquares(orientation: Color): Square[] {
  const ranks = orientation === "white" ? "87654321" : "12345678";
  const files = orientation === "white" ? "abcdefgh" : "hgfedcba";
  return [...ranks].flatMap(rank => [...files].map(file => `${file}${rank}` as Square));
}

// Chessground moves pieces; chess.js remains the rules authority.
export function legalDestinations(game: Chess): Dests {
  const destinations: Dests = new Map();
  for (const move of game.moves({ verbose: true })) {
    const targets = destinations.get(move.from) ?? [];
    if (!targets.includes(move.to)) targets.push(move.to);
    destinations.set(move.from, targets);
  }
  return destinations;
}

export function moveSquares(uci?: string | null): Key[] | undefined {
  return uci && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)
    ? [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key] : undefined;
}
