import type { GamePracticeFilter, GameReplayCheckpoint } from "./api.js";

type Selectable = Pick<GameReplayCheckpoint, "id" | "ply" | "kind" | "keyDecision" | "canRecall">;
export const GAME_PRACTICE_FILTERS: GamePracticeFilter[] = ["recommended", "mistakes", "opening"];

/** A combined round visits a position once, preferring engine feedback to recall. */
export function selectGamePractice<T extends Selectable>(points: T[], filters: GamePracticeFilter[]): T[] {
  const selected = points.filter(point => point.canRecall && filters.some(filter =>
    filter === "recommended" ? point.keyDecision : filter === "mistakes" ? point.kind === "engine" : point.kind === "opening"));
  const positions = new Map<number, T>();
  for (const point of selected) {
    const previous = positions.get(point.ply);
    if (!previous || (point.kind === "engine" && previous.kind !== "engine")) positions.set(point.ply, point);
  }
  return [...positions.values()].sort((a, b) => a.ply - b.ply);
}
