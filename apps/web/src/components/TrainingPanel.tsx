import { useEffect, useState } from "react";
import { Chess } from "chess.js";

import type {
  BlunderCheckExercise,
  EmptyTrainingResponse,
  NextTrainingResponse,
  ResponseCategory,
  TrainingAnswerResponse,
} from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { categoryLabel, formatMoveLabel, RESPONSE_CATEGORIES } from "../training-language";
import { ChessBoard } from "./ChessBoard";
import { TrainingEmptyState } from "./TrainingEmptyState";

interface TrainingPanelProps {
  refreshToken: number;
  requestedItemId?: string | undefined;
  sessionId?: string | undefined;
  onCompleted: () => void;
}

export function TrainingPanel({ refreshToken, requestedItemId, sessionId, onCompleted }: TrainingPanelProps) {
  const [exercise, setExercise] = useState<BlunderCheckExercise | null>(null);
  const [empty, setEmpty] = useState<EmptyTrainingResponse | null>(null);
  const [displayFen, setDisplayFen] = useState("");
  const [phase, setPhase] = useState<"ready" | "answer" | "feedback">("ready");
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [displayMove, setDisplayMove] = useState<string | null>(null);
  const [category, setCategory] = useState<ResponseCategory | null>(null);
  const [move, setMove] = useState<{ uci: string; san: string } | null>(null);
  const [feedback, setFeedback] = useState<TrainingAnswerResponse | null>(null);
  const [error, setError] = useState("");

  const loadNext = async (pool = "due"): Promise<void> => {
    setError("");
    setFeedback(null);
    setCategory(null);
    setMove(null);
    try {
      const result = await post<NextTrainingResponse>("/api/v1/training/next", { pool: requestedItemId ? "early" : pool, itemId: requestedItemId });
      if (result.kind === "empty") {
        setExercise(null);
        setEmpty(result);
        return;
      }
      setEmpty(null);
      setExercise(result);
      setDisplayFen(result.fenBefore);
      setDisplayMove(null);
      setBoardOrientation(result.playerColor);
      setPhase("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load exercise");
    }
  };

  useEffect(() => {
    void loadNext();
  }, [refreshToken, requestedItemId]);

  const playCandidate = async (): Promise<void> => {
    if (!exercise) return;
    try {
      const started = await post<{ attemptId: string }>(`/api/v1/training/items/${exercise.itemId}/start`, { sessionId });
      setExercise({ ...exercise, attemptId: started.attemptId });
      setDisplayFen(exercise.fenAfterCandidate);
      setDisplayMove(exercise.candidateMoveUci);
      setPhase("answer");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start exercise");
    }
  };

  const previewReply = (uci: string, san: string): void => {
    if (!exercise) return;
    const board = new Chess(exercise.fenAfterCandidate);
    const applied = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
    });
    if (!applied) return;
    setMove({ uci, san });
    setDisplayFen(board.fen());
    setDisplayMove(uci);
  };

  const changeReply = (): void => {
    if (!exercise) return;
    setMove(null);
    setDisplayFen(exercise.fenAfterCandidate);
    setDisplayMove(exercise.candidateMoveUci);
  };

  const showFeedback = (result: TrainingAnswerResponse): void => {
    setFeedback(result);
    setPhase("feedback");
    window.dispatchEvent(new Event("training-completed"));
    const answer = result.acceptableMoves[0];
    if (!exercise || !answer) return;
    const board = new Chess(exercise.fenAfterCandidate);
    const applied = board.move({
      from: answer.moveUci.slice(0, 2),
      to: answer.moveUci.slice(2, 4),
      ...(answer.moveUci.length === 5 ? { promotion: answer.moveUci.slice(4, 5) } : {}),
    });
    if (!applied) return;
    setDisplayFen(board.fen());
    setDisplayMove(answer.moveUci);
  };

  const submit = async (): Promise<void> => {
    if (!exercise?.attemptId || !category || !move) return;
    try {
      const result = await post<TrainingAnswerResponse>(
        `/api/v1/training/attempts/${exercise.attemptId}/answer`,
        { category, moveUci: move.uci },
      );
      showFeedback(result);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit answer");
    }
  };

  const reveal = async (): Promise<void> => {
    if (!exercise?.attemptId) return;
    const result = await post<TrainingAnswerResponse>(`/api/v1/training/attempts/${exercise.attemptId}/reveal`);
    showFeedback(result);
  };

  return (
    <section className="training-section" id="training">
      <div className="training-copy">
        <span className="eyebrow">Highest priority drill</span>
        <h2>Blunder Check</h2>
        <p>Pause before the move. Look for the opponent’s immediate checks, captures, and threats.</p>
      </div>

      {empty && <TrainingEmptyState
        empty={empty}
        onChoosePool={(pool) => void loadNext(pool)}
        noItemsHelp="Import a game containing a concrete mistake that the opponent could punish immediately."
      />}

      {exercise && (
        <div className="trainer-layout">
          <div className="board-column">
            <div className="candidate-banner">
              <div>
                <span>{phase === "ready" ? "Position before your move" : phase === "answer" ? "Position after your move" : "Opponent’s punishment"}</span>
                <small>You are {exercise.playerColor}. {boardOrientation === exercise.playerColor ? "Your side is nearest." : "Board flipped."}</small>
              </div>
              <strong>{phase === "feedback" && feedback
                ? feedback.acceptableMoves[0]?.moveSan
                : formatMoveLabel(exercise.moveNumber, exercise.playerColor, exercise.candidateMoveSan)}</strong>
            </div>
            <div className="board-toolbar">
              <span>{phase === "ready" ? "Your move has not been shown yet" : phase === "answer" ? `${exercise.playerColor === "white" ? "Black" : "White"} to move` : "Correct reply shown on board"}</span>
              <button className="text-button" onClick={() => setBoardOrientation(boardOrientation === "white" ? "black" : "white")}>Flip board</button>
            </div>
            <ChessBoard
              fen={displayFen}
              orientation={boardOrientation}
              interactive={phase === "answer" && !move}
              lastMove={displayMove}
              onMove={previewReply}
            />
          </div>

          <div className="panel question-card">
            <span className="step-number">03</span>
            <span className="eyebrow">{phase === "ready" ? "YOUR MOVE" : phase === "feedback" ? "REVIEW" : "CHECK"}</span>
            {phase === "ready" && (
              <div className="ready-step">
                <h3>You played {formatMoveLabel(exercise.moveNumber, exercise.playerColor, exercise.candidateMoveSan)}</h3>
                <p className="instruction">
                  You were playing <strong>{exercise.playerColor}</strong>. First study the position before your move, then show the move you actually made.
                </p>
                <button onClick={() => void playCandidate()}>Play my move on the board</button>
              </div>
            )}
            {phase === "answer" && !feedback && (
              <>
                <h3>{exercise.prompt}</h3>
                <p className="move-context">
                  You just played <strong>{exercise.candidateMoveSan}</strong>. It is now <strong>{exercise.playerColor === "white" ? "Black" : "White"} to move</strong>.
                </p>
                <p className="instruction">First choose the kind of danger. Then play the opponent’s reply by clicking its start and destination squares. You do not need to type chess notation.</p>
                <div className="category-grid">
                  {RESPONSE_CATEGORIES.map((option) => (
                    <button
                      key={option.value}
                      className={category === option.value ? "category active" : "category"}
                      onClick={() => setCategory(option.value)}
                    >
                      <span>{option.symbol}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
                {category && <p className="term-help">{RESPONSE_CATEGORIES.find((option) => option.value === category)?.description}</p>}
                <div className="selected-answer">
                  {move ? <>Your selected reply: <strong>{move.san}</strong> <button className="inline-link" onClick={changeReply}>Change</button></> : "Select the opponent’s piece, then select its destination square."}
                </div>
                <div className="answer-actions">
                  <button disabled={!category || !move} onClick={() => void submit()}>Check my answer</button>
                  <button className="text-button" onClick={() => void reveal()}>Show answer</button>
                </div>
              </>
            )}

            {feedback && (
              <div className={`feedback ${feedback.outcome}`} role="status">
                <span className="feedback-label">{feedback.outcome === "excellent" ? "Seen" : feedback.outcome === "partial" ? "Partly seen" : "Missed"}</span>
                <h3>{feedback.outcome === "excellent"
                  ? "You caught the danger"
                  : feedback.categoryCorrect
                    ? "Right danger, wrong reply"
                    : feedback.moveCorrect
                      ? "Right reply, wrong label"
                      : "This was the danger to find"}</h3>
                {category && move && <p className="answer-comparison">
                  You chose <strong>{categoryLabel(category)}</strong> and played <strong>{move.san}</strong>.
                  {!feedback.categoryCorrect && <> The reply is a <strong>{categoryLabel(feedback.acceptableMoves[0]?.categories[0] ?? "threat")}</strong>.</>}
                </p>}
                <p className="failure-summary">
                  Your move <strong>{exercise.candidateMoveSan}</strong> allowed <strong>{feedback.acceptableMoves.map((answer) => answer.moveSan).join(" or ")}</strong> immediately.
                </p>
                <p>{feedback.explanation}</p>
                <p className="board-result-note">The board now shows the opponent’s punishment; the highlighted squares show their move.</p>
                <div className="checklist-feedback">
                  <span>Thinking-process failure: Blunder check</span>
                  <p>{feedback.checklistPoint}</p>
                </div>
                <button onClick={() => sessionId ? onCompleted() : void loadNext()}>{sessionId ? "Continue session" : "Next exercise"}</button>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
