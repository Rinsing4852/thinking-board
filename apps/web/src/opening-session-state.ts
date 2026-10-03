import type { OpeningLineDetail, OpeningReviewActiveState } from "../../../packages/contracts/src/api";
export interface OpeningSessionState { activeReview: OpeningReviewActiveState | null; reviewPaused: boolean }
export type OpeningSessionAction = { type: "replace"; review: OpeningReviewActiveState | null | ((current: OpeningReviewActiveState | null) => OpeningReviewActiveState | null) }
  | { type: "pause"; paused: boolean };
export const emptyOpeningSession: OpeningSessionState = { activeReview: null, reviewPaused: false };
export function openingSessionReducer(state: OpeningSessionState, action: OpeningSessionAction): OpeningSessionState {
  if (action.type === "pause") return { ...state, reviewPaused: Boolean(state.activeReview) && action.paused };
  const review = typeof action.review === "function" ? action.review(state.activeReview) : action.review;
  return { activeReview: review, reviewPaused: review?.sessionId === state.activeReview?.sessionId ? state.reviewPaused : false };
}

export function nextEnabledLineId(lines: Pick<OpeningLineDetail, "id" | "archived" | "practiceEnabled" | "learnerDecisionCount">[], currentId?: string): string | null {
  const index = lines.findIndex(line => line.id === currentId);
  return index < 0 ? null : lines.slice(index + 1)
    .find(line => !line.archived && line.practiceEnabled !== false && line.learnerDecisionCount > 0)?.id ?? null;
}
