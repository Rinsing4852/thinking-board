import type { GamePracticeFilter, GameReplayCheckpoint } from "./api.js";

type Selectable = Pick<GameReplayCheckpoint, "id" | "ply" | "kind" | "keyDecision" | "canRecall" | "categories" | "mateIn" | "practiceEligible">;
export const GAME_PRACTICE_FILTERS: GamePracticeFilter[] = ["recommended", "mistakes", "opening", "attacking", "defending", "mates"];

/** A combined round visits a position once, preferring engine feedback to recall. */
export function selectGamePractice<T extends Selectable>(points: T[], filters: GamePracticeFilter[], maxMateIn = 2): T[] {
  const selected = points.filter(point => point.canRecall && point.practiceEligible!==false && (point.mateIn===undefined||point.mateIn<=maxMateIn) && filters.some(filter =>
    filter === "recommended" ? point.keyDecision : filter === "mistakes" ? point.kind === "engine" : filter === "opening" ? point.kind === "opening" : point.categories?.includes(filter)));
  const positions = new Map<number, T>();
  for (const point of selected) {
    const previous = positions.get(point.ply);
    if (!previous || (point.kind === "engine" && previous.kind !== "engine")) positions.set(point.ply, point);
  }
  return [...positions.values()].sort((a, b) => a.ply - b.ply);
}
