import type { OpeningLineDetail } from "../../../packages/contracts/src/api";

export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** Intern move-order prefixes so studying many long lines stays linear in the
 * number of moves rather than repeatedly copying complete prefixes. */
export function countTranspositions(lines: OpeningLineDetail[]): Map<string, number> {
  const prefixes = new Map<string, number>();
  const routes = new Map<string, Set<number>>();
  const intern = (key: string): number => {
    if (!prefixes.has(key)) prefixes.set(key, prefixes.size + 1);
    return prefixes.get(key)!;
  };
  for (const line of lines) {
    let prefix = intern(`root:${positionKey(line.moves[0]?.fenBefore ?? "")}`);
    for (const move of line.moves) {
      prefix = intern(`${prefix}:${move.moveUci}`);
      const key = positionKey(move.fenAfter);
      const existing = routes.get(key) ?? new Set<number>();
      existing.add(prefix);
      routes.set(key, existing);
    }
  }
  return new Map(lines.map((line) => [line.id, new Set(line.moves.map((move) => positionKey(move.fenAfter))
    .filter((key) => (routes.get(key)?.size ?? 0) > 1)).size]));
}
