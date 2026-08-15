import { useEffect, useState } from "react";
import { Chess } from "chess.js";

import type {
  EmptyTrainingResponse,
  NextPunishBlunderResponse,
  PunishBlunderAnswerResponse,
  PunishBlunderExercise,
} from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { formatMoveLabel } from "../training-language";
import { ChessBoard } from "./ChessBoard";
import { TrainingEmptyState } from "./TrainingEmptyState";

interface PunishBlunderPanelProps {
  refreshToken: number;
  requestedItemId?: string | undefined;
  sessionId?: string | undefined;
  onCompleted: () => void;
}

export function PunishBlunderPanel({ refreshToken, requestedItemId, sessionId, onCompleted }: PunishBlunderPanelProps) {
  const [exercise, setExercise] = useState<PunishBlunderExercise | null>(null);
  const [empty, setEmpty] = useState<EmptyTrainingResponse | null>(null);
  const [phase, setPhase] = useState<"ready" | "answer" | "feedback">("ready");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [displayFen, setDisplayFen] = useState("");
  const [displayMove, setDisplayMove] = useState<string | null>(null);
  const [move, setMove] = useState<{ uci: string; san: string } | null>(null);
  const [feedback, setFeedback] = useState<PunishBlunderAnswerResponse | null>(null);
  const [error, setError] = useState("");

  const loadNext = async (pool = "due"): Promise<void> => {
    setError(""); setMove(null); setFeedback(null);
    try {
      const result = await post<NextPunishBlunderResponse>("/api/v1/training/punish/next", { pool: requestedItemId ? "early" : pool, itemId: requestedItemId });
      if (result.kind === "empty") { setExercise(null); setEmpty(result); return; }
      setExercise(result); setEmpty(null); setDisplayFen(result.fen); setDisplayMove(null);
      setOrientation(result.opponentColor); setPhase("ready");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load exercise"); }
  };
  useEffect(() => { void loadNext(); }, [refreshToken, requestedItemId]);
  const blunderingColor = exercise?.opponentColor === "white" ? "black" : "white";

  const begin = async (): Promise<void> => {
    if (!exercise) return;
    try {
      const started = await post<{ attemptId: string }>(`/api/v1/training/items/${exercise.itemId}/start`, { sessionId });
      setExercise({ ...exercise, attemptId: started.attemptId });
      setPhase("answer");
    } catch (startError) { setError(startError instanceof Error ? startError.message : "Could not start exercise"); }
  };
  const preview = (uci: string, san: string): void => {
    if (!exercise) return;
    const board = new Chess(exercise.fen);
    const applied = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length === 5 ? { promotion: uci[4] } : {}) });
    if (!applied) return;
    setMove({ uci, san }); setDisplayFen(board.fen()); setDisplayMove(uci);
  };
  const show = (result: PunishBlunderAnswerResponse): void => {
    setFeedback(result); setPhase("feedback");
    window.dispatchEvent(new Event("training-completed"));
    const answer = result.acceptableMoves[0];
    if (!exercise || !answer) return;
    const board = new Chess(exercise.fen);
    board.move({ from: answer.moveUci.slice(0, 2), to: answer.moveUci.slice(2, 4), ...(answer.moveUci.length === 5 ? { promotion: answer.moveUci[4] } : {}) });
    setDisplayFen(board.fen()); setDisplayMove(answer.moveUci);
  };
  const submit = async (): Promise<void> => {
    if (!exercise?.attemptId || !move) return;
    try { show(await post<PunishBlunderAnswerResponse>(`/api/v1/training/punish/attempts/${exercise.attemptId}/answer`, { moveUci: move.uci })); }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Could not submit answer"); }
  };
  const reveal = async (): Promise<void> => {
    if (!exercise?.attemptId) return;
    try { show(await post<PunishBlunderAnswerResponse>(`/api/v1/training/punish/attempts/${exercise.attemptId}/reveal`)); }
    catch (revealError) { setError(revealError instanceof Error ? revealError.message : "Could not reveal answer"); }
  };

  return (
    <section className="training-section" id="punish-blunder">
      <div className="training-copy">
        <span className="eyebrow">See it from the other side</span>
        <h2>Punish the Blunder</h2>
        <p>Use the opponent’s pieces to exploit the same mistake immediately. Reverse-side practice turns prevention into a tactical pattern.</p>
      </div>
      {empty && (
        <TrainingEmptyState
          empty={empty}
          onChoosePool={(pool) => void loadNext(pool)}
          noItemsHelp="Import a game with an immediately punishable mistake to create this exercise."
        />
      )}
      {exercise && (
        <div className="trainer-layout">
          <div className="board-column">
            <div className="candidate-banner">
              <div>
                <span>Position after the blunder</span>
                <small>You are now playing {exercise.opponentColor}</small>
              </div>
              <strong>{formatMoveLabel(exercise.moveNumber, blunderingColor, exercise.badMoveSan)}?</strong>
            </div>
            <div className="board-toolbar">
              <span>{feedback ? "Best punishment shown" : `${exercise.opponentColor} to move`}</span>
              <button className="text-button" onClick={() => setOrientation(orientation === "white" ? "black" : "white")}>Flip board</button>
            </div>
            <ChessBoard
              fen={displayFen}
              orientation={orientation}
              interactive={phase === "answer" && !move}
              lastMove={displayMove}
              onMove={preview}
            />
          </div>
          <div className="panel question-card">
            <span className="step-number">04</span>
            <span className="eyebrow">{phase === "feedback" ? "REVIEW" : "PUNISH"}</span>
            {phase === "ready" && (
              <div className="ready-step">
                <h3>The other player just made a mistake: {exercise.badMoveSan}?</h3>
                <p className="instruction">You are switching sides for this exercise. Start with checks, then captures, then threats.</p>
                <button onClick={() => void begin()}>Find the punishment</button>
              </div>
            )}
            {phase === "answer" && (
              <>
                <h3>{exercise.prompt}</h3>
                <p className="instruction">Play one immediate reply on the board by clicking the piece and its destination.</p>
                <div className="selected-answer">
                  {move ? <>
                    Your move: <strong>{move.san}</strong>{" "}
                    <button className="inline-link" onClick={() => {
                      setMove(null);
                      setDisplayFen(exercise.fen);
                      setDisplayMove(null);
                    }}>Change</button>
                  </> : "Select your piece, then its destination."}
                </div>
                <div className="answer-actions">
                  <button disabled={!move} onClick={() => void submit()}>Check punishment</button>
                  <button className="text-button" onClick={() => void reveal()}>Show answer</button>
                </div>
              </>
            )}
            {feedback && (
              <div className={`feedback ${feedback.outcome}`} role="status">
                <span className="feedback-label">{feedback.moveCorrect ? "Found" : "Missed"}</span>
                <h3>{feedback.moveCorrect ? "You punished the mistake" : "This was the immediate punishment"}</h3>
                {move && <p className="answer-comparison">
                  You played <strong>{move.san}</strong>. The strong reply was <strong>{feedback.acceptableMoves.map((answer) => answer.moveSan).join(" or ")}</strong>.
                </p>}
                <p>{feedback.explanation}</p>
                <p className="board-result-note">The board shows the punishment, with its start and destination squares highlighted.</p>
                <div className="checklist-feedback">
                  <span>Pattern reinforcement</span>
                  <p>{feedback.checklistPoint}</p>
                </div>
                <button onClick={() => sessionId ? onCompleted() : void loadNext()}>{sessionId ? "Continue session" : "Next punishment"}</button>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
