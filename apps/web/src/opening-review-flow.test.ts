import { describe, expect, it } from "vitest";
import { initialReviewFlow, reviewFlowReducer } from "./opening-review-flow";

describe("opening practice flow", () => {
  it("keeps a manual pause when an explanation or editor closes", () => {
    let state = reviewFlowReducer(initialReviewFlow, { type: "pause", reason: "manual", paused: true });
    state = reviewFlowReducer(state, { type: "pause", reason: "explanation", paused: true });
    state = reviewFlowReducer(state, { type: "pause", reason: "explanation", paused: false });
    state = reviewFlowReducer(state, { type: "pause", reason: "comment", paused: false });
    expect(state.pauses.manual).toBe(true);
  });
  it("stops automatic retries after a failed request and allows a deliberate retry", () => {
    const failed = reviewFlowReducer(initialReviewFlow, { type: "fail", message: "Offline" });
    expect(failed.request).toBe("failed");
    expect(reviewFlowReducer(failed, { type: "begin" })).toMatchObject({ request: "pending", error: "" });
    expect(reviewFlowReducer(failed, { type: "reset" })).toEqual(initialReviewFlow);
  });
});
