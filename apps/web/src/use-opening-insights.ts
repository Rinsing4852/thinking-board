import { useCallback, useEffect, useRef, useState } from "react";
import type { OpeningProgressResponse, OpeningReviewRecommendation } from "../../../packages/contracts/src/api";
import { get } from "./api";

/** Optional summaries never gate the library or restoration of a saved session. */
export function useOpeningInsights() {
  const [recommendation, setRecommendation] = useState<OpeningReviewRecommendation | null>(null);
  const [progress, setProgress] = useState<OpeningProgressResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    request.current?.abort(); request.current = null;
    setLoading(false); setError("");
  }, []);
  useEffect(() => () => request.current?.abort(), []);
  const load = useCallback(async (parentSignal?: AbortSignal): Promise<OpeningReviewRecommendation | null | undefined> => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const signal = parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal;
    setLoading(true); setError("");
    const current = () => !signal.aborted && request.current === controller;
    const results = await Promise.allSettled([
      get<OpeningReviewRecommendation>("/api/v1/openings/reviews/recommended", signal)
        .then(value => { if (current()) setRecommendation(value); return value; }),
      get<OpeningProgressResponse>("/api/v1/openings/progress", signal)
        .then(value => { if (current()) setProgress(value); return value; }),
    ]);
    if (!current()) return undefined;
    setLoading(false);
    const failures = [results[0].status === "rejected" ? "Practice suggestions" : "",
      results[1].status === "rejected" ? "Opening statistics" : ""].filter(Boolean);
    if (failures.length) setError(`${failures.join(" and ")} could not be refreshed. Your repertoire library is still available.`);
    return results[0].status === "fulfilled" ? results[0].value : null;
  }, []);
  return { recommendation, setRecommendation, progress, setProgress, loading, error, load, cancel };
}
