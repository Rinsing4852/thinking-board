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
import { useOpeningReviewFlow } from "../opening-review-flow";
import { formatMoveLabel, formatOpeningLineContext } from "../training-language";
import { ChessBoard } from "./ChessBoard";
import { OpeningExplanation } from "./OpeningExplanation";
import { OpeningLearningComment } from "./OpeningLearningComment";

interface OpeningReviewProps {
  initial: OpeningReviewActiveState;
  boardSounds?: boolean;
  onComplete: () => void;
  onPause: () => void;
  onPracticeMore: () => void;
}

function signalBoardResult(correct: boolean): void {
  if (typeof window === "undefined") return;
  navigator.vibrate?.(correct ? 18 : [20, 24, 20]);
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = correct ? 620 : 210;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.13);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Audio feedback is optional; practice must continue if the browser blocks it.
  }
}

function initialBoard(active: OpeningReviewActiveState): string {
  if (active.kind === "feedback") return active.fenAfterMove;
  return active.opponentMove ? active.fenBeforeOpponent : active.fenToMove;
}

function dueLabel(nextDueAt: string, lapseQueued: boolean): string {
  if (lapseQueued) {
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

export function OpeningReview({ initial, boardSounds = false, onComplete, onPause, onPracticeMore }: OpeningReviewProps) {
  const initialExercise = initial.kind === "feedback" ? initial.exercise : initial;
  const [exercise, setExercise] = useState<OpeningReviewExercise>(initialExercise);
  const [feedback, setFeedback] = useState<OpeningReviewFeedback | null>(initial.kind === "feedback" ? initial : null);
  const [complete, setComplete] = useState<OpeningReviewComplete | null>(null);
  const [observing, setObserving] = useState(initial.kind === "exercise" && Boolean(initial.opponentMove));
  const [assisted, setAssisted] = useState(initialExercise.assistance.pieceHint);
  const [hintShown, setHintShown] = useState(initialExercise.assistance.pieceHint);
  const [moveShown, setMoveShown] = useState(initialExercise.assistance.moveShown);
  const [displayFen, setDisplayFen] = useState(initialBoard(initial));
  const [lastMove, setLastMove] = useState<string | null>(
    initial.kind === "feedback" ? initial.repertoireMove.moveUci : null,
  );
  const initialHint = getMoveHint(initialExercise.fenToMove, initialExercise.introduction.repertoireMove.moveUci);
  const [moveNotice, setMoveNotice] = useState(initialExercise.assistance.moveShown
    ? `Play ${initialExercise.introduction.repertoireMove.moveSan} yourself, then try to remember it later without help.`
    : initialExercise.assistance.pieceHint ? `Hint: move the ${initialHint.piece} on ${initialHint.square}.` : "");
  const [hintSquares, setHintSquares] = useState<string[]>(initialExercise.assistance.moveShown
    ? [initialHint.square, initialExercise.introduction.repertoireMove.moveUci.slice(2, 4)]
    : initialExercise.assistance.pieceHint ? [initialHint.square] : []);
  const [rejectedMove, setRejectedMove] = useState<string | null>(null);
  const flow = useOpeningReviewFlow();
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const submitting = flow.pending;
  const error = flow.error;
  const autoAdvancePaused = flow.paused;

  const showExercise = (next: OpeningReviewExercise): void => {
    setExercise(next);
    setFeedback(null);
    setMoveNotice("");
    setHintSquares([]);
    setRejectedMove(null);
    setObserving(Boolean(next.opponentMove));
    setAssisted(false);
    setHintShown(false);
    setMoveShown(false);
    flow.reset();
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
    if (!flow.begin()) return;
    try {
      const result = await post<OpeningReviewFeedback>(
        `/api/v1/openings/reviews/${exercise.sessionId}/move`,
        { moveUci, assisted, queueEntryId: exercise.queueEntryId },
      );
      setMoveNotice("");
      setHintSquares([]);
      setRejectedMove(null);
      setFeedback(result);
      setDisplayFen(result.fenAfterMove);
      setLastMove(result.repertoireMove.moveUci);
      window.dispatchEvent(new Event("training-completed"));
      flow.finish();
    } catch (failure) {
      setDisplayFen(exercise.fenToMove);
      setLastMove(exercise.opponentMove?.moveUci ?? null);
      flow.fail(failure instanceof Error ? failure.message : "Could not save your move. Try playing it again.");
    }
  };

  const showHelp = async (kind: "piece" | "move"): Promise<void> => {
    if (!flow.begin()) return;
    try {
      await post<OpeningReviewExercise>(`/api/v1/openings/reviews/${exercise.sessionId}/help`,
        { kind, queueEntryId: exercise.queueEntryId });
    const expected = exercise.introduction.repertoireMove;
    const hint = getMoveHint(exercise.fenToMove, expected.moveUci);
    setAssisted(true);
    setHintShown(true);
    setRejectedMove(null);
    setMoveShown(kind === "move");
    setHintSquares(kind === "move" ? [hint.square, expected.moveUci.slice(2, 4)] : [hint.square]);
    setMoveNotice(kind === "move"
      ? `Play ${expected.moveSan} yourself, then try to remember it later without help.`
      : `Hint: move the ${hint.piece} on ${hint.square}.`);
      flow.finish();
    } catch (failure) {
      flow.fail(failure instanceof Error ? failure.message : "Could not save your hint. Try again.");
    }
  };

  const playRecallMove = (uci: string, san: string): void => {
    if (submitting) return;
    const accepted = exercise.acceptedMoves.some((move) => move.moveUci === uci);
    if (!accepted) {
      if (boardSounds) signalBoardResult(false);
      setAssisted(true);
      setMoveNotice(exercise.lineRun
        ? `${san} is not the move in this branch. It may be playable or belong to another line. Try again, or ask for a hint.`
        : `${san} is not one of your saved moves here. This does not mean it is a bad chess move. Try again, or ask for a hint.`);
      setHintSquares([]);
      setHintShown(false);
      setRejectedMove(uci);
      setDisplayFen(exercise.fenToMove);
      setLastMove(exercise.opponentMove?.moveUci ?? null);
      if (!flow.begin()) return;
      void post<OpeningReviewMistakeResponse>(
        `/api/v1/openings/reviews/${exercise.sessionId}/mistakes`,
        { moveUci: uci, queueEntryId: exercise.queueEntryId },
      ).then(() => flow.finish()).catch((failure) => {
        flow.fail(failure instanceof Error ? failure.message : "Could not record this attempt");
      });
      return;
    }
    if (boardSounds) signalBoardResult(true);
    setDisplayFen(applyUciMove(exercise.fenToMove, uci));
    setRejectedMove(null);
    setLastMove(uci);
    void checkMove(uci);
  };

  const continueReview = async (): Promise<void> => {
    if (!flow.begin()) return;
    try {
      const next = await post<OpeningReviewState>(
        `/api/v1/openings/reviews/${exercise.sessionId}/continue`,
        { queueEntryId: exercise.queueEntryId },
      );
      if (next.kind === "complete") setComplete(next);
      else showExercise(next);
      flow.finish();
    } catch (failure) {
      flow.fail(failure instanceof Error ? failure.message : "Could not continue the opening review");
    }
  };

  useEffect(() => {
    if (!feedback || !flow.canAdvance || !visible) return;
    const delay = feedback.outcome === "remembered" ? 650 : 1500;
    const timer = window.setTimeout(() => void continueReview(), delay);
    return () => window.clearTimeout(timer);
  }, [feedback, flow.canAdvance, visible]);

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
        <div className="answer-actions opening-complete-actions">
          <button onClick={onPracticeMore}>Practice another set</button>
          <button className="secondary" onClick={onComplete}>Back to opening choices</button>
        </div>
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
            : exercise.lineRun
              ? `Line run · ${exercise.lineRun.lineTitle}`
              : exercise.practiceReason.label}</small>
        </div>
      </div>

      <div className="trainer-layout opening-trainer-layout">
        <div className="board-column">
          <p className="opening-board-prompt" role="status">{observing
            ? "Watch your opponent’s reply."
            : feedback ? `${feedback.repertoireMove.moveSan} — ${feedback.outcome === "remembered" ? "remembered" : "we’ll practise this again"}`
              : submitting ? "Saving your answer…" : moveNotice || "Your move — play your prepared reply."}</p>
          <div className="candidate-banner">
            <div>
              <span>{observing
                ? "Before the opponent’s move"
                : showingReference ? "Repertoire move shown" : `${exercise.learnerColor === "white" ? "White" : "Black"} to move`}</span>
              <small>You are {exercise.learnerColor} · {observing
                ? "watch what changes"
                : feedback
                  ? "the repertoire response is shown"
                  : submitting ? "checking your move…" : "play now — moves are checked immediately"}</small>
            </div>
            <strong>{showingReference
              ? formatMoveLabel(exercise.moveNumber, exercise.learnerColor, referenceSan)
              : formatMoveLabel(exercise.moveNumber, exercise.learnerColor)}</strong>
          </div>
          <ChessBoard
            fen={displayFen}
            orientation={exercise.learnerColor}
            interactive={!observing && !feedback && !submitting}
            lastMove={lastMove}
            highlightedSquares={hintSquares}
            rejectedMove={rejectedMove}
            onMove={playRecallMove}
          />
          {!observing && !feedback && <div className="answer-actions opening-recall-help">
            <button className="secondary" disabled={submitting || hintShown} onClick={() => void showHelp("piece")}>
              {hintShown ? "Piece highlighted" : "Hint: show the piece"}
            </button>
            <button className="text-button opening-show-answer" disabled={submitting || moveShown} onClick={() => void showHelp("move")}>
              {moveShown ? "Move highlighted — play it" : "Show move"}
            </button>
          </div>}
          <div className="opening-line-context below-board" aria-label="Moves leading to this position">
            <span>Position reached after</span>
            <strong>{formatOpeningLineContext(exercise.movesBefore)}</strong>
          </div>
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
              <p className="instruction">Play directly on the board. Correct moves continue automatically. After a mistake, try again or choose Hint or Show move.</p>
              {moveNotice && (
                <div className="opening-move-result outside_repertoire" role="status">
                  <strong>{hintShown ? "Hint" : "Try again"}</strong>
                  <p>{moveNotice}</p>
                </div>
              )}
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
                onToggle={(event) => flow.pause("explanation", event.currentTarget.open)}
              >
                <summary>See the full explanation</summary>
                <OpeningExplanation explanation={feedback.explanation} showSummary={false} showPersonalComment={false} />
                {exercise.preparationNote && <p className="opening-preparation-choice"><b>Your preparation idea:</b> {exercise.preparationNote}</p>}
              </details>
              <OpeningLearningComment
                repertoireId={exercise.repertoire.id}
                moveId={feedback.repertoireMove.moveId}
                comment={feedback.explanation.personalComment}
                onEditingChange={(editing) => flow.pause("comment", editing)}
                onSaved={updateLearningComment}
              />
              <p className="opening-next-due">{dueLabel(feedback.nextDueAt, feedback.lapseQueued)}</p>
              <div className="answer-actions opening-feedback-actions">
                <span className="opening-flow-status">{error ? "Practice stopped — retry when ready" : autoAdvancePaused ? "Auto-advance paused" : "Continuing automatically…"}</span>
                <button className="text-button" onClick={() => flow.pause("manual", !flow.manualPause)}>
                  {flow.manualPause ? "Resume automatic practice" : "Keep this open"}
                </button>
                {error && <button className="text-button" disabled={submitting} onClick={() => void continueReview()}>
                  {submitting ? "Loading…" : "Try loading the next position again"}
                </button>}
              </div>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
