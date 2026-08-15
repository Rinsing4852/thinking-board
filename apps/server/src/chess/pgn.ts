import { createHash } from "node:crypto";
import { Chess } from "chess.js";

import type { Color } from "../../../../packages/contracts/src/api.js";

export interface ParsedMove {
  ply: number;
  moveNumber: number;
  moverColor: Color;
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
}

export interface ParsedGame {
  index: number;
  originalPgn: string;
  headers: Record<string, string>;
  initialFen: string;
  white: string;
  black: string;
  result: string;
  playedAt: string | null;
  fingerprint: string;
  rawHash: string;
  moves: ParsedMove[];
}

export interface ParseResult {
  games: ParsedGame[];
  errors: Array<{ index: number; message: string }>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function splitPgnGames(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const games: string[] = [];
  let current: string[] = [];
  let hasMovetext = false;
  let braceDepth = 0;

  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    const startsHeader = braceDepth === 0 && trimmed.startsWith("[");
    if (startsHeader && hasMovetext) {
      games.push(current.join("\n").trim());
      current = [];
      hasMovetext = false;
    }
    current.push(line);
    if (trimmed && !startsHeader && braceDepth === 0) hasMovetext = true;
    for (const char of line) {
      if (char === "{") braceDepth += 1;
      if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    }
  }
  if (current.some((line) => line.trim())) games.push(current.join("\n").trim());
  return games;
}

function uci(from: string, to: string, promotion?: string): string {
  return `${from}${to}${promotion ?? ""}`;
}

function playedAt(headers: Record<string, string>): string | null {
  const date = headers.UTCDate ?? headers.Date;
  if (!date || date.includes("?")) return null;
  const isoDate = date.replaceAll(".", "-");
  const time = headers.UTCTime ?? headers.Time;
  return time && !time.includes("?") ? `${isoDate}T${time}Z` : isoDate;
}

export function parsePgnText(text: string): ParseResult {
  const chunks = splitPgnGames(text);
  const games: ParsedGame[] = [];
  const errors: Array<{ index: number; message: string }> = [];

  chunks.forEach((chunk, index) => {
    try {
      const parsed = new Chess();
      parsed.loadPgn(chunk, { strict: false });
      const headers = parsed.getHeaders();
      const history = parsed.history({ verbose: true });
      if (history.length === 0) throw new Error("PGN contains no moves");

      const initialFen = headers.SetUp === "1" && headers.FEN
        ? headers.FEN
        : new Chess().fen();
      const replay = new Chess(initialFen);
      const moves: ParsedMove[] = history.map((move, moveIndex) => {
        const fenBefore = replay.fen();
        const fenParts = fenBefore.split(" ");
        const moverColor: Color = replay.turn() === "w" ? "white" : "black";
        const moveNumber = Number.parseInt(fenParts[5] ?? "1", 10);
        const applied = replay.move({
          from: move.from,
          to: move.to,
          ...(move.promotion ? { promotion: move.promotion } : {}),
        });
        if (!applied) throw new Error(`Illegal move at ply ${moveIndex + 1}`);
        return {
          ply: moveIndex + 1,
          moveNumber,
          moverColor,
          uci: uci(move.from, move.to, move.promotion),
          san: applied.san,
          fenBefore,
          fenAfter: replay.fen(),
        };
      });
      const canonical = `${initialFen}\n${moves.map((move) => move.uci).join(" ")}`;
      games.push({
        index,
        originalPgn: `${chunk}\n`,
        headers,
        initialFen,
        white: headers.White?.trim() || "Unknown",
        black: headers.Black?.trim() || "Unknown",
        result: headers.Result ?? "*",
        playedAt: playedAt(headers),
        fingerprint: sha256(canonical),
        rawHash: sha256(chunk),
        moves,
      });
    } catch (error) {
      errors.push({
        index,
        message: error instanceof Error ? error.message : "Invalid PGN",
      });
    }
  });

  if (chunks.length === 0) errors.push({ index: 0, message: "No PGN games found" });
  return { games, errors };
}
