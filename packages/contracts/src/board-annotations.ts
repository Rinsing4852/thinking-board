import type { OpeningBoardAnnotation } from "./api.js";
const colors = { G: "green", R: "red", B: "blue", Y: "yellow" } as const;
export function parseBoardAnnotations(comment: string): OpeningBoardAnnotation[] {
  const annotations: OpeningBoardAnnotation[] = [];
  for (const match of comment.matchAll(/\[%(csl|cal)\s+([^\]]*)\]/g)) {
    for (const value of match[2]!.split(",")) {
      const mark = value.trim().match(match[1] === "csl" ? /^([GRBY])([a-h][1-8])$/ : /^([GRBY])([a-h][1-8])([a-h][1-8])$/);
      if (!mark) continue;
      const item = { color: colors[mark[1] as keyof typeof colors], from: mark[2]!, to: mark[3] ?? mark[2]! };
      if (!annotations.some(other => other.color === item.color && other.from === item.from && other.to === item.to)) annotations.push(item);
      if (annotations.length === 64) return annotations;
    }
  }
  return annotations;
}
export function boardAnnotationPgn(annotations: readonly OpeningBoardAnnotation[]): string {
  const key = { green: "G", red: "R", blue: "B", yellow: "Y" };
  const squares: string[] = [], arrows: string[] = [];
  for (const item of annotations.slice(0, 64)) {
    if (!/^[a-h][1-8]$/.test(item.from) || !/^[a-h][1-8]$/.test(item.to) || !key[item.color]) continue;
    (item.from === item.to ? squares : arrows).push(`${key[item.color]}${item.from}${item.from === item.to ? "" : item.to}`);
  }
  return [squares.length ? `[%csl ${squares.join(",")}]` : "", arrows.length ? `[%cal ${arrows.join(",")}]` : ""].filter(Boolean).join(" ");
}
