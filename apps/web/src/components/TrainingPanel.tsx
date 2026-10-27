import { useEffect, useRef, useState } from "react";
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
import { ExerciseLoadState } from "./ExerciseLoadState";

interface TrainingPanelProps {
  refreshToken: number;
  gameDays?: number | null;
  requestedItemId?: string | undefined;
  sessionId?: string | undefined;
  onCompleted: () => void;
}

export function TrainingPanel({ refreshToken, requestedItemId, sessionId, onCompleted, gameDays = null }: TrainingPanelProps) {
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

  const loadVersion = useRef(0);
  const loadNext = async (pool = "due"): Promise<void> => {
    const version = ++loadVersion.current;
    setExercise(null); setEmpty(null);
    setError("");
    setFeedback(null);
    setCategory(null);
    setMove(null);
    try {
      const result = await post<NextTrainingResponse>("/api/v1/training/next", { pool: requestedItemId ? "early" : pool, itemId: requestedItemId, gameDays });
      if (version !== loadVersion.current) return;
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
      if (version !== loadVersion.current) return;
      setError(loadError instanceof Error ? loadError.message : "Could not load exercise");
    }
  };

  useEffect(() => {
    void loadNext();
    return () => { loadVersion.current++; };
  }, [refreshToken, requestedItemId, gameDays]);

  const missed = exercise?.exerciseKind === "missed_opportunity";
  const answerFen = exercise ? missed ? exercise.fenBefore : exercise.fenAfterCandidate : "";
  const playCandidate = async (): Promise<void> => {
    if (!exercise) return;
    try {
      const started = await post<{ attemptId: string }>(`/api/v1/training/items/${exercise.itemId}/start`, { sessionId });
      setExercise({ ...exercise, attemptId: started.attemptId });
      setDisplayFen(exercise.exerciseKind === "missed_opportunity" ? exercise.fenBefore : exercise.fenAfterCandidate);
      setDisplayMove(exercise.exerciseKind === "missed_opportunity" ? null : exercise.candidateMoveUci);
      setPhase("answer");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start exercise");
    }
  };

  const previewReply = (uci: string, san: string): void => {
    if (!exercise) return;
    const board = new Chess(answerFen);
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
    setDisplayFen(exercise.exerciseKind === "missed_opportunity" ? exercise.fenBefore : exercise.fenAfterCandidate);
    setDisplayMove(exercise.exerciseKind === "missed_opportunity" ? null : exercise.candidateMoveUci);
  };

  const showFeedback = (result: TrainingAnswerResponse): void => {
    setFeedback(result);
    setPhase("feedback");
    window.dispatchEvent(new Event("training-completed"));
    const answer = result.acceptableMoves[0];
    if (!exercise || !answer) return;
    const board = new Chess(answerFen);
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
        <p>Check both sides: spot your winning opportunities and the danger your move could allow.</p>
      </div>

      {empty && <TrainingEmptyState gameDays={gameDays}
        empty={empty}
        onChoosePool={(pool) => void loadNext(pool)}
        noItemsHelp="Analyse an imported game to find missed winning opportunities and moves that allowed a concrete punishment."
      />}

      {!exercise && !empty && <ExerciseLoadState error={error} onRetry={() => void loadNext()} />}
      {exercise && (
        <div className="trainer-layout">
          <div className="board-column">
            <div className="candidate-banner">
              <div>
                <span>{missed ? "Find your missed opportunity" : phase === "ready" ? "Position before your move" : phase === "answer" ? "Position after your move" : "Opponent’s punishment"}</span>
                <small>You are {exercise.playerColor}. {boardOrientation === exercise.playerColor ? "Your side is nearest." : "Board flipped."}</small>
              </div>
              <strong>{phase === "feedback" && feedback
                ? feedback.acceptableMoves[0]?.moveSan
                : formatMoveLabel(exercise.moveNumber, exercise.playerColor, exercise.candidateMoveSan)}</strong>
            </div>
            <div className="board-toolbar">
              <span>{phase === "ready" ? "Your move has not been shown yet" : phase === "answer" ? `${missed ? exercise.playerColor : exercise.playerColor === "white" ? "Black" : "White"} to move` : "Engine move shown on board"}</span>
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
                  You were playing <strong>{exercise.playerColor}</strong>. {missed ? "Look for the winning move you missed before playing your game move." : "First study the position before your move, then show the move you actually made."}
                </p>
                <button onClick={() => void playCandidate()}>{missed ? "Find my missed opportunity" : "Play my move on the board"}</button>
              </div>
            )}
            {phase === "answer" && !feedback && (
              <>
                <h3>{exercise.prompt}</h3>
                <p className="move-context">
                  {missed ? <>Instead of {exercise.candidateMoveSan}, find your stronger move. You are {exercise.playerColor}.</> : <>You just played <strong>{exercise.candidateMoveSan}</strong>. It is now <strong>{exercise.playerColor === "white" ? "Black" : "White"} to move</strong>.</>}
                </p>
                <p className="instruction">{missed ? "Choose check, capture or threat, then play your winning move on the board." : "First choose the kind of danger. Then play the opponent’s reply by clicking its start and destination squares. You do not need to type chess notation."}</p>
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
                {category && <p className="term-help">{missed ? "Classify your own move: check, capture, or threat." : RESPONSE_CATEGORIES.find((option) => option.value === category)?.description}</p>}
                <div className="selected-answer">
                  {move ? <>Your selected reply: <strong>{move.san}</strong> <button className="inline-link" onClick={changeReply}>Change</button></> : missed ? "Select your piece, then its destination square." : "Select the opponent’s piece, then select its destination square."}
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
                  ? missed ? "You found the missed opportunity" : "You caught the danger"
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
                  {missed ? <>You played <strong>{exercise.candidateMoveSan}</strong>. You could have played <strong>{feedback.acceptableMoves.map(answer => answer.moveSan).join(" or ")}</strong>.</> : <>Your move <strong>{exercise.candidateMoveSan}</strong> allowed <strong>{feedback.acceptableMoves.map(answer => answer.moveSan).join(" or ")}</strong> immediately.</>}
                </p>
                <p>{feedback.explanation}</p>
                <p className="board-result-note">{missed ? "The board shows your missed winning move." : "The board now shows the opponent’s punishment; the highlighted squares show their move."}</p>
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
