import { useEffect, useReducer, useState, type SetStateAction } from "react";
import type { OpeningRepertoireDetailResponse, OpeningReviewActiveState } from "../../../packages/contracts/src/api";
import { get } from "./api";
import { emptyOpeningSession, nextEnabledLineId, openingSessionReducer } from "./opening-session-state";

/** Memory-session transitions and completion context stay separate from guided lessons/imports. */
export function useOpeningSession() {
  const [state, dispatch] = useReducer(openingSessionReducer, emptyOpeningSession);
  const [detail, setDetail] = useState<OpeningRepertoireDetailResponse | null>(null);
  const [contextError, setContextError] = useState("");
  const [contextLoading, setContextLoading] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const exercise = state.activeReview?.kind === "feedback" ? state.activeReview.exercise : state.activeReview;
  const repertoireId = exercise?.repertoire.id;
  useEffect(() => {
    setDetail(null);
    setContextError(""); setContextLoading(Boolean(repertoireId));
    if (!repertoireId) return;
    const controller = new AbortController();
    void get<OpeningRepertoireDetailResponse>(`/api/v1/openings/repertoires/${repertoireId}`, controller.signal)
      .then(value => { if (!controller.signal.aborted) setDetail(value); })
      .catch(() => { if (!controller.signal.aborted) setContextError("Could not load the line list. Your practice results are safe."); })
      .finally(() => { if (!controller.signal.aborted) setContextLoading(false); });
    return () => controller.abort();
  }, [repertoireId, state.activeReview?.sessionId, retryToken]);
  const lines = detail && detail.repertoire.id === repertoireId ? detail.chapters.flatMap(chapter => chapter.lines) : [];
  const nextLineId = nextEnabledLineId(lines, exercise?.lineRun?.lineId);
  return { ...state, nextLineId, contextError, contextLoading, retryContext: () => setRetryToken(value => value + 1),
    setActiveReview: (update: SetStateAction<OpeningReviewActiveState | null>) => dispatch({ type: "replace",
      review: update }),
    setReviewPaused: (paused: boolean) => dispatch({ type: "pause", paused }),
  };
}
