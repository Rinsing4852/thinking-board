import { useEffect, useState } from "react";

import type {
  CandidateGenerationAnswerResponse,
  CandidateGenerationExercise,
  CandidateSubmission,
  CandidateType,
  EmptyTrainingResponse,
  NextCandidateGenerationResponse,
} from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { ChessBoard } from "./ChessBoard";

const TYPES: Array<{ value: CandidateType; label: string; order: number }> = [
  { value: "check", label: "Checks", order: 1 },
  { value: "capture", label: "Captures", order: 2 },
  { value: "threat", label: "Threats", order: 3 },
  { value: "improve", label: "Improve weakest piece", order: 4 },
];

interface EnteredCandidate extends CandidateSubmission {
  moveSan: string;
}

interface CandidateGenerationPanelProps {
  refreshToken: number;
  requestedItemId?: string | undefined;
  sessionId?: string | undefined;
  onCompleted: () => void;
}

export function CandidateGenerationPanel({ refreshToken, requestedItemId, sessionId, onCompleted }: CandidateGenerationPanelProps) {
  const [exercise, setExercise] = useState<CandidateGenerationExercise | null>(null);
  const [empty, setEmpty] = useState<EmptyTrainingResponse | null>(null);
  const [phase, setPhase] = useState<"ready" | "generate" | "feedback">("ready");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [selectedType, setSelectedType] = useState<CandidateType>("check");
  const [candidates, setCandidates] = useState<EnteredCandidate[]>([]);
  const [feedback, setFeedback] = useState<CandidateGenerationAnswerResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadNext = async (pool = "due"): Promise<void> => {
    setError("");
    setFeedback(null);
    setCandidates([]);
    setSelectedType("check");
    try {
      const result = await post<NextCandidateGenerationResponse>("/api/v1/training/candidates/next", { pool: requestedItemId ? "early" : pool, itemId: requestedItemId });
      if (result.kind === "empty") {
        setExercise(null);
        setEmpty(result);
        return;
      }
      setEmpty(null);
      setExercise(result);
      setOrientation(result.playerColor);
      setPhase("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load exercise");
    }
  };

  useEffect(() => { void loadNext(); }, [refreshToken, requestedItemId]);

  const start = async (): Promise<void> => {
    if (!exercise) return;
    try {
      const started = await post<{ attemptId: string }>(`/api/v1/training/items/${exercise.itemId}/start`, { sessionId });
      setExercise({ ...exercise, attemptId: started.attemptId });
      setPhase("generate");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start exercise");
    }
  };

  const addCandidate = (moveUci: string, moveSan: string): void => {
    if (candidates.length >= 3 || candidates.some((candidate) => candidate.moveUci === moveUci)) return;
    setCandidates((current) => [...current, { moveUci, moveSan, declaredType: selectedType }]);
  };

  const submit = async (): Promise<void> => {
    if (!exercise?.attemptId || candidates.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<CandidateGenerationAnswerResponse>(
        `/api/v1/training/candidates/attempts/${exercise.attemptId}/answer`,
        { candidates: candidates.map(({ moveUci, declaredType }) => ({ moveUci, declaredType })) },
      );
      setFeedback(result);
      setPhase("feedback");
      window.dispatchEvent(new Event("training-completed"));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not grade candidates");
    } finally {
      setBusy(false);
    }
  };

  const reveal = async (): Promise<void> => {
    if (!exercise?.attemptId) return;
    setBusy(true);
    try {
      const result = await post<CandidateGenerationAnswerResponse>(
        `/api/v1/training/candidates/attempts/${exercise.attemptId}/reveal`,
      );
      setFeedback(result);
      setPhase("feedback");
      window.dispatchEvent(new Event("training-completed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="training-section candidate-generation-section" id="candidate-generation">
      <div className="training-copy">
        <span className="eyebrow">Breadth before calculation</span>
        <h2>Candidate Generation</h2>
        <p>Find up to three legal ideas in order: checks, captures, threats, then improve your weakest piece.</p>
      </div>

      {empty && (
        <div className="panel empty-training">
          <h3>{empty.message}</h3>
          {empty.options.length > 0 && (
            <div className="fallback-actions">
              {empty.options.map((option) => (
                <button key={option.pool} className="secondary" onClick={() => void loadNext(option.pool)}>
                  {option.label} <span>{option.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {exercise && (
        <div className="trainer-layout">
          <div className="board-column">
            <div className="candidate-banner">
              <div>
                <span>Position from your game</span>
                <small>You are {exercise.playerColor}. {orientation === exercise.playerColor ? "Your side is nearest." : "Board flipped."}</small>
              </div>
              <strong>{exercise.moveNumber}.{exercise.playerColor === "black" ? "…" : ""}</strong>
            </div>
            <div className="board-toolbar">
              <span>{phase === "generate" ? `${candidates.length}/3 candidates entered` : phase === "feedback" ? "Engine comparison complete" : "Engine evaluation hidden"}</span>
              <button className="text-button" onClick={() => setOrientation(orientation === "white" ? "black" : "white")}>Flip board</button>
            </div>
            <ChessBoard
              fen={exercise.fen}
              orientation={orientation}
              interactive={phase === "generate" && candidates.length < 3 && !busy}
              onMove={addCandidate}
            />
          </div>

          <div className="panel question-card candidate-question-card">
            <span className="step-number">02</span>
            <span className="eyebrow">{phase === "ready" ? "CANDIDATES" : phase === "feedback" ? "COMPARE" : "GENERATE"}</span>
            {phase === "ready" && (
              <div className="ready-step">
                <h3>{exercise.prompt}</h3>
                <p className="instruction">Do not hunt for one perfect move. Build a short list before calculating deeply.</p>
                <button onClick={() => void start()}>Start generating candidates</button>
              </div>
            )}

            {phase === "generate" && (
              <>
                <h3>What moves deserve calculation?</h3>
                <div className="candidate-type-list">
                  {TYPES.map((type) => (
                    <button
                      key={type.value}
                      className={selectedType === type.value ? "candidate-type active" : "candidate-type"}
                      onClick={() => setSelectedType(type.value)}
                    >
                      <span>{type.order}</span>{type.label}
                    </button>
                  ))}
                </div>
                <p className="instruction">Choose a type, then move a piece on the board. The position resets after each candidate.</p>
                <div className="entered-candidates">
                  {candidates.length === 0 && <span>No candidates entered yet.</span>}
                  {candidates.map((candidate) => (
                    <div key={candidate.moveUci}>
                      <strong>{candidate.moveSan}</strong>
                      <span>{TYPES.find((type) => type.value === candidate.declaredType)?.label}</span>
                      <button
                        className="inline-link"
                        onClick={() => setCandidates((current) => current.filter((item) => item.moveUci !== candidate.moveUci))}
                      >Remove</button>
                    </div>
                  ))}
                </div>
                <div className="answer-actions">
                  <button disabled={candidates.length === 0 || busy} onClick={() => void submit()}>
                    {busy ? "Stockfish is grading…" : "Grade my candidates"}
                  </button>
                  <button className="text-button" disabled={busy} onClick={() => void reveal()}>Show engine candidates</button>
                </div>
              </>
            )}

            {feedback && (
              <div className={`feedback ${feedback.outcome}`} role="status">
                <span className="feedback-label">{feedback.outcome === "excellent" ? "Strong list" : feedback.outcome === "partial" ? "Mixed list" : "Try again"}</span>
                <h3>Your candidates</h3>
                {feedback.candidates.length === 0 && <p>You revealed the engine candidates before submitting your own.</p>}
                <div className="candidate-results">
                  {feedback.candidates.map((candidate) => (
                    <div key={candidate.moveUci}>
                      <strong>{candidate.moveSan}</strong>
                      <span className={`grade ${candidate.grade}`}>{candidate.grade}</span>
                      <small>{candidate.centipawnLoss} cp from best</small>
                    </div>
                  ))}
                </div>
                <h4>Strong engine candidates</h4>
                <div className="engine-candidates">
                  {feedback.engineCandidates.map((candidate) => (
                    <span key={candidate.moveUci}><strong>{candidate.moveSan}</strong> · {candidate.grade}</span>
                  ))}
                </div>
                <p>{feedback.explanation}</p>
                <div className="checklist-feedback">
                  <span>Thinking-process skill: Candidate generation</span>
                  <p>{feedback.checklistPoint}</p>
                </div>
                <button onClick={() => sessionId ? onCompleted() : void loadNext()}>{sessionId ? "Continue session" : "Next position"}</button>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
