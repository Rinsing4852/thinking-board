import { useReducer, useRef } from "react";

export type PauseReason = "manual" | "explanation" | "comment" | "evidence";
export interface ReviewFlowState {
  request: "idle" | "pending" | "failed";
  error: string;
  pauses: Record<PauseReason, boolean>;
}
export type ReviewFlowAction = { type: "begin" | "finish" | "reset" }
  | { type: "fail"; message: string }
  | { type: "pause"; reason: PauseReason; paused: boolean };
export const initialReviewFlow: ReviewFlowState = {
  request: "idle", error: "", pauses: { manual: false, explanation: false, comment: false, evidence: false },
};
export function reviewFlowReducer(state: ReviewFlowState, action: ReviewFlowAction): ReviewFlowState {
  switch (action.type) {
    case "begin": return { ...state, request: "pending", error: "" };
    case "finish": return { ...state, request: "idle" };
    case "fail": return { ...state, request: "failed", error: action.message };
    case "reset": return initialReviewFlow;
    case "pause": return { ...state, pauses: { ...state.pauses, [action.reason]: action.paused } };
  }
}
export function useOpeningReviewFlow() {
  const [state, dispatch] = useReducer(reviewFlowReducer, initialReviewFlow);
  const locked = useRef(false);
  return {
    pending: state.request === "pending",
    paused: Object.values(state.pauses).some(Boolean),
    canAdvance: state.request === "idle" && !Object.values(state.pauses).some(Boolean),
    manualPause: state.pauses.manual,
    error: state.error,
    begin: () => {
      if (locked.current) return false;
      locked.current = true;
      dispatch({ type: "begin" });
      return true;
    },
    finish: () => { locked.current = false; dispatch({ type: "finish" }); },
    fail: (message: string) => { locked.current = false; dispatch({ type: "fail", message }); },
    reset: () => { locked.current = false; dispatch({ type: "reset" }); },
    pause: (reason: PauseReason, paused: boolean) => dispatch({ type: "pause", reason, paused }),
  };
}
