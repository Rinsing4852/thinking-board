import type { OpeningChapterDetail, OpeningLineDetail, OpeningLineMove } from "../../../packages/contracts/src/api";
import { fenPositionKey } from "./opening-line-position";

export interface LineReference { line: OpeningLineDetail; chapterId: string; chapterTitle: string }
export interface PositionRoute { lineId: string; ply: number; prefix: number }
export interface BranchDescription { title: string; preview: string; sharedPly: number; parentLineId: string | null }
export interface OpeningNavigation {
  lines: Map<string, LineReference>;
  positions: Map<string, PositionRoute[]>;
  branches: Map<string, BranchDescription>;
  moveUses: Map<string, Set<string>>;
}
export interface SavedContinuation {
  moveUci: string;
  label: string;
  lineCount: number;
  selected: boolean;
  target: PositionRoute;
}

/** Coverage depends on visible moves, not edits to prose. */
export function openingGraphKey(chapters: OpeningChapterDetail[]): string {
  return JSON.stringify(chapters.map(chapter => [chapter.id, chapter.lines.map(line => [
    line.id, line.archived, fenPositionKey(lineFen(line, 0)), line.moves.map(move => move.moveUci),
  ])]));
}

export function openingMoveLabel(move: Pick<OpeningLineMove, "fenBefore" | "moveSan">): string {
  const fields = move.fenBefore.split(" ");
  return `${fields[5] ?? "1"}${fields[1] === "b" ? "..." : "."}${move.moveSan}`;
}

/** One index for shared prefixes, board positions and shared annotations.
 * Route identity distinguishes a common prefix from a genuine transposition. */
export function buildOpeningNavigation(chapters: OpeningChapterDetail[]): OpeningNavigation {
  const result: OpeningNavigation = { lines: new Map(), positions: new Map(), branches: new Map(), moveUses: new Map() };
  const prefixes = new Map<string, number>();
  const intern = (key: string): number => {
    if (!prefixes.has(key)) prefixes.set(key, prefixes.size + 1);
    return prefixes.get(key)!;
  };
  const addPosition = (fen: string, route: PositionRoute): void => {
    const key = fenPositionKey(fen);
    const routes = result.positions.get(key) ?? [];
    routes.push(route); result.positions.set(key, routes);
  };
  for (const chapter of chapters) {
    const priorPrefixes = new Map<number, string>();
    for (const line of chapter.lines) {
      result.lines.set(line.id, { line, chapterId: chapter.id, chapterTitle: chapter.title });
      let prefix = intern(`root:${fenPositionKey(line.moves[0]?.fenBefore ?? "")}`);
      let parentLineId = priorPrefixes.get(prefix) ?? null;
      let sharedPly = 0;
      let diverged = false;
      if (line.moves[0]) addPosition(line.moves[0].fenBefore, { lineId: line.id, ply: 0, prefix });
      if (!priorPrefixes.has(prefix)) priorPrefixes.set(prefix, line.id);
      for (const move of line.moves) {
        prefix = intern(`${prefix}:${move.moveUci}`);
        if (!diverged && priorPrefixes.has(prefix)) {
          sharedPly = move.ply; parentLineId = priorPrefixes.get(prefix)!;
        } else diverged = true;
        if (!priorPrefixes.has(prefix)) priorPrefixes.set(prefix, line.id);
        addPosition(move.fenAfter, { lineId: line.id, ply: move.ply, prefix });
        const uses = result.moveUses.get(move.id) ?? new Set<string>();
        uses.add(line.id); result.moveUses.set(move.id, uses);
      }
      const firstDifferent = parentLineId ? line.moves[sharedPly] : undefined;
      result.branches.set(line.id, {
        title: /^Variation\s+\d+$/i.test(line.title) && firstDifferent ? `${openingMoveLabel(firstDifferent)} branch` : line.title,
        preview: line.moves.slice(parentLineId ? sharedPly : 0, (parentLineId ? sharedPly : 0) + 3).map(openingMoveLabel).join(" "),
        sharedPly, parentLineId,
      });
    }
  }
  return result;
}

export function lineFen(line: OpeningLineDetail, ply: number): string {
  return line.moves[ply - 1]?.fenAfter ?? line.moves[0]?.fenBefore ?? "";
}

export function commonPrefixLength(left: OpeningLineDetail, right: OpeningLineDetail): number {
  if (fenPositionKey(lineFen(left, 0)) !== fenPositionKey(lineFen(right, 0))) return 0;
  let length = 0;
  while (left.moves[length] && right.moves[length] && left.moves[length]!.moveUci === right.moves[length]!.moveUci) length++;
  return length;
}

export function currentPositionRoutes(index: OpeningNavigation, lineId: string, ply: number): PositionRoute[] {
  const line = index.lines.get(lineId)?.line;
  return line ? index.positions.get(fenPositionKey(lineFen(line, ply))) ?? [] : [];
}

export function savedContinuations(index: OpeningNavigation, lineId: string, ply: number): SavedContinuation[] {
  const current = index.lines.get(lineId);
  if (!current) return [];
  const currentRoute = currentPositionRoutes(index, lineId, ply).find(route => route.lineId === lineId && route.ply === ply);
  const groups = new Map<string, { label: string; routes: PositionRoute[] }>();
  for (const route of currentPositionRoutes(index, lineId, ply)) {
    const target = index.lines.get(route.lineId)!;
    const move = target.line.moves[route.ply];
    if (target.line.archived || !move) continue;
    const group = groups.get(move.moveUci) ?? { label: openingMoveLabel(move), routes: [] };
    group.routes.push(route); groups.set(move.moveUci, group);
  }
  return [...groups].map(([moveUci, group]) => {
    // Stay on this exact route when possible; otherwise prefer a shared move
    // order in this chapter before a line reached by transposition.
    const score = (route: PositionRoute): number => route.lineId === lineId && route.ply === ply ? 4
      : route.prefix === currentRoute?.prefix && index.lines.get(route.lineId)?.chapterId === current.chapterId ? 3
      : route.prefix === currentRoute?.prefix ? 2 : 1;
    const target = group.routes.reduce((best, route) => score(route) > score(best) ? route : best);
    return { moveUci, label: group.label, lineCount: new Set(group.routes.map(route => route.lineId)).size,
      selected: current.line.moves[ply]?.moveUci === moveUci, target: { ...target, ply: target.ply + 1 } };
  }).sort((left, right) => Number(right.selected) - Number(left.selected) || right.lineCount - left.lineCount);
}

export function switchLineDestination(index: OpeningNavigation, fromLineId: string, ply: number, toLineId: string): {
  lineId: string; ply: number; reason: "shared" | "transposition" | "branch" | "start";
} {
  const from = index.lines.get(fromLineId)?.line;
  const to = index.lines.get(toLineId)?.line;
  if (!from || !to) return { lineId: toLineId, ply: 0, reason: "start" };
  const routes = currentPositionRoutes(index, fromLineId, ply);
  const current = routes.find(route => route.lineId === fromLineId && route.ply === ply);
  const matches = routes.filter(route => route.lineId === toLineId);
  const matched = matches.find(route => route.prefix === current?.prefix)
    ?? matches.reduce<PositionRoute | undefined>((best, route) => !best || Math.abs(route.ply - ply) < Math.abs(best.ply - ply) ? route : best, undefined);
  if (matched) return { lineId: toLineId, ply: matched.ply, reason: matched.prefix === current?.prefix ? "shared" : "transposition" };
  const shared = commonPrefixLength(from, to);
  return { lineId: toLineId, ply: Math.min(ply, shared), reason: shared ? "branch" : "start" };
}

export function otherMoveOrders(index: OpeningNavigation, lineId: string, ply: number): PositionRoute[] {
  const routes = currentPositionRoutes(index, lineId, ply);
  const current = routes.find(route => route.lineId === lineId && route.ply === ply);
  const byLine = new Map<string, PositionRoute>();
  for (const route of routes) if (route.lineId !== lineId && route.prefix !== current?.prefix && !index.lines.get(route.lineId)?.line.archived) {
    if (!byLine.has(route.lineId)) byLine.set(route.lineId, route);
  }
  return [...byLine.values()];
}
