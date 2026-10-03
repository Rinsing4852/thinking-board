import { describe, expect, it } from "vitest";
import { parseOpeningDraft } from "./opening-draft";
import { hasOpeningReason, meaningfulOpeningText } from "./opening-explanation";

describe("opening drafts and human explanations", () => {
  it("replays a recovered draft rather than trusting its stored board", () => {
    const draft = parseOpeningDraft(JSON.stringify({ name: "White notes", learnerColor: "white",
      moves: [{ moveUci: "e2e4", note: "Free the bishop", fenBefore: "wrong", fenAfter: "wrong" }] }));
    expect(draft?.moves[0]).toMatchObject({ moveSan: "e4", note: "Free the bishop" });
    expect(draft?.moves[0]?.fenAfter).toContain("4P3");
  });
  it("rejects malformed or illegal draft moves without trusting browser storage", () => {
    expect(parseOpeningDraft("broken")).toBeNull();
    expect(parseOpeningDraft(JSON.stringify({ name: "Draft", learnerColor: "white",
      moves: [{ moveUci: "e2e5", note: "bad" }] }))).toBeNull();
    expect(parseOpeningDraft(JSON.stringify({ name: "Draft", learnerColor: "both", moves: [] }))).toBeNull();
  });
  it("hides storage boilerplate but keeps actual chess reasons", () => {
    expect(meaningfulOpeningText("Your imported note is attached to e4.")).toBeNull();
    expect(meaningfulOpeningText("The repertoire continues with Nf3.")).toBeNull();
    expect(meaningfulOpeningText("Use your note as the starting point, then add your own plan.")).toBeNull();
    expect(meaningfulOpeningText("Develop the knight and prepare castling.")).toContain("castling");
    expect(hasOpeningReason("No explanation has been added for e4 yet.")).toBe(false);
    expect(hasOpeningReason("e5 is an opponent response from the imported PGN.")).toBe(false);
    expect(hasOpeningReason("Attack the central pawn.")).toBe(true);
  });
});
