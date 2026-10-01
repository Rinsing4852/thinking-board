import { useEffect, useRef, useState } from "react";
import type { Color, OpeningPreparationAssessment, OpeningPreparationDecisionResponse } from "../../../../packages/contracts/src/api";
import { patch, post } from "../api";

interface Props {
  target: { fen: string; opponentMoveUci: string; learnerColor: Color; repertoireId?: string };
  initial?: OpeningPreparationAssessment | undefined;
  groupKey?: string;
  onDecision?: (response: OpeningPreparationDecisionResponse) => void;
}

/** Shared advice for game review and editing; never creates a memorisation line. */
export function OpeningPreparationAdvice({ target, initial, groupKey, onDecision }: Props) {
  const [assessment, setAssessment] = useState(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingIdea, setEditingIdea] = useState(false);
  const [note, setNote] = useState(initial?.decision?.note ?? "");
  const requestRef = useRef<AbortController | null>(null);
  const currentKey = `${target.fen}|${target.opponentMoveUci}|${target.learnerColor}|${target.repertoireId ?? ""}|${groupKey ?? ""}`;

  useEffect(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setAssessment(initial ?? null); setError(""); setEditingIdea(false); setNote(initial?.decision?.note ?? "");
    setBusy(false);
    if (!initial) {
      setBusy(true);
      void post<OpeningPreparationAssessment>("/api/v1/openings/preparation/assess", { ...target, groupKey }, controller.signal)
        .then(result => { if (!controller.signal.aborted) setAssessment(result); })
        .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not assess this reply"); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }
    return () => { controller.abort(); requestRef.current?.abort(); };
    // Targets are compared by value, not the parent's object identity.
  }, [currentKey, initial]);

  const check = async (): Promise<void> => {
    if (busy) return;
    const controller = new AbortController();
    requestRef.current?.abort(); requestRef.current = controller;
    setBusy(true); setError("");
    try {
      const result = await post<OpeningPreparationAssessment>("/api/v1/openings/preparation/assess",
        { ...target, groupKey, refresh: true, analyze: true }, controller.signal);
      if (!controller.signal.aborted) setAssessment(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not check this reply");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };

  const save = async (choice: "idea" | "unprepared"): Promise<void> => {
    if (!groupKey || busy) return;
    const controller = new AbortController();
    requestRef.current?.abort(); requestRef.current = controller;
    setBusy(true); setError("");
    try {
      const response = await patch<OpeningPreparationDecisionResponse>(`/api/v1/openings/game-inbox/${groupKey}/preparation`,
        { choice, note: choice === "idea" ? note : assessment?.decision?.note ?? "" }, controller.signal);
      if (!controller.signal.aborted) {
        setAssessment(response.assessment); setEditingIdea(false); onDecision?.(response);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not save your choice");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };

  return <section className={`opening-preparation-advice ${assessment?.priority ?? "unknown"}`} aria-label="Worth preparing?">
    <span className="eyebrow">Worth preparing?</span>
    <strong>{assessment?.title ?? "Checking available evidence…"}</strong>
    {assessment && <>
      <p className="opening-preparation-frequency">{assessment.frequency.percent === null ? "Frequency unknown" : `${assessment.frequency.percent}% of replies at this position`}
        {assessment.frequency.status === "small_sample" && " (small sample)"}
        {assessment.frequency.stale && " (older sample)"}
        {assessment.personal.occurrences > 0 && ` · seen in ${assessment.personal.occurrences} of your games`}</p>
      {assessment.decision && <p className="opening-preparation-choice"><b>Your choice:</b> {assessment.decision.choice === "idea" ? "Keep the idea, not a new line" : assessment.decision.choice === "unprepared" ? "Leave unprepared for now" : "Prepare a short line"}
        {assessment.decision.note && <span>{assessment.decision.note}</span>}</p>}
      <details><summary>Why this recommendation?</summary><p>{assessment.message}</p>
        {assessment.decision?.choice === "unprepared" && <p>Your choice stays in place. New encounters can help you reconsider; no line is added automatically.</p>}
        <ul>{assessment.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        <p>Popularity and engine quality are different. These are {assessment.frequency.ratingGroup}-band Lichess blitz, rapid and classical samples, not a forecast of your next game.</p>
      </details>
    </>}
    <div className="answer-actions">
      <button className="secondary" disabled={busy} onClick={() => void check()}>{busy ? "Checking…" : "Check frequency and replies"}</button>
      {groupKey && <>
        <button className="text-button" disabled={busy} onClick={() => setEditingIdea(value => !value)}>{editingIdea ? "Close idea editor" : "Keep an idea instead"}</button>
        <button className="text-button" disabled={busy || assessment?.decision?.choice === "unprepared"} onClick={() => void save("unprepared")}>Leave unprepared for now</button>
      </>}
    </div>
    {editingIdea && <div className="opening-preparation-note">
      <label>Idea to remember<textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={2000} placeholder="For example: take the centre, develop, and check what their move attacks." /></label>
      <p>This saves a note, not another memorisation line or review card.</p>
      <button disabled={busy || !note.trim()} onClick={() => void save("idea")}>Save idea without a line</button>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
