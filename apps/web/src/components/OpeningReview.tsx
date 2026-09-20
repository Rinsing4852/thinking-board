import { useEffect, useState } from "react";

import type {
  OpeningReviewActiveState,
  OpeningReviewComplete,
  OpeningReviewExercise,
  OpeningReviewFeedback,
  OpeningReviewMistakeResponse,
  OpeningReviewState,
} from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { applyUciMove, getMoveHint } from "../opening-board";
import { formatMoveLabel, formatOpeningLineContext } from "../training-language";
import { ChessBoard } from "./ChessBoard";
import { OpeningExplanation } from "./OpeningExplanation";
import { OpeningLearningComment } from "./OpeningLearningComment";

interface OpeningReviewProps {
  initial: OpeningReviewActiveState;
  onComplete: () => void;
  onPause: () => void;
}

function initialBoard(active: OpeningReviewActiveState): string {
  if (active.kind === "feedback") return active.fenAfterMove;
  return active.opponentMove ? active.fenBeforeOpponent : active.fenToMove;
}

function dueLabel(nextDueAt: string, outcome: "remembered" | "learning" | "again"): string {
  if (outcome !== "remembered") {
    return "This position has been placed back into today’s session for an unassisted recall.";
  }
  const due = new Date(nextDueAt);
  const minutesUntilDue = (due.getTime() - Date.now()) / 60_000;
  if (minutesUntilDue >= 0 && minutesUntilDue < 12 * 60) return "Next scheduled review: later today.";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (due.toDateString() === tomorrow.toDateString()) return "Next scheduled review: tomorrow.";
  return `Next scheduled review: ${due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`;
}

export function OpeningReview({ initial, onComplete, onPause }: OpeningReviewProps) {
  const initialExercise = initial.kind === "feedback" ? initial.exercise : initial;
  const [exercise, setExercise] = useState<OpeningReviewExercise>(initialExercise);
  const [feedback, setFeedback] = useState<OpeningReviewFeedback | null>(initial.kind === "feedback" ? initial : null);
  const [complete, setComplete] = useState<OpeningReviewComplete | null>(null);
  const [observing, setObserving] = useState(initial.kind === "exercise" && Boolean(initial.opponentMove));
  const [assisted, setAssisted] = useState(false);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [displayFen, setDisplayFen] = useState(initialBoard(initial));
  const [lastMove, setLastMove] = useState<string | null>(
    initial.kind === "feedback" ? initial.repertoireMove.moveUci : null,
  );
  const [moveNotice, setMoveNotice] = useState("");
  const [hintSquares, setHintSquares] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [autoAdvancePaused, setAutoAdvancePaused] = useState(false);

  const showExercise = (next: OpeningReviewExercise): void => {
    setExercise(next);
    setFeedback(null);
    setMoveNotice("");
    setHintSquares([]);
    setObserving(Boolean(next.opponentMove));
    setAssisted(false);
    setWrongAttempts(0);
    setAutoAdvancePaused(false);
    setDisplayFen(next.opponentMove ? next.fenBeforeOpponent : next.fenToMove);
    setLastMove(null);
  };

  const playOpponentMove = (): void => {
    if (!exercise.opponentMove) return;
    setDisplayFen(exercise.fenToMove);
    setLastMove(exercise.opponentMove.moveUci);
    setObserving(false);
  };

  useEffect(() => {
    if (!observing || !exercise.opponentMove) return;
    const timer = window.setTimeout(playOpponentMove, 450);
    return () => window.clearTimeout(timer);
  }, [observing, exercise.sessionId, exercise.positionNumber, exercise.opponentMove]);

  const checkMove = async (moveUci: string): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await post<OpeningReviewFeedback>(
        `/api/v1/openings/reviews/${exercise.sessionId}/move`,
        { moveUci, assisted },
      );
      setMoveNotice("");
      setHintSquares([]);
      setFeedback(result);
      setDisplayFen(result.fenAfterMove);
      setLastMove(result.repertoireMove.moveUci);
      window.dispatchEvent(new Event("training-completed"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not check this opening move");
    } finally {
      setSubmitting(false);
    }
  };

  const showProgressiveHint = (attemptNumber: number, playedSan: string): void => {
    const expected = exercise.introduction.repertoireMove;
    const hint = getMoveHint(exercise.fenToMove, expected.moveUci);
    setWrongAttempts(attemptNumber);
    setAssisted(true);
    if (attemptNumber <= 1) {
      setHintSquares([hint.square]);
      setMoveNotice(`${playedSan} is not in your repertoire here. Try the highlighted ${hint.piece}.`);
      return;
    }
    const destination = expected.moveUci.slice(2, 4);
    setHintSquares([hint.square, destination]);
    setMoveNotice(`Try ${expected.moveSan}: move the ${hint.piece} from ${hint.square} to ${destination}.`);
  };

  const playRecallMove = (uci: string, san: string): void => {
    if (submitting) return;
    const accepted = exercise.acceptedMoves.some((move) => move.moveUci === uci);
    if (!accepted) {
      const nextAttempt = wrongAttempts + 1;
      showProgressiveHint(nextAttempt, san);
      setDisplayFen(exercise.fenToMove);
      setLastMove(exercise.opponentMove?.moveUci ?? null);
      setSubmitting(true);
      setError("");
      void post<OpeningReviewMistakeResponse>(
        `/api/v1/openings/reviews/${exercise.sessionId}/mistakes`,
        { moveUci: uci },
      ).then((result) => {
        if (result.attemptNumber !== nextAttempt) showProgressiveHint(result.attemptNumber, san);
      }).catch((failure) => {
        setError(failure instanceof Error ? failure.message : "Could not record this attempt");
      }).finally(() => setSubmitting(false));
      return;
    }
    setDisplayFen(applyUciMove(exercise.fenToMove, uci));
    setLastMove(uci);
    void checkMove(uci);
  };

  const revealMove = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await post<OpeningReviewFeedback>(
        `/api/v1/openings/reviews/${exercise.sessionId}/reveal`,
      );
      setFeedback(result);
      setDisplayFen(result.fenAfterMove);
      setLastMove(result.repertoireMove.moveUci);
      window.dispatchEvent(new Event("training-completed"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not reveal this opening move");
    } finally {
      setSubmitting(false);
    }
  };

  const continueReview = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const next = await post<OpeningReviewState>(
        `/api/v1/openings/reviews/${exercise.sessionId}/continue`,
      );
      if (next.kind === "complete") setComplete(next);
      else showExercise(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not continue the opening review");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!feedback || autoAdvancePaused || submitting) return;
    const delay = feedback.outcome === "remembered" ? 1600 : 2800;
    const timer = window.setTimeout(() => void continueReview(), delay);
    return () => window.clearTimeout(timer);
  }, [feedback, autoAdvancePaused, submitting]);

  const updateLearningComment = (comment: string | null): void => {
    setExercise((current) => ({
      ...current,
      introduction: {
        ...current.introduction,
        explanation: { ...current.introduction.explanation, personalComment: comment },
      },
    }));
    setFeedback((current) => current ? {
      ...current,
      explanation: { ...current.explanation, personalComment: comment },
      exercise: {
        ...current.exercise,
        introduction: {
          ...current.exercise.introduction,
          explanation: { ...current.exercise.introduction.explanation, personalComment: comment },
        },
      },
    } : current);
  };

  if (complete) {
    return (
      <div className="panel opening-complete" role="status">
        <span className="eyebrow">Practice complete</span>
        <h3>{complete.repertoireName}</h3>
        <p>{complete.message}</p>
        <div className="opening-complete-scores three-up">
          <div><strong>{complete.remembered}</strong><span>unassisted recalls</span></div>
          <div><strong>{complete.introduced}</strong><span>answers shown or helped</span></div>
          <div><strong>{complete.lapses}</strong><span>moves to revisit</span></div>
        </div>
        <button onClick={onComplete}>Back to opening choices</button>
      </div>
    );
  }

  const showingReference = Boolean(feedback);
  const referenceSan = feedback?.repertoireMove.moveSan ?? exercise.introduction.repertoireMove.moveSan;

  return (
    <div className="opening-lesson opening-review">
      <div className="opening-lesson-title panel">
        <div>
          <span className="eyebrow">Today’s opening practice</span>
          <h3>{exercise.repertoire.name}</h3>
          <p>Play continuously on the board. Replies, checking and the next position happen automatically.</p>
        </div>
        <div className="opening-progress">
          <div className="opening-progress-topline">
            <span>Step {exercise.positionNumber} of {exercise.totalPositions}</span>
            <button className="text-button" onClick={onPause}>Pause</button>
          </div>
          <progress aria-label={`Opening practice progress: step ${exercise.positionNumber} of ${exercise.totalPositions}`} value={exercise.positionNumber - 1} max={exercise.totalPositions} />
          <small>{exercise.presentationKind === "lapse_repeat"
            ? "Unassisted retry"
            : exercise.learningStage === "new" ? "New move · learn by playing" : "Scheduled by memory strength"}</small>
        </div>
      </div>

      <div className="trainer-layout opening-trainer-layout">
        <div className="board-column">
          <div className="candidate-banner">
            <div>
              <span>{observing
                ? "Before the opponent’s move"
                : showingReference ? "Repertoire move shown" : `${exercise.learnerColor === "white" ? "White" : "Black"} to move`}</span>
              <small>You are {exercise.learnerColor}. Your side is nearest.</small>
            </div>
            <strong>{showingReference
              ? formatMoveLabel(exercise.moveNumber, exercise.learnerColor, referenceSan)
              : formatMoveLabel(exercise.moveNumber, exercise.learnerColor)}</strong>
          </div>
          <div className="board-toolbar">
            <span>{observing
              ? "Notice what their move changes"
              : feedback
                ? "The repertoire response is displayed"
                : submitting ? "Checking your move…" : "Your turn — play on the board"}</span>
          </div>
          <div className="opening-line-context" aria-label="Moves leading to this position">
            <span>Position reached after</span>
            <strong>{formatOpeningLineContext(exercise.movesBefore)}</strong>
          </div>
          <ChessBoard
            fen={displayFen}
            orientation={exercise.learnerColor}
            interactive={!observing && !feedback && !submitting}
            lastMove={lastMove}
            highlightedSquares={hintSquares}
            onMove={playRecallMove}
          />
        </div>

        <div className="panel question-card opening-question-card" aria-live="polite">
          <span className="step-number">OPENING</span>
          {observing && exercise.opponentMove && (
            <>
              <span className="eyebrow">SEE</span>
              <h3>Watch the reply.</h3>
              <p className="instruction">Notice what changed. {exercise.opponentMove.moveSan} is playing automatically.</p>
            </>
          )}

          {!observing && !feedback && (
            <>
              <span className="eyebrow">{exercise.learningStage === "new" ? "LEARN" : "YOUR MOVE"}</span>
              <h3>{exercise.learningStage === "new" ? "Find the move from its purpose." : exercise.prompt}</h3>
              {exercise.learningStage === "new" && (
                <div className="opening-preview-summary opening-purpose-cue">
                  <strong>Why this move belongs</strong>
                  <p>{exercise.introduction.explanation.summary}</p>
                </div>
              )}
              <p className="instruction">Play directly on the board. Correct moves continue automatically; a mistake gives you progressively clearer help.</p>
              {moveNotice && (
                <div className="opening-move-result outside_repertoire" role="status">
                  <strong>{wrongAttempts > 1 ? "Here is the move" : "Try again"}</strong>
                  <p>{moveNotice}</p>
                </div>
              )}
              <button className="text-button opening-show-answer" disabled={submitting} onClick={() => void revealMove()}>
                Show answer
              </button>
            </>
          )}

          {feedback && (
            <div className={`feedback ${feedback.outcome === "remembered" ? "excellent" : feedback.outcome === "learning" ? "partial" : "incorrect"}`} role="status">
              <span className="feedback-label">{feedback.outcome === "remembered"
                ? feedback.recallSpeed === "slow" ? "Remembered — building fluency" : "Remembered"
                : feedback.outcome === "learning" ? "Learning" : "Review again"}</span>
              <h3>{feedback.repertoireMove.moveSan}</h3>
              <p>{feedback.message}</p>
              <p className="opening-feedback-summary"><strong>Why:</strong> {feedback.explanation.summary}</p>
              <details
                className="opening-feedback-details"
                onToggle={(event) => setAutoAdvancePaused(event.currentTarget.open)}
              >
                <summary>See the full explanation</summary>
                <OpeningExplanation explanation={feedback.explanation} showSummary={false} showPersonalComment={false} />
              </details>
              <OpeningLearningComment
                repertoireId={exercise.repertoire.id}
                moveId={exercise.introduction.repertoireMove.moveId}
                comment={feedback.explanation.personalComment}
                onEditingChange={setAutoAdvancePaused}
                onSaved={updateLearningComment}
              />
              <p className="opening-next-due">{dueLabel(feedback.nextDueAt, feedback.outcome)}</p>
              <div className="answer-actions opening-feedback-actions">
                <span className="opening-flow-status">{autoAdvancePaused ? "Auto-advance paused" : "Next position is loading automatically…"}</span>
                {!autoAdvancePaused && <button className="text-button" onClick={() => setAutoAdvancePaused(true)}>Keep this open</button>}
                <button className="text-button" disabled={submitting} onClick={() => void continueReview()}>
                  {submitting ? "Loading…" : "Next position"}
                </button>
              </div>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
