import { boardAnnotationPgn } from "../../../../packages/contracts/src/board-annotations.js";
import type { OpeningLineDetail, OpeningLineMove } from "../../../../packages/contracts/src/api.js";

export const pgnTag = (value: string): string => value.replace(/[\r\n]/g, " ").replaceAll("\\", "\\\\").replaceAll('"', '\\"');

interface Node { move: OpeningLineMove; children: Map<string, Node>; titles: string[] }

/** One chapter, nested RAVs. Explicit terminal labels also preserve shorter saved paths. */
export function chapterMovetext(lines: OpeningLineDetail[]): string {
  const root = new Map<string, Node>();
  for (const line of lines) {
    let children = root;
    line.moves.forEach((move, index) => {
      const key = `${move.moveUci}|${JSON.stringify(move.explanation)}`;
      let node = children.get(key);
      if (!node) { node = { move, children: new Map(), titles: [] }; children.set(key, node); }
      if (index === line.moves.length - 1) node.titles.push(line.title);
      children = node.children;
    });
  }
  const renderMove = (node: Node): string => {
    const { move } = node;
    const fields = move.fenBefore.split(" ");
    const label = `${fields[5]}${fields[1] === "w" ? "." : "..."}`;
    const missing = move.explanation.concepts.includes("missing_explanation");
    const source = move.explanation.sourceSummary ?? (missing ? "" : move.explanation.summary);
    const comment = [source.replace(/[{}]/g, "").replace(/\s+/g, " ").trim(),
      boardAnnotationPgn(move.explanation.boardAnnotations ?? []),
      move.explanation.personalComment ? `[%tbnote ${encodeURIComponent(move.explanation.personalComment)}]` : "",
      move.explanation.sourceSummary ? `[%tbexplanation ${encodeURIComponent(move.explanation.summary)}]` : "",
      ...node.titles.map(title => `[%tbline ${encodeURIComponent(title)}]`)].filter(Boolean).join(" ");
    return `${label} ${move.moveSan}${comment ? ` {${comment}}` : ""}`;
  };
  const render = (children: Map<string, Node>): string => {
    const [main, ...alternatives] = [...children.values()];
    if (!main) return "";
    return [renderMove(main), ...alternatives.map(node => `(${renderMove(node)} ${render(node.children)})`),
      render(main.children)].filter(Boolean).join(" ").trim();
  };
  return `${render(root)} *`;
}
