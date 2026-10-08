import type { OpeningCoverageResponse } from "../../../../packages/contracts/src/api.js";

export interface CoverageEdge {
  id: string; from: string; to: string; uci: string; san: string;
  role: "learner" | "opponent";
}
export interface CoverageSample {
  reliable: boolean;
  replies: Array<{ uci: string; probability: number; reliable: boolean }>;
}
type Outcome = "prepared" | "missing" | "idea" | "unprepared" | "unknown";

/** Structural scope works offline too: unknown frequencies must not hide memory gaps. */
export function coverageScope(root: string, plies: number, edges: CoverageEdge[], ownPolicy: Map<string, CoverageEdge>, boundaries: Set<string>): Set<string> {
  const outgoing = new Map<string, CoverageEdge[]>();
  for (const edge of edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  const scope = new Set<string>();
  let layer = new Set([root]);
  for (let remaining = plies; remaining > 0 && layer.size; remaining--) {
    const next = new Set<string>();
    for (const position of layer) {
      scope.add(position);
      if (boundaries.has(position)) continue;
      const own = ownPolicy.get(position);
      for (const edge of own ? [own] : outgoing.get(position) ?? []) next.add(edge.to);
    }
    layer = next;
  }
  return scope;
}

/** Partition mass at the FIRST gap under one explicit own-move policy.
 * Layered traversal bounds work by positions × depth, combining transpositions.
 * Alternative own moves never add extra probability; loops are depth-limited.
 */
export function modelCoverage(input: {
  root: string; plies: number; edges: CoverageEdge[]; ownPolicy: Map<string, CoverageEdge>;
  samples: Map<string, CoverageSample>; boundaries: Set<string>;
  decisions: Map<string, "idea" | "unprepared" | "line">;
}): { outcomes: Record<Outcome, number>; reach: Map<string, number> } {
  const outgoing = new Map<string, CoverageEdge[]>();
  for (const edge of input.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  const outcomes: Record<Outcome, number> = { prepared: 0, missing: 0, idea: 0, unprepared: 0, unknown: 0 };
  const reach = new Map<string, number>();
  let layer = new Map([[input.root, 1]]);
  for (let remaining = input.plies; remaining >= 0 && layer.size; remaining--) {
    const next = new Map<string, number>();
    const add = (position: string, mass: number) => next.set(position, (next.get(position) ?? 0) + mass);
    for (const [position, mass] of layer) {
      if (remaining === 0 || input.boundaries.has(position)) { outcomes.prepared += mass; continue; }
      const edges = outgoing.get(position) ?? [];
      const own = input.ownPolicy.get(position);
      if (own) { add(own.to, mass); continue; }
      const sample = input.samples.get(position);
      if (!sample?.reliable) { outcomes.unknown += mass; continue; }
      let represented = 0;
      for (const reply of sample.replies) {
        const probability = Math.min(reply.probability, Math.max(0, 1 - represented));
        represented += probability;
        const weight = mass * probability;
        const key = `${position}:${reply.uci}`;
        reach.set(key, Math.min(1, (reach.get(key) ?? 0) + weight));
        if (!reply.reliable) { outcomes.unknown += weight; continue; }
        const edge = edges.find(candidate => candidate.uci === reply.uci);
        if (edge && input.ownPolicy.has(edge.to)) { add(edge.to, weight); continue; }
        const choice = input.decisions.get(key);
        if (choice === "idea") outcomes.idea += weight;
        else if (choice === "unprepared") outcomes.unprepared += weight;
        else outcomes.missing += weight;
      }
      outcomes.unknown += mass * Math.max(0, 1 - represented);
    }
    layer = next;
  }
  return { outcomes, reach };
}

export function roundedModel(outcomes: Record<Outcome, number>): Pick<NonNullable<OpeningCoverageResponse["model"]>,
  "preparedPercent" | "missingPercent" | "ideaPercent" | "unpreparedPercent" | "unknownPercent"> {
  const percent = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  return { preparedPercent: percent(outcomes.prepared), missingPercent: percent(outcomes.missing),
    ideaPercent: percent(outcomes.idea), unpreparedPercent: percent(outcomes.unprepared), unknownPercent: percent(outcomes.unknown) };
}
