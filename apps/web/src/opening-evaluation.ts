import type { OpeningAnalysisLine } from "../../../packages/contracts/src/api";

/** Stable White perspective, independent of board orientation or whose turn it is. */
export function openingEvaluation(line: OpeningAnalysisLine | undefined, fen: string): string {
  if (!line) return "—";
  const value = line.score.value * (fen.split(" ")[1] === "b" ? -1 : 1);
  if (line.score.kind === "mate") return `${value < 0 ? "−" : "+"}M${Math.abs(value)}`;
  const pawns = value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}
