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

type StudyPhase = "introduction" | "demonstration" | "recall";

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
  const [moveNotice, setMoveNotice] = useState("");
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [autoAdvance, setAutoAdvance] = useState(() => window.localStorage.getItem("opening-auto-advance") !== "false");
  const [autoAdvancePaused, setAutoAdvancePaused] = useState(false);

  const showExercise = (next: OpeningReviewExercise): void => {
    setExercise(next);
    setFeedback(null);
    setMoveNotice("");
    setHintSquare(null);
    setObserving(Boolean(next.opponentMove));
    setStudyPhase(firstStudyPhase(next));
    setAssisted(false);
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
    const timer = window.setTimeout(playOpponentMove, 650);
    return () => window.clearTimeout(timer);
  }, [observing, exercise.sessionId, exercise.positionNumber, exercise.opponentMove]);

  const demonstrateMove = (): void => {
    setStudyPhase("demonstration");
    setAssisted(true);
    setDisplayFen(exercise.introduction.fenAfterMove);
    setLastMove(exercise.introduction.repertoireMove.moveUci);
  };

  const beginRecall = (usedHelp: boolean): void => {
    setStudyPhase("recall");
    setAssisted(usedHelp);
    setMoveNotice("");
    setHintSquare(null);
    setDisplayFen(exercise.fenToMove);
    setLastMove(exercise.opponentMove?.moveUci ?? null);
  };

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
      setHintSquare(null);
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

  const playRecallMove = (uci: string, san: string): void => {
    if (submitting) return;
    const accepted = exercise.acceptedMoves.some((move) => move.moveUci === uci);
    if (!accepted) {
      const hint = getMoveHint(exercise.fenToMove, exercise.introduction.repertoireMove.moveUci);
      setAssisted(true);
      setMoveNotice(`${san} is not in your repertoire here. Try again — move the ${hint.piece}.`);
      setHintSquare(hint.square);
      setDisplayFen(exercise.fenToMove);
      setLastMove(exercise.opponentMove?.moveUci ?? null);
      setSubmitting(true);
      setError("");
      void post<OpeningReviewMistakeResponse>(
        `/api/v1/openings/reviews/${exercise.sessionId}/mistakes`,
        { moveUci: uci },
      ).catch((failure) => {
        setError(failure instanceof Error ? failure.message : "Could not record this attempt");
      }).finally(() => setSubmitting(false));
      return;
    }
    setDisplayFen(applyUciMove(exercise.fenToMove, uci));
    setLastMove(uci);
    void checkMove(uci);
  };

  const showPieceHint = (): void => {
    const hint = getMoveHint(exercise.fenToMove, exercise.introduction.repertoireMove.moveUci);
    setAssisted(true);
    setHintSquare(hint.square);
    setMoveNotice(`Hint: move the ${hint.piece} on ${hint.square}.`);
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
    if (!feedback || feedback.outcome !== "remembered" || !autoAdvance || autoAdvancePaused || submitting) return;
    const timer = window.setTimeout(() => void continueReview(), 1500);
    return () => window.clearTimeout(timer);
  }, [feedback, autoAdvance, autoAdvancePaused, submitting]);

  const setAutoAdvancePreference = (enabled: boolean): void => {
    setAutoAdvance(enabled);
    window.localStorage.setItem("opening-auto-advance", String(enabled));
  };

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
          <label className="opening-auto-advance">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(event) => setAutoAdvancePreference(event.target.checked)}
            />
            Auto-advance correct moves
          </label>
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
                  : studyPhase === "recall" ? submitting ? "Checking your move…" : "Play a move — it is checked immediately" : "Read the idea before revealing the move"}</span>
          </div>
          <div className="opening-line-context" aria-label="Moves leading to this position">
            <span>Position reached after</span>
            <strong>{formatOpeningLineContext(exercise.movesBefore)}</strong>
          </div>
          <ChessBoard
            fen={displayFen}
            orientation={exercise.learnerColor}
            interactive={!observing && !feedback && studyPhase === "recall" && !submitting}
            lastMove={lastMove}
            highlightedSquares={hintSquare ? [hintSquare] : []}
            onMove={playRecallMove}
          />
        </div>

        <div className="panel question-card opening-question-card" aria-live="polite">
          <span className="step-number">OPENING</span>
          {observing && exercise.opponentMove && (
            <>
              <span className="eyebrow">SEE</span>
              <h3>What is the opponent about to change?</h3>
              <p className="instruction">Look for attacks, loosened defenders and new threats. {exercise.opponentMove.moveSan} will play automatically.</p>
              <button className="secondary" onClick={playOpponentMove}>Play now</button>
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
              <p className="instruction">Tap or click a piece, then a highlighted square — or drag the piece. Your move is checked immediately. Only an answer made without help counts as remembered.</p>
              {moveNotice && (
                <div className="opening-move-result outside_repertoire" role="status">
                  <strong>{moveNotice.startsWith("Hint:") ? "Hint" : "Try again"}</strong>
                  <p>{moveNotice}</p>
                </div>
              )}
              <div className="answer-actions">
                <button className="secondary" disabled={submitting} onClick={showPieceHint}>
                  Hint: show the piece
                </button>
                <button className="secondary" disabled={submitting} onClick={() => void revealMove()}>
                  I don’t know — show move
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
              <p className="opening-feedback-summary"><strong>Why:</strong> {feedback.explanation.summary}</p>
              <details className="opening-feedback-details">
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
                <button disabled={submitting} onClick={() => void continueReview()}>
                  {submitting ? "Continuing…" : "Continue now"}
                </button>
                {feedback.outcome === "remembered" && autoAdvance && !autoAdvancePaused && (
                  <button className="text-button" onClick={() => setAutoAdvancePaused(true)}>Keep this open</button>
                )}
              </div>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
