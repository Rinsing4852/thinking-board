import { useState } from "react";
import { Chess } from "chess.js";

import type {
  OpeningReviewActiveState,
  OpeningReviewComplete,
  OpeningReviewExercise,
  OpeningReviewFeedback,
  OpeningReviewState,
} from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { formatMoveLabel, formatOpeningLineContext } from "../training-language";
import { ChessBoard } from "./ChessBoard";
import { OpeningExplanation } from "./OpeningExplanation";

interface OpeningReviewProps {
  initial: OpeningReviewActiveState;
  onComplete: () => void;
  onPause: () => void;
}

type StudyPhase = "introduction" | "demonstration" | "recall";

function afterMove(fen: string, moveUci: string): string {
  const chess = new Chess(fen);
  chess.move({
    from: moveUci.slice(0, 2),
    to: moveUci.slice(2, 4),
    ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
  });
  return chess.fen();
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

function firstStudyPhase(exercise: OpeningReviewExercise): StudyPhase {
  return exercise.learningStage === "new" ? "introduction" : "recall";
}

export function OpeningReview({ initial, onComplete, onPause }: OpeningReviewProps) {
  const initialExercise = initial.kind === "feedback" ? initial.exercise : initial;
  const [exercise, setExercise] = useState<OpeningReviewExercise>(initialExercise);
  const [feedback, setFeedback] = useState<OpeningReviewFeedback | null>(initial.kind === "feedback" ? initial : null);
  const [complete, setComplete] = useState<OpeningReviewComplete | null>(null);
  const [observing, setObserving] = useState(initial.kind === "exercise" && Boolean(initial.opponentMove));
  const [studyPhase, setStudyPhase] = useState<StudyPhase>(firstStudyPhase(initialExercise));
  const [assisted, setAssisted] = useState(false);
  const [displayFen, setDisplayFen] = useState(initialBoard(initial));
  const [lastMove, setLastMove] = useState<string | null>(
    initial.kind === "feedback" ? initial.repertoireMove.moveUci : null,
  );
  const [proposedMove, setProposedMove] = useState<{ uci: string; san: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const showExercise = (next: OpeningReviewExercise): void => {
    setExercise(next);
    setFeedback(null);
    setProposedMove(null);
    setObserving(Boolean(next.opponentMove));
    setStudyPhase(firstStudyPhase(next));
    setAssisted(false);
    setDisplayFen(next.opponentMove ? next.fenBeforeOpponent : next.fenToMove);
    setLastMove(null);
  };

  const playOpponentMove = (): void => {
    if (!exercise.opponentMove) return;
    setDisplayFen(exercise.fenToMove);
    setLastMove(exercise.opponentMove.moveUci);
    setObserving(false);
  };

  const previewMove = (uci: string, san: string): void => {
    setProposedMove({ uci, san });
    setDisplayFen(afterMove(exercise.fenToMove, uci));
    setLastMove(uci);
  };

  const demonstrateMove = (): void => {
    setStudyPhase("demonstration");
    setAssisted(true);
    setDisplayFen(exercise.introduction.fenAfterMove);
    setLastMove(exercise.introduction.repertoireMove.moveUci);
  };

  const beginRecall = (usedHelp: boolean): void => {
    setStudyPhase("recall");
    setAssisted(usedHelp);
    setProposedMove(null);
    setDisplayFen(exercise.fenToMove);
    setLastMove(exercise.opponentMove?.moveUci ?? null);
  };

  const changeMove = (): void => {
    setProposedMove(null);
    setDisplayFen(exercise.fenToMove);
    setLastMove(exercise.opponentMove?.moveUci ?? null);
  };

  const checkMove = async (): Promise<void> => {
    if (!proposedMove || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await post<OpeningReviewFeedback>(
        `/api/v1/openings/reviews/${exercise.sessionId}/move`,
        { moveUci: proposedMove.uci, assisted },
      );
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

  const showingReference = Boolean(feedback) || studyPhase === "demonstration";
  const referenceSan = feedback?.repertoireMove.moveSan ?? exercise.introduction.repertoireMove.moveSan;

  return (
    <div className="opening-lesson opening-review">
      <div className="opening-lesson-title panel">
        <div>
          <span className="eyebrow">Today’s opening practice</span>
          <h3>{exercise.repertoire.name}</h3>
          <p>{exercise.learningStage === "new"
            ? "Understand each new move, then reproduce it from memory. Assisted moves return later for a genuine recall."
            : "Recall the move before seeing the explanation. A miss will return later in this session."}</p>
        </div>
        <div className="opening-progress">
          <div className="opening-progress-topline">
            <span>Step {exercise.positionNumber} of {exercise.totalPositions}</span>
            <button className="text-button" onClick={onPause}>Pause</button>
          </div>
          <progress aria-label={`Opening practice progress: step ${exercise.positionNumber} of ${exercise.totalPositions}`} value={exercise.positionNumber - 1} max={exercise.totalPositions} />
          <small>{exercise.presentationKind === "lapse_repeat"
            ? "Unassisted retry"
            : exercise.learningStage === "new" ? "New position: learn before recalling" : "Scheduled by memory strength"}</small>
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
                : studyPhase === "demonstration"
                  ? "Study where the move goes and what it achieves"
                  : proposedMove ? `You selected ${proposedMove.san}` : studyPhase === "recall" ? "Click a piece, then its destination" : "Read the idea before revealing the move"}</span>
          </div>
          <div className="opening-line-context" aria-label="Moves leading to this position">
            <span>Position reached after</span>
            <strong>{formatOpeningLineContext(exercise.movesBefore)}</strong>
          </div>
          <ChessBoard
            fen={displayFen}
            orientation={exercise.learnerColor}
            interactive={!observing && !feedback && studyPhase === "recall" && !proposedMove}
            lastMove={lastMove}
            onMove={previewMove}
          />
        </div>

        <div className="panel question-card opening-question-card" aria-live="polite">
          <span className="step-number">OPENING</span>
          {observing && exercise.opponentMove && (
            <>
              <span className="eyebrow">SEE</span>
              <h3>What is the opponent about to change?</h3>
              <p className="instruction">Look for attacks, loosened defenders and new threats. Then reveal their move and decide how your repertoire responds.</p>
              <button onClick={playOpponentMove}>Play {exercise.opponentMove.moveSan}</button>
            </>
          )}

          {!observing && !feedback && studyPhase === "introduction" && (
            <>
              <span className="eyebrow">LEARN</span>
              <h3>This is a new repertoire position.</h3>
              <p className="instruction">First understand the move and its purpose. You will then reproduce it on the board without the answer showing.</p>
              <div className="opening-preview-summary">
                <strong>The idea to remember</strong>
                <p>{exercise.introduction.explanation.summary}</p>
              </div>
              <div className="answer-actions opening-introduction-actions">
                <button onClick={demonstrateMove}>Show the repertoire move</button>
                <button className="secondary" onClick={() => beginRecall(false)}>I already know it — test me</button>
              </div>
            </>
          )}

          {!observing && !feedback && studyPhase === "demonstration" && (
            <>
              <span className="eyebrow">UNDERSTAND</span>
              <h3>{exercise.introduction.repertoireMove.moveSan}</h3>
              <OpeningExplanation explanation={exercise.introduction.explanation} />
              <button onClick={() => beginRecall(true)}>Now try it from memory</button>
            </>
          )}

          {!observing && !feedback && studyPhase === "recall" && (
            <>
              <span className="eyebrow">RECALL</span>
              <h3>{exercise.prompt}</h3>
              <p className="instruction">Play the move on the board. Only an answer made without help counts as remembered.</p>
              {proposedMove && (
                <div className="selected-answer">
                  Your move: <strong>{proposedMove.san}</strong>
                  <button className="inline-link" disabled={submitting} onClick={changeMove}>change</button>
                </div>
              )}
              <div className="answer-actions">
                <button disabled={!proposedMove || submitting} onClick={() => void checkMove()}>
                  {submitting ? "Checking…" : "Check my move"}
                </button>
                <button className="secondary" disabled={submitting} onClick={() => void revealMove()}>
                  I don’t know — show me
                </button>
              </div>
            </>
          )}

          {feedback && (
            <div className={`feedback ${feedback.outcome === "remembered" ? "excellent" : feedback.outcome === "learning" ? "partial" : "incorrect"}`} role="status">
              <span className="feedback-label">{feedback.outcome === "remembered"
                ? feedback.recallSpeed === "slow" ? "Remembered — building fluency" : "Remembered"
                : feedback.outcome === "learning" ? "Learning" : "Review again"}</span>
              <h3>{feedback.repertoireMove.moveSan}</h3>
              <p>{feedback.message}</p>
              <OpeningExplanation explanation={feedback.explanation} />
              <p className="opening-next-due">{dueLabel(feedback.nextDueAt, feedback.outcome)}</p>
              <button disabled={submitting} onClick={() => void continueReview()}>
                {submitting ? "Continuing…" : "Continue"}
              </button>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
