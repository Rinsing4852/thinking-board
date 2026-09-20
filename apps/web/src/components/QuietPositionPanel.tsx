import { useEffect, useState } from "react";
import { Chess } from "chess.js";

import type {
  EmptyTrainingResponse,
  NextQuietPositionResponse,
  QuietPositionAnswerResponse,
  QuietPositionExercise,
} from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { formatMoveLabel } from "../training-language";
import { ChessBoard } from "./ChessBoard";
import { TrainingEmptyState } from "./TrainingEmptyState";

interface QuietPositionPanelProps {
  refreshToken: number;
  requestedItemId?: string | undefined;
  sessionId?: string | undefined;
  onCompleted: () => void;
}

export function QuietPositionPanel({ refreshToken, requestedItemId, sessionId, onCompleted }: QuietPositionPanelProps) {
  const [exercise, setExercise] = useState<QuietPositionExercise | null>(null);
  const [empty, setEmpty] = useState<EmptyTrainingResponse | null>(null);
  const [phase, setPhase] = useState<"ready" | "piece" | "move" | "feedback">("ready");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [pieceSquare, setPieceSquare] = useState<string | null>(null);
  const [move, setMove] = useState<{ uci: string; san: string } | null>(null);
  const [displayFen, setDisplayFen] = useState("");
  const [displayMove, setDisplayMove] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<QuietPositionAnswerResponse | null>(null);
  const [error, setError] = useState("");

  const loadNext = async (pool = "due"): Promise<void> => {
    setError(""); setPieceSquare(null); setMove(null); setFeedback(null);
    try {
      const result = await post<NextQuietPositionResponse>("/api/v1/training/quiet/next", { pool: requestedItemId ? "early" : pool, itemId: requestedItemId });
      if (result.kind === "empty") { setExercise(null); setEmpty(result); return; }
      setExercise(result); setEmpty(null); setDisplayFen(result.fen); setDisplayMove(null);
      setOrientation(result.playerColor); setPhase("ready");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load quiet position"); }
  };
  useEffect(() => { void loadNext(); }, [refreshToken, requestedItemId]);

  const begin = async (): Promise<void> => {
    if (!exercise) return;
    try {
      const started = await post<{ attemptId: string }>(`/api/v1/training/items/${exercise.itemId}/start`, { sessionId });
      setExercise({ ...exercise, attemptId: started.attemptId });
      setPhase("piece");
    } catch (startError) { setError(startError instanceof Error ? startError.message : "Could not start exercise"); }
  };
  const preview = (uci: string, san: string): void => {
    if (!exercise) return;
    const board = new Chess(exercise.fen);
    const applied = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length === 5 ? { promotion: uci[4] } : {}) });
    if (!applied) return;
    setMove({ uci, san }); setDisplayFen(board.fen()); setDisplayMove(uci);
  };
  const show = (result: QuietPositionAnswerResponse): void => {
    setFeedback(result); setPhase("feedback");
    window.dispatchEvent(new Event("training-completed"));
    const answer = result.acceptableMoves[0];
    if (!exercise || !answer) return;
    const board = new Chess(exercise.fen);
    board.move({ from: answer.moveUci.slice(0, 2), to: answer.moveUci.slice(2, 4), ...(answer.moveUci.length === 5 ? { promotion: answer.moveUci[4] } : {}) });
    setDisplayFen(board.fen()); setDisplayMove(answer.moveUci);
  };
  const submit = async (): Promise<void> => {
    if (!exercise?.attemptId || !pieceSquare || !move) return;
    try { show(await post<QuietPositionAnswerResponse>(`/api/v1/training/quiet/attempts/${exercise.attemptId}/answer`, { square: pieceSquare, moveUci: move.uci })); }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Could not submit answer"); }
  };
  const reveal = async (): Promise<void> => {
    if (!exercise?.attemptId) return;
    try { show(await post<QuietPositionAnswerResponse>(`/api/v1/training/quiet/attempts/${exercise.attemptId}/reveal`)); }
    catch (revealError) { setError(revealError instanceof Error ? revealError.message : "Could not reveal answer"); }
  };

  return (
    <section className="training-section" id="quiet-position">
      <div className="training-copy">
        <span className="eyebrow">When nothing is forcing</span>
        <h2>Quiet Position</h2>
        <p>After checks, captures, and threats are exhausted, find a piece whose role can be improved.</p>
      </div>
      {empty && (
        <TrainingEmptyState
          empty={empty}
          onChoosePool={(pool) => void loadNext(pool)}
          noItemsHelp="Import more games to find positions without an immediate tactic."
        />
      )}
      {exercise && (
        <div className="trainer-layout">
          <div className="board-column">
            <div className="candidate-banner">
              <div><span>Quiet position</span><small>You are {exercise.playerColor}</small></div>
              <strong>{formatMoveLabel(exercise.moveNumber, exercise.playerColor)}</strong>
            </div>
            <div className="board-toolbar">
              <span>{phase === "feedback" ? "A useful improvement is shown" : "No immediate tactic is required"}</span>
              <button className="text-button" onClick={() => setOrientation(orientation === "white" ? "black" : "white")}>Flip board</button>
            </div>
            <ChessBoard
              fen={displayFen}
              orientation={orientation}
              interactive={phase === "piece" || (phase === "move" && !move)}
              selectedSquare={pieceSquare}
              highlightedSquares={feedback?.weakestSquares ?? []}
              lastMove={displayMove}
              {...(phase === "piece" ? { onSquareSelect: setPieceSquare } : {})}
              {...(phase === "move" ? { onMove: preview } : {})}
            />
          </div>
          <div className="panel question-card">
            <span className="step-number">05</span>
            <span className="eyebrow">{phase === "feedback" ? "REVIEW" : "IMPROVE"}</span>
            {phase === "ready" && (
              <div className="ready-step">
                <h3>No useful check, capture, or immediate threat stands out.</h3>
                <p className="instruction">Now ask which piece has little useful work and could take on a better role.</p>
                <button onClick={() => void begin()}>Assess my pieces</button>
              </div>
            )}
            {phase === "piece" && (
              <>
                <h3>Which piece could improve its role most?</h3>
                <p className="instruction">Click one of your pieces. A piece may need improving if it is undeveloped, blocked, exposed, or has few useful squares. More than one plan can be reasonable.</p>
                <div className="selected-answer">{pieceSquare ? <>Selected piece: <strong>{pieceSquare}</strong></> : "Select one of your pieces."}</div>
                <div className="answer-actions">
                  <button disabled={!pieceSquare} onClick={() => setPhase("move")}>Choose an improvement</button>
                  <button className="text-button" onClick={() => void reveal()}>Show an example</button>
                </div>
              </>
            )}
            {phase === "move" && (
              <>
                <h3>Which move gives that piece a better job?</h3>
                <p className="instruction">Play one quiet improving move. Tap or click a piece and a highlighted square, or drag the piece.</p>
                <div className="selected-answer">
                  {move ? <>
                    Your candidate: <strong>{move.san}</strong>{" "}
                    <button className="inline-link" onClick={() => {
                      setMove(null);
                      setDisplayFen(exercise.fen);
                      setDisplayMove(null);
                    }}>Change</button>
                  </> : `Improve the piece you selected on ${pieceSquare}.`}
                </div>
                <div className="answer-actions">
                  <button disabled={!move} onClick={() => void submit()}>Check improvement</button>
                  <button className="text-button" onClick={() => void reveal()}>Show an example</button>
                </div>
              </>
            )}
            {feedback && (
              <div className={`feedback ${feedback.outcome}`} role="status">
                <span className="feedback-label">{feedback.outcome === "excellent" ? "Useful plan" : feedback.outcome === "partial" ? "Partly seen" : "Compare plans"}</span>
                <h3>{feedback.pieceCorrect && feedback.moveCorrect
                  ? "You found an engine-supported improvement"
                  : feedback.pieceCorrect
                    ? "Useful piece, different move"
                    : feedback.moveCorrect
                      ? "Useful move, different piece choice"
                      : "Here is one useful improvement"}</h3>
                {pieceSquare && <p className="answer-comparison">
                  You selected <strong>{pieceSquare}</strong>{move ? <> and played <strong>{move.san}</strong></> : null}. One supported plan starts from <strong>{feedback.weakestSquares.join(" or ")}</strong> and plays <strong>{feedback.acceptableMoves.map((answer) => answer.moveSan).join(" or ")}</strong>.
                </p>}
                <p>{feedback.explanation}</p>
                <p className="board-result-note">The board shows one engine-supported example. It is not claiming that every other plan is wrong.</p>
                <div className="checklist-feedback">
                  <span>Thinking-process skill: Quiet improvement</span>
                  <p>{feedback.checklistPoint}</p>
                </div>
                <button onClick={() => sessionId ? onCompleted() : void loadNext()}>{sessionId ? "Continue session" : "Next quiet position"}</button>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
