import { describe, expect, it } from "vitest";

import { CANDIDATE_GRADE_COPY, formatMoveLabel } from "./training-language";

describe("training language", () => {
  it("formats white and black move numbers without ambiguous punctuation", () => {
    expect(formatMoveLabel(19, "white", "Bb6")).toBe("19. Bb6");
    expect(formatMoveLabel(19, "black", "Bb6")).toBe("19… Bb6");
  });

  it("explains grades without requiring engine numbers", () => {
    expect(CANDIDATE_GRADE_COPY.playable.description).toContain("reasonable move");
    expect(CANDIDATE_GRADE_COPY.blunder.description).toContain("loses something important");
  });
});
