import { describe, expect, it } from "vitest";
import { coverageScope, modelCoverage, type CoverageEdge, type CoverageSample } from "./opening-coverage-model.js";

const edge = (from: string, to: string, uci: string, role: CoverageEdge["role"] = "opponent"): CoverageEdge =>
  ({ id: `${from}:${uci}`, from, to, uci, san: uci, role });
const sample = (...replies: Array<[string, number]>): CoverageSample => ({ reliable: true,
  replies: replies.map(([uci, probability]) => ({ uci, probability, reliable: true })) });

describe("probability-weighted repertoire preparation", () => {
  const a = edge("root", "own", "e5"); const own = edge("own", "second", "Nf3", "learner");
  const b = edge("second", "next", "Nc6"); const next = edge("next", "end", "Bc4", "learner");
  const base = () => ({ root: "root", plies: 4, edges: [a, own, b, next], ownPolicy: new Map([["own", own], ["next", next]]),
    boundaries: new Set<string>(), decisions: new Map<string, "idea" | "unprepared" | "line">(),
    samples: new Map([["root", sample(["e5", .5], ["c5", .5])], ["second", sample(["Nc6", .5], ["d6", .5])]]) });

  it("multiplies successive opponent probabilities rather than pooling sample counts", () => {
    const result = modelCoverage(base());
    expect(result.outcomes).toEqual({ prepared: .25, missing: .75, idea: 0, unprepared: 0, unknown: 0 });
    expect(result.reach.get("second:Nc6")).toBe(.25);
  });
  it("does not count a saved opponent move without our response", () => {
    const input = base(); input.ownPolicy.delete("own");
    expect(modelCoverage(input).outcomes.missing).toBe(1);
  });
  it("keeps ideas and deliberate omissions separate, without renormalising", () => {
    const input = base(); input.decisions.set("root:c5", "unprepared"); input.decisions.set("second:d6", "idea");
    expect(modelCoverage(input).outcomes).toEqual({ prepared: .25, missing: 0, idea: .25, unprepared: .5, unknown: 0 });
  });
  it("stops at an explicit boundary without inventing deeper gaps", () => {
    const input = base(); input.boundaries.add("second");
    expect(modelCoverage(input).outcomes.prepared).toBe(.5);
    expect([...coverageScope(input.root, input.plies, input.edges, input.ownPolicy, input.boundaries)])
      .toEqual(["root", "own", "second"]);
  });
  it("does not make stale, small or unrepresented samples into 0% gaps", () => {
    const input = base(); input.samples.set("second", { ...sample(["Nc6", .5]), reliable: false });
    expect(modelCoverage(input).outcomes).toMatchObject({ missing: .5, unknown: .5 });
    input.samples.set("second", sample(["Nc6", .5]));
    expect(modelCoverage(input).outcomes).toMatchObject({ prepared: .25, unknown: .25 });
  });
  it("does not add probabilities for alternative moves on our side", () => {
    const input = base(); input.edges.push(edge("own", "alternative", "Nc3", "learner"));
    expect(modelCoverage(input).outcomes.prepared).toBe(.25);
  });
  it("combines transpositions and bounds cycles by preparation depth", () => {
    const input = base(); input.edges.push(edge("root", "own", "c5"));
    expect(modelCoverage(input).outcomes.prepared).toBe(.5);
    input.edges.push(edge("second", "own", "d6"));
    input.boundaries.add("end");
    const result = modelCoverage({ ...input, plies: 30 });
    expect(Object.values(result.outcomes).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(result.outcomes.prepared).toBe(1);
  });
  it("respects the chosen horizon", () => {
    expect(modelCoverage({ ...base(), plies: 2 }).outcomes.prepared).toBe(.5);
  });
});
