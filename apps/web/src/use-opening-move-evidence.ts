import { useEffect, useState } from "react";
import type { OpeningExplorerPositionResponse, OpeningPositionAnalysisResponse } from "../../../packages/contracts/src/api";
import { get, post } from "./api";

export interface OpeningMoveEvidence {
  analysis: OpeningPositionAnalysisResponse | null;
  explorer: OpeningExplorerPositionResponse | null;
  analysisBusy: boolean;
  explorerBusy: boolean;
  analysisError: string;
  explorerError: string;
}

/** One request pair feeds both the board arrows and move-comparison panel. */
export function useOpeningMoveEvidence(fen: string, rating: number, useExplorer: boolean, enabled = true): OpeningMoveEvidence {
  const [state, setState] = useState<OpeningMoveEvidence>({ analysis: null, explorer: null,
    analysisBusy: false, explorerBusy: false, analysisError: "", explorerError: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ analysis: null, explorer: null, analysisBusy: enabled, explorerBusy: enabled && useExplorer,
      analysisError: "", explorerError: "" });
    if (!enabled) return () => controller.abort();
    const timer = window.setTimeout(() => {
      void post<OpeningPositionAnalysisResponse>("/api/v1/openings/analysis", { fen }, controller.signal)
        .then(analysis => { if (!controller.signal.aborted) setState(current => ({ ...current, analysis })); })
        .catch(error => { if (!controller.signal.aborted) setState(current => ({ ...current, analysisError: error instanceof Error ? error.message : "Stockfish analysis failed" })); })
        .finally(() => { if (!controller.signal.aborted) setState(current => ({ ...current, analysisBusy: false })); });
      if (useExplorer) void get<OpeningExplorerPositionResponse>(`/api/v1/openings/explorer?rating=${rating}&fen=${encodeURIComponent(fen)}`, controller.signal)
        .then(explorer => { if (!controller.signal.aborted) setState(current => ({ ...current, explorer })); })
        .catch(error => { if (!controller.signal.aborted) setState(current => ({ ...current, explorerError: error instanceof Error ? error.message : "Practical frequencies are unavailable" })); })
        .finally(() => { if (!controller.signal.aborted) setState(current => ({ ...current, explorerBusy: false })); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [fen, rating, useExplorer, enabled]);
  // Never display evidence from the previous position or rating while effects
  // are being cleaned up. Cancellation also rejects late successful responses.
  return { ...state, analysis: state.analysis?.fen === fen ? state.analysis : null,
    explorer: state.explorer?.fen === fen && state.explorer.ratingGroup === rating && useExplorer ? state.explorer : null };
}
