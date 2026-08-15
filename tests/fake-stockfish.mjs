#!/usr/bin/env node
import readline from "node:readline";
import { Chess } from "chess.js";

let fen = new Chess().fen();
let multiPv = 3;

function uci(move) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

const input = readline.createInterface({ input: process.stdin });
input.on("line", (raw) => {
  const line = raw.trim();
  if (line === "uci") {
    console.log("id name FakeStockfish 1.0");
    console.log("option name MultiPV type spin default 1 min 1 max 10");
    console.log("option name Threads type spin default 1 min 1 max 16");
    console.log("option name Hash type spin default 16 min 1 max 1024");
    console.log("uciok");
    return;
  }
  if (line === "isready") {
    console.log("readyok");
    return;
  }
  if (line.startsWith("setoption name MultiPV value ")) {
    multiPv = Number(line.slice("setoption name MultiPV value ".length));
    return;
  }
  if (line.startsWith("position fen ")) {
    fen = line.slice("position fen ".length);
    return;
  }
  if (line.startsWith("go ")) {
    const board = new Chess(fen);
    const searchIndex = line.indexOf(" searchmoves ");
    const restricted = searchIndex >= 0
      ? new Set(line.slice(searchIndex + " searchmoves ".length).trim().split(/\s+/))
      : null;
    const legal = board.moves({ verbose: true }).filter((move) => !restricted || restricted.has(uci(move))).map((move) => {
      const copy = new Chess(fen);
      copy.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
      const allowsMate = !copy.isGameOver() && copy.moves({ verbose: true }).some((reply) => {
        const replyBoard = new Chess(copy.fen());
        replyBoard.move({ from: reply.from, to: reply.to, ...(reply.promotion ? { promotion: reply.promotion } : {}) });
        return replyBoard.isCheckmate();
      });
      return { move, mate: copy.isCheckmate(), allowsMate };
    }).sort((left, right) => Number(right.mate) - Number(left.mate) || Number(left.allowsMate) - Number(right.allowsMate));
    legal.slice(0, multiPv).forEach((entry, index) => {
      const score = entry.mate ? "mate 1" : entry.allowsMate ? "mate -2" : "cp 0";
      console.log(`info depth 14 multipv ${index + 1} score ${score} pv ${uci(entry.move)}`);
    });
    console.log(`bestmove ${legal[0] ? uci(legal[0].move) : "(none)"}`);
    return;
  }
  if (line === "quit") process.exit(0);
});
