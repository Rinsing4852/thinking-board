import { useEffect, useState } from "react";

import type {
  OpeningReviewActiveState,
  OpeningReviewComplete,
  OpeningReviewExercise,
  OpeningReviewFeedback,
  OpeningReviewMistakeResponse,
  OpeningReviewState,
  OpeningPracticePace,
  OpeningPausePolicy,
} from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { applyUciMove, getMoveHint } from "../opening-board";
import { useOpeningReviewFlow } from "../opening-review-flow";
import { useRecallClock } from "../use-recall-clock";
import { usePracticeMoveReset } from "../use-practice-move-reset";
import { formatMoveLabel, formatOpeningLineContext } from "../training-language";
import { ChessBoard } from "./ChessBoard";
import { OpeningExplanation } from "./OpeningExplanation";
import { OpeningLearningComment } from "./OpeningLearningComment";
import { OpeningReviewEvidence } from "./OpeningReviewEvidence";
import { hasOpeningReason } from "../opening-explanation";
import { pauseForFeedback, practiceTimings } from "../opening-practice-settings";

interface OpeningReviewProps {
  initial: OpeningReviewActiveState;
  boardSounds?: boolean;
  practicePace?: OpeningPracticePace;
  pauseAfterMove?: OpeningPausePolicy;
  onComplete: () => void;
  onPause: () => void;
  onPracticeMore: () => void;
  navigationBusy?: boolean;
  onRepeatLine?: () => void;
  onNextLine?: (() => void) | undefined;
  onBackToRepertoire?: () => void;
  onOpenGame?: ((gameId: string) => void) | undefined;
  contextError?: string;
  contextLoading?: boolean;
  onRetryContext?: () => void;
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

export function OpeningReview({ initial, boardSounds = false, practicePace = "normal", pauseAfterMove = "never", onComplete, onPause, onPracticeMore,
  navigationBusy = false, onRepeatLine, onNextLine, onBackToRepertoire, onOpenGame,
  contextError = "", contextLoading = false, onRetryContext }: OpeningReviewProps) {
  const initialExercise = initial.kind === "feedback" ? initial.exercise : initial;
  const [exercise, setExercise] = useState<OpeningReviewExercise>(initialExercise);
  const [feedback, setFeedback] = useState<OpeningReviewFeedback | null>(initial.kind === "feedback" ? initial : null);
  const [lastAnswered, setLastAnswered] = useState<OpeningReviewFeedback | null>(initial.kind === "feedback" ? initial : null);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [editingLineComment, setEditingLineComment] = useState(false);
  const [complete, setComplete] = useState<OpeningReviewComplete | null>(null);
  const [observing, setObserving] = useState(initial.kind === "exercise" && Boolean(initial.opponentMove));
  const [assisted, setAssisted] = useState(initialExercise.assistance.pieceHint || Boolean(initialExercise.assistance.ideaHint));
  const [ideaShown, setIdeaShown] = useState(Boolean(initialExercise.assistance.ideaHint));
  const [hintShown, setHintShown] = useState(initialExercise.assistance.pieceHint);
  const [moveShown, setMoveShown] = useState(initialExercise.assistance.moveShown);
  const [displayFen, setDisplayFen] = useState(initialBoard(initial));
  const [lastMove, setLastMove] = useState<string | null>(
    initial.kind === "feedback" ? initial.repertoireMove.moveUci : null,
  );
  const initialHint = getMoveHint(initialExercise.fenToMove, initialExercise.introduction.repertoireMove.moveUci);
  const [moveNotice, setMoveNotice] = useState(initialExercise.assistance.moveShown
    ? `Play ${initialExercise.introduction.repertoireMove.moveSan} yourself, then try to remember it later without help.`
    : initialExercise.assistance.pieceHint ? `Hint: move the ${initialHint.piece} on ${initialHint.square}.`
    : initialExercise.assistance.ideaHint ? initialExercise.introduction.explanation.ideaHint ?? "" : "");
  const [hintSquares, setHintSquares] = useState<string[]>(initialExercise.assistance.moveShown
    ? [initialHint.square, initialExercise.introduction.repertoireMove.moveUci.slice(2, 4)]
    : initialExercise.assistance.pieceHint ? [initialHint.square] : []);
  const [rejectedMove, setRejectedMove] = useState<string | null>(null);
  const timings = practiceTimings(practicePace);
  const moveReset = usePracticeMoveReset(exercise.queueEntryId, !observing && !feedback && !complete && !explanationOpen && !evidenceOpen,
    timings.rejectHold, timings.rejectReturn);
  const [preferenceResumed, setPreferenceResumed] = useState<string | null>(null);
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
  const fullLinePractice = Boolean(exercise.lineRun);
  const lineName = exercise.lineRun ? [exercise.lineRun.chapterTitle, exercise.lineRun.lineTitle].filter(Boolean).join(" · ") : "";
  const preferencePaused = Boolean(feedback && preferenceResumed !== exercise.queueEntryId && pauseForFeedback(pauseAfterMove,
    feedback.assisted || feedback.outcome === "again", Boolean(feedback.explanation.personalComment) || hasOpeningReason(feedback.explanation.summary)));
  const recallClock = useRecallClock(exercise.queueEntryId, !observing && !feedback && !complete && !flow.paused && visible && !submitting && !moveReset.busy);

  const showExercise = (next: OpeningReviewExercise): void => {
    setExercise(next);
    setFeedback(null);
    setExplanationOpen(false);
    setEvidenceOpen(false);
    setEditingLineComment(false);
    setMoveNotice("");
    setHintSquares([]);
    setRejectedMove(null);
    setObserving(Boolean(next.opponentMove));
    setAssisted(false);
    setHintShown(false);
    setIdeaShown(false);
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
    if (!observing || !exercise.opponentMove || flow.paused || !visible) return;
    const timer = window.setTimeout(playOpponentMove, timings.opponent);
    return () => window.clearTimeout(timer);
  }, [observing, exercise.sessionId, exercise.positionNumber, exercise.opponentMove, flow.paused, visible, timings.opponent]);

  const checkMove = async (moveUci: string): Promise<void> => {
    if (!flow.begin()) return;
    try {
      const result = await post<OpeningReviewFeedback>(
        `/api/v1/openings/reviews/${exercise.sessionId}/move`,
        { moveUci, assisted, queueEntryId: exercise.queueEntryId, activeResponseMs: recallClock.read() },
      );
      setMoveNotice("");
      setHintSquares([]);
      setRejectedMove(null);
      setFeedback(result);
      setLastAnswered(result);
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

  const showHelp = async (kind: "idea" | "piece" | "move"): Promise<void> => {
    if (moveReset.busy) return;
    if (!flow.begin()) return;
    try {
      await post<OpeningReviewExercise>(`/api/v1/openings/reviews/${exercise.sessionId}/help`,
        { kind, queueEntryId: exercise.queueEntryId });
    const expected = exercise.introduction.repertoireMove;
    const hint = getMoveHint(exercise.fenToMove, expected.moveUci);
    setAssisted(true);
    if (kind !== "idea") setHintShown(true);
    if (kind === "idea") setIdeaShown(true);
    setRejectedMove(null);
    if (kind === "move") setMoveShown(true);
    setHintSquares(kind === "idea" ? [] : kind === "move" ? [hint.square, expected.moveUci.slice(2, 4)] : [hint.square]);
    setMoveNotice(kind === "move"
      ? `Play ${expected.moveSan} yourself, then try to remember it later without help.`
      : kind === "idea" ? exercise.introduction.explanation.ideaHint ?? "" : `Hint: move the ${hint.piece} on ${hint.square}.`);
      flow.finish();
    } catch (failure) {
      flow.fail(failure instanceof Error ? failure.message : "Could not save your hint. Try again.");
    }
  };

  const playRecallMove = (uci: string, san: string): void => {
    if (submitting || feedback || observing || explanationOpen || complete || moveReset.busy) return;
    const accepted = exercise.acceptedMoves.some((move) => move.moveUci === uci);
    if (!accepted) {
      if (boardSounds) signalBoardResult(false);
      setAssisted(true);
      setMoveNotice(exercise.lineRun
        ? `${san} is not the move in this branch. It may be playable or belong to another line. Try again, or ask for a hint.`
        : `${san} is not one of your saved moves here. This does not mean it is a bad chess move. Try again, or ask for a hint.`);
      setHintSquares([]);
      setHintShown(false);
      setIdeaShown(false);
      setMoveShown(false);
      setRejectedMove(uci);
      moveReset.reject(exercise.fenToMove, uci);
      setDisplayFen(exercise.fenToMove);
      setLastMove(exercise.opponentMove?.moveUci ?? null);
      if (!flow.begin()) return;
      void post<OpeningReviewMistakeResponse>(
        `/api/v1/openings/reviews/${exercise.sessionId}/mistakes`,
        { moveUci: uci, queueEntryId: exercise.queueEntryId, activeResponseMs: recallClock.read() },
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
    if (complete || explanationOpen || editingLineComment) return;
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
    if (complete || !feedback || !flow.canAdvance || !visible || preferencePaused) return;
    const delay = feedback.outcome === "remembered" ? timings.correct : timings.helped;
    const timer = window.setTimeout(() => void continueReview(), delay);
    return () => window.clearTimeout(timer);
  }, [complete, feedback, flow.canAdvance, visible, preferencePaused, timings.correct, timings.helped]);

  const updateLearningComment = (comment: string | null, ideaHint?: string | null): void => {
    setExercise((current) => ({
      ...current,
      introduction: {
        ...current.introduction,
        explanation: { ...current.introduction.explanation, personalComment: comment, ideaHint: ideaHint ?? null },
      },
    }));
    setFeedback((current) => current ? {
      ...current,
      explanation: { ...current.explanation, personalComment: comment, ideaHint: ideaHint ?? null },
      exercise: {
        ...current.exercise,
        introduction: {
          ...current.exercise.introduction,
          explanation: { ...current.exercise.introduction.explanation, personalComment: comment, ideaHint: ideaHint ?? null },
        },
      },
    } : current);
  };

  const toggleLineExplanation = (): void => {
    if (editingLineComment) return;
    const open = !explanationOpen;
    // Pause immediately, before the next-position timer can fire.
    flow.pause("explanation", open);
    setExplanationOpen(open);
  };

  const updateLastMoveComment = (comment: string | null, ideaHint?: string | null): void => {
    if (!lastAnswered) return;
    const moveId = lastAnswered.repertoireMove.moveId;
    setLastAnswered(current => current ? { ...current, explanation: { ...current.explanation, personalComment: comment, ideaHint: ideaHint ?? null } } : current);
    if (exercise.introduction.repertoireMove.moveId === moveId) updateLearningComment(comment, ideaHint);
  };

  const lineExplanationAction = <div className="answer-actions opening-line-explanation-action">
    <button className="secondary" disabled={!lastAnswered || submitting || moveReset.busy || editingLineComment} aria-expanded={explanationOpen}
      aria-controls="opening-requested-explanation" onClick={toggleLineExplanation}>
      {explanationOpen ? complete ? "Close explanation" : "Close explanation and resume" : "Explain last move"}
    </button>
    {!lastAnswered && <small>Available after you play a move.</small>}
    {editingLineComment && <small>Save or cancel your comment before resuming.</small>}
  </div>;

  const requestedExplanation = explanationOpen && lastAnswered && <section id="opening-requested-explanation" aria-label="Requested move explanation">
    <span className="eyebrow">{complete ? "Your requested explanation" : "Practice paused · your request"}</span>
    <h3>Why {formatMoveLabel(lastAnswered.exercise.moveNumber, lastAnswered.exercise.learnerColor, lastAnswered.repertoireMove.moveSan)}?</h3>
    <OpeningExplanation explanation={lastAnswered.explanation} showPersonalComment={false} />
    {lastAnswered.exercise.preparationNote && <p className="opening-preparation-choice"><b>Your preparation idea:</b> {lastAnswered.exercise.preparationNote}</p>}
    <OpeningLearningComment key={lastAnswered.repertoireMove.moveId}
      repertoireId={lastAnswered.exercise.repertoire.id} moveId={lastAnswered.repertoireMove.moveId}
      comment={lastAnswered.explanation.personalComment} ideaHint={lastAnswered.explanation.ideaHint} onEditingChange={editing => {
        setEditingLineComment(editing);
        flow.pause("comment", editing);
      }}
      onSaved={updateLastMoveComment} />
    <p className="opening-next-due">{dueLabel(lastAnswered.nextDueAt, lastAnswered.lapseQueued)}</p>
  </section>;
  const evidenceAction = lastAnswered && <button className="text-button" disabled={submitting || moveReset.busy || editingLineComment}
    aria-expanded={evidenceOpen} onClick={() => {
      const open = !evidenceOpen; setEvidenceOpen(open); flow.pause("evidence", open);
    }}>{evidenceOpen ? "Close review context" : "Why this exercise?"}</button>;
  const evidencePanel = evidenceOpen && lastAnswered && <OpeningReviewEvidence feedback={lastAnswered} onOpenGame={onOpenGame} />;

  const completePanel = complete && (
      <div className="panel opening-complete" role="status">
        <span className="eyebrow">Practice complete</span>
        <h3>{complete.repertoireName}</h3>
        {fullLinePractice && <p>{lineName}</p>}
        <p>{complete.message}</p>
        <div className="opening-complete-scores three-up">
          <div><strong>{complete.firstTryRemembered}</strong><span>remembered first try</span></div>
          <div><strong>{complete.helpedPositions}</strong><span>moves helped by hints</span></div>
          <div><strong>{complete.mistakePositions}</strong><span>moves needing a retry</span></div>
        </div>
        <p>{complete.positions} prepared move{complete.positions === 1 ? "" : "s"} practised · {complete.repeatAttempts} later recall retr{complete.repeatAttempts === 1 ? "y" : "ies"}. Hints and mistakes can overlap; later retries do not change your first-try result.</p>
        <div className="answer-actions opening-complete-actions">
          {fullLinePractice ? <>
            <button disabled={editingLineComment || navigationBusy} onClick={onRepeatLine}>Repeat this line</button>
            <button className="secondary" disabled={editingLineComment || navigationBusy || !onNextLine} onClick={onNextLine}>Next enabled line</button>
            <button className="secondary" disabled={editingLineComment || navigationBusy} onClick={onBackToRepertoire}>Back to this repertoire</button>
          </> : <>
            <button disabled={editingLineComment || navigationBusy} onClick={onPracticeMore}>Practice another set</button>
            <button className="secondary" disabled={editingLineComment || navigationBusy} onClick={onComplete}>Back to opening choices</button>
          </>}
        </div>
        {fullLinePractice && (contextLoading ? <p role="status">Loading the next line…</p>
          : contextError ? <p role="alert">{contextError} <button className="text-button" onClick={onRetryContext}>Retry line list</button></p>
          : !onNextLine && <p>You have reached the last enabled line. Repeat it or return to your repertoire.</p>)}
        {requestedExplanation}
        {evidencePanel}
      </div>
    );

  return (
    <div className="opening-lesson opening-review">
      <div className="opening-lesson-title panel">
        <div>
          <span className="eyebrow">Today’s opening practice</span>
          <h3>{exercise.repertoire.name}</h3>
        </div>
        <div className="opening-progress">
          <div className="opening-progress-topline">
            <span>Step {exercise.positionNumber} of {exercise.totalPositions}</span>
            {!complete && <button className="text-button" disabled={editingLineComment} onClick={onPause}>Pause</button>}
          </div>
            <progress aria-label={`Opening practice progress: step ${exercise.positionNumber} of ${exercise.totalPositions}`} value={complete ? exercise.totalPositions : exercise.positionNumber - 1} max={exercise.totalPositions} />
          <small>{exercise.presentationKind === "lapse_repeat"
            ? "Unassisted retry"
            : exercise.lineRun
              ? `Line run · ${lineName}`
              : exercise.practiceReason.label}</small>
        </div>
      </div>

      <div className="trainer-layout opening-trainer-layout">
        <div className="board-column">
          <div className="practice-board-header">
            <span>You are {exercise.learnerColor === "white" ? "White" : "Black"}</span>
            <span>{complete ? "Session finished" : explanationOpen ? "Reading last move" : observing ? "Opponent’s turn" : feedback ? preferencePaused ? "Practice paused" : "Move saved" : "Your turn"}</span>
          </div>
          <p className="opening-mobile-status" role="status">{complete ? "Session finished. Your recall summary is below." : explanationOpen ? "Practice paused while you read."
            : observing ? "Watch your opponent’s reply." : feedback ? `${feedback.repertoireMove.moveSan} — ${feedback.assisted ? "found with help; we’ll revisit it" : "remembered"}${preferencePaused ? ". Paused." : ". Continuing…"}`
            : moveReset.busy ? "Not saved here. The piece will return; then try again."
            : moveNotice && !rejectedMove ? moveNotice : rejectedMove ? "Try again, or ask for a hint."
            : submitting ? "Checking and saving your move…" : exercise.prompt}</p>
          <ChessBoard
            fen={explanationOpen && lastAnswered ? lastAnswered.fenAfterMove : moveReset.fen ?? displayFen}
            orientation={exercise.learnerColor}
            interactive={!complete && !observing && !feedback && !submitting && !explanationOpen && !evidenceOpen && !moveReset.busy}
            animationDuration={moveReset.animationDuration}
            lastMove={explanationOpen && lastAnswered ? lastAnswered.repertoireMove.moveUci : lastMove}
            highlightedSquares={explanationOpen ? [] : hintSquares}
            rejectedMove={explanationOpen ? null : rejectedMove}
            sourceAnnotations={explanationOpen ? lastAnswered?.explanation.boardAnnotations ?? [] : []}
            onMove={playRecallMove}
          />
          {!complete && !observing && !feedback && !explanationOpen && <div className="answer-actions opening-recall-help">
            {exercise.introduction.explanation.ideaHint && <button className="secondary" disabled={submitting || moveReset.busy || ideaShown || hintShown}
              onClick={() => void showHelp("idea")}>{ideaShown ? "Idea hint shown" : "Hint: explain the idea"}</button>}
            <button className="secondary" disabled={submitting || moveReset.busy || hintShown} onClick={() => void showHelp("piece")}>
              {hintShown ? "Piece highlighted" : "Hint: show the piece"}
            </button>
            <button className="text-button opening-show-answer" disabled={submitting || moveReset.busy || moveShown} onClick={() => void showHelp("move")}>
              {moveShown ? "Move highlighted — play it" : "Show move"}
            </button>
          </div>}
          {feedback && !complete && !preferencePaused && <button className="text-button" onClick={() => flow.pause("manual", !flow.manualPause)}>
            {flow.manualPause ? "Resume automatic practice" : "Keep this open"}
          </button>}
          {lineExplanationAction}
          {evidenceAction}
          <div className="opening-line-context below-board" aria-label="Moves leading to this position">
            <span>Position reached after</span>
            <strong>{formatOpeningLineContext((explanationOpen || complete) && lastAnswered ? [...lastAnswered.exercise.movesBefore, lastAnswered.repertoireMove.moveSan] : exercise.movesBefore)}</strong>
          </div>
        </div>

        {completePanel || <div className={`panel question-card opening-question-card ${!explanationOpen && !evidenceOpen && !preferencePaused && !flow.manualPause && !error ? "mobile-quiet" : ""}`} aria-live="polite">
          <span className="step-number">OPENING</span>
          {!explanationOpen && observing && exercise.opponentMove && (
            <>
              <span className="eyebrow">SEE</span>
              <h3>Watch the reply.</h3>
              <p className="instruction">Notice what changed. {exercise.opponentMove.moveSan} is playing automatically.</p>
            </>
          )}

          {!explanationOpen && !observing && !feedback && (
            <>
              <span className="eyebrow">{!fullLinePractice && exercise.learningStage === "new" ? "LEARN" : "YOUR MOVE"}</span>
              <h3>{exercise.prompt}</h3>
              <p className="instruction">Play directly on the board. Correct moves continue automatically. After a mistake, try again or choose Hint or Show move.</p>
              {moveNotice && (
                <div className="opening-move-result outside_repertoire" role="status">
                  <strong>{hintShown || ideaShown ? "Hint" : "Try again"}</strong>
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
              {preferencePaused && <p>Paused by your practice setting. Read the explanation if you wish, then continue.</p>}
              <div className="answer-actions opening-feedback-actions">
                <span className="opening-flow-status">{error ? "Practice stopped — retry when ready" : autoAdvancePaused || preferencePaused ? "Auto-advance paused" : "Continuing automatically…"}</span>
                {preferencePaused && <button disabled={submitting || explanationOpen || editingLineComment || evidenceOpen || flow.manualPause} onClick={() => {
                  setPreferenceResumed(exercise.queueEntryId); void continueReview();
                }}>Continue practice</button>}
                {error && <button className="text-button" disabled={submitting} onClick={() => void continueReview()}>
                  {submitting ? "Loading…" : "Try loading the next position again"}
                </button>}
              </div>
            </div>
          )}
          {requestedExplanation}
          {evidencePanel}
          {error && <p className="error" role="alert">{error}</p>}
        </div>}
      </div>
    </div>
  );
}
