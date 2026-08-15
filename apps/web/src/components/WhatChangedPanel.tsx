import { useEffect, useState } from "react";

import type {
  EmptyTrainingResponse,
  NextWhatChangedResponse,
  WhatChangedAnswerResponse,
  WhatChangedCategory,
  WhatChangedExercise,
} from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { changeCategoryLabel, formatMoveLabel, WHAT_CHANGED_OPTIONS } from "../training-language";
import { ChessBoard } from "./ChessBoard";
import { TrainingEmptyState } from "./TrainingEmptyState";

interface WhatChangedPanelProps {
  refreshToken: number;
  requestedItemId?: string | undefined;
  sessionId?: string | undefined;
  onCompleted: () => void;
}

export function WhatChangedPanel({ refreshToken, requestedItemId, sessionId, onCompleted }: WhatChangedPanelProps) {
  const [exercise, setExercise] = useState<WhatChangedExercise | null>(null);
  const [empty, setEmpty] = useState<EmptyTrainingResponse | null>(null);
  const [displayFen, setDisplayFen] = useState("");
  const [phase, setPhase] = useState<"observe" | "answer" | "feedback">("observe");
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [category, setCategory] = useState<WhatChangedCategory | null>(null);
  const [square, setSquare] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<WhatChangedAnswerResponse | null>(null);
  const [error, setError] = useState("");

  const loadNext = async (pool = "due"): Promise<void> => {
    setError("");
    setFeedback(null);
    setCategory(null);
    setSquare(null);
    try {
      const result = await post<NextWhatChangedResponse>("/api/v1/training/what-changed/next", { pool: requestedItemId ? "early" : pool, itemId: requestedItemId });
      if (result.kind === "empty") {
        setExercise(null);
        setEmpty(result);
        return;
      }
      setEmpty(null);
      setExercise(result);
      setDisplayFen(result.fenBeforeOpponent);
      setOrientation(result.playerColor);
      setPhase("observe");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load exercise");
    }
  };

  useEffect(() => { void loadNext(); }, [refreshToken, requestedItemId]);

  const opponentColor = exercise?.playerColor === "white" ? "black" : "white";
  const moveLabel = exercise
    ? formatMoveLabel(exercise.moveNumber, opponentColor, exercise.opponentMoveSan)
    : "";

  const playOpponentMove = async (): Promise<void> => {
    if (!exercise) return;
    try {
      const started = await post<{ attemptId: string }>(`/api/v1/training/items/${exercise.itemId}/start`, { sessionId });
      setExercise({ ...exercise, attemptId: started.attemptId });
      setDisplayFen(exercise.fenAfterOpponent);
      setPhase("answer");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start exercise");
    }
  };

  const submit = async (): Promise<void> => {
    if (!exercise?.attemptId || !category || (!square && category !== "nothing_urgent")) return;
    try {
      const result = await post<WhatChangedAnswerResponse>(
        `/api/v1/training/what-changed/attempts/${exercise.attemptId}/answer`,
        { category, square: square ?? "" },
      );
      setFeedback(result);
      setPhase("feedback");
      window.dispatchEvent(new Event("training-completed"));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit answer");
    }
  };

  const reveal = async (): Promise<void> => {
    if (!exercise?.attemptId) return;
    try {
      const result = await post<WhatChangedAnswerResponse>(
        `/api/v1/training/what-changed/attempts/${exercise.attemptId}/reveal`,
      );
      setFeedback(result);
      setPhase("feedback");
      window.dispatchEvent(new Event("training-completed"));
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : "Could not reveal answer");
    }
  };

  return (
    <section className="training-section what-changed-section" id="what-changed">
      <div className="training-copy">
        <span className="eyebrow">Attention before calculation</span>
        <h2>What Changed?</h2>
        <p>Watch their move first. Identify what it attacks, uncovers, removes, or threatens before generating candidates.</p>
      </div>

      {empty && <TrainingEmptyState
        empty={empty}
        onChoosePool={(pool) => void loadNext(pool)}
        noItemsHelp="Import another game to find positions where an opponent’s move created a clear new danger."
      />}

      {exercise && (
        <div className="trainer-layout">
          <div className="board-column">
            <div className="candidate-banner">
              <div>
                <span>{phase === "observe" ? "Position before their move" : "Position after their move"}</span>
                <small>You are {exercise.playerColor}. {orientation === exercise.playerColor ? "Your side is nearest." : "Board flipped."}</small>
              </div>
              <strong>{phase === "observe" ? "Move hidden" : moveLabel}</strong>
            </div>
            <div className="board-toolbar">
              <span>{phase === "observe" ? "Study the position, then reveal their move" : feedback ? "Answer squares highlighted" : `Their last move was ${exercise.opponentMoveSan}`}</span>
              <button className="text-button" onClick={() => setOrientation(orientation === "white" ? "black" : "white")}>Flip board</button>
            </div>
            <ChessBoard
              fen={displayFen}
              orientation={orientation}
              interactive={phase === "answer"}
              lastMove={phase === "observe" ? null : exercise.opponentMoveUci}
              selectedSquare={square}
              highlightedSquares={feedback?.correctSquares ?? []}
              onSquareSelect={(selected) => setSquare(selected)}
            />
          </div>

          <div className="panel question-card">
            <span className="step-number">01</span>
            <span className="eyebrow">{phase === "observe" ? "SEE" : phase === "answer" ? "NOTICE" : "REVIEW"}</span>
            {phase === "observe" && (
              <div className="ready-step">
                <h3>First, look at the position.</h3>
                <p className="instruction">Do not calculate yet. When you are ready, show the opponent’s move and ask what changed.</p>
                <button onClick={() => void playOpponentMove()}>Play their last move</button>
              </div>
            )}

            {phase === "answer" && (
              <>
                <h3>{exercise.prompt}</h3>
                <p className="move-context">They just played <strong>{exercise.opponentMoveSan}</strong>.</p>
                <p className="instruction">Choose the most important change, then click the affected piece or square. The short explanation below the choices can help while you learn the terms.</p>
                <div className="change-category-grid">
                  {WHAT_CHANGED_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={category === option.value ? "change-category active" : "change-category"}
                      onClick={() => setCategory(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {category && <p className="term-help">{WHAT_CHANGED_OPTIONS.find((option) => option.value === category)?.description}</p>}
                <div className="selected-answer">
                  {square ? <>Selected square: <strong>{square}</strong></> : "Click the affected piece or square on the board."}
                </div>
                <div className="answer-actions">
                  <button disabled={!category || (!square && category !== "nothing_urgent")} onClick={() => void submit()}>Check my observation</button>
                  <button className="text-button" onClick={() => void reveal()}>Show answer</button>
                </div>
              </>
            )}

            {feedback && (
              <div className={`feedback ${feedback.outcome}`} role="status">
                <span className="feedback-label">{feedback.outcome === "excellent" ? "Seen" : feedback.outcome === "partial" ? "Partly seen" : "Missed"}</span>
                <h3>{feedback.outcome === "excellent"
                  ? "You noticed the important change"
                  : feedback.categoryCorrect
                    ? "Right change, wrong square"
                    : feedback.squareCorrect
                      ? "Right square, wrong reason"
                      : "This is what changed"}</h3>
                {category && <p className="answer-comparison">
                  You chose <strong>{changeCategoryLabel(category)}</strong>{square ? <> on <strong>{square}</strong></> : null}.
                  {!feedback.categoryCorrect && <> The key change was <strong>{changeCategoryLabel(feedback.correctCategory)}</strong>.</>}
                  {!feedback.squareCorrect && feedback.correctSquares.length > 0 && <> Look at <strong>{feedback.correctSquares.join(" or ")}</strong>, highlighted on the board.</>}
                </p>}
                <p>{feedback.explanation}</p>
                <p className="board-result-note">The relevant pieces are highlighted on the board.</p>
                <div className="checklist-feedback">
                  <span>Thinking-process skill: Last-move awareness</span>
                  <p>{feedback.checklistPoint}</p>
                </div>
                <button onClick={() => sessionId ? onCompleted() : void loadNext()}>{sessionId ? "Continue session" : "Next observation"}</button>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
