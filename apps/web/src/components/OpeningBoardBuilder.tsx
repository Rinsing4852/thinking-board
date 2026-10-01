import { useMemo, useState } from "react";
import { Chess } from "chess.js";

import type { Color, OpeningImportResponse } from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { ChessBoard } from "./ChessBoard";
import { OpeningAnalysisSandbox, type SandboxMove } from "./OpeningAnalysisSandbox";
import { OpeningMoveSuggestions } from "./OpeningMoveSuggestions";
import { OpeningPreparationAdvice } from "./OpeningPreparationAdvice";

interface BuiltMove {
  moveUci: string;
  moveSan: string;
  fenBefore: string;
  fenAfter: string;
  note: string;
}

interface OpeningBoardBuilderProps {
  ratingGroup: number;
  useExplorer: boolean;
  onCancel: () => void;
  onSaved: (repertoireId: string) => void;
}

const START_FEN = new Chess().fen();

function pgnFor(name: string, moves: BuiltMove[]): string {
  const escapedName = name.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const tokens: string[] = [];
  moves.forEach((move, index) => {
    const ply = index + 1;
    if (ply % 2 === 1) tokens.push(`${Math.ceil(ply / 2)}.`);
    tokens.push(move.moveSan);
    const note = move.note.trim().replaceAll("}", "]");
    if (note) tokens.push(`{${note}}`);
  });
  return `[Event "${escapedName}"]\n[Repertoire "${escapedName}"]\n[Result "*"]\n\n${tokens.join(" ")} *`;
}

export function OpeningBoardBuilder({ ratingGroup, useExplorer, onCancel, onSaved }: OpeningBoardBuilderProps) {
  const [name, setName] = useState("");
  const [learnerColor, setLearnerColor] = useState<Color>("white");
  const [moves, setMoves] = useState<BuiltMove[]>([]);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fen = moves.at(-1)?.fenAfter ?? START_FEN;
  const turn = fen.split(" ")[1] === "b" ? "black" : "white";
  const isLearnerTurn = turn === learnerColor;
  const learnerMoves = useMemo(
    () => moves.filter((move) => move.fenBefore.split(" ")[1] === (learnerColor === "white" ? "w" : "b")),
    [learnerColor, moves],
  );

  const addMove = (moveUci: string, moveSan: string): void => {
    const chess = new Chess(fen);
    const played = chess.move({
      from: moveUci.slice(0, 2),
      to: moveUci.slice(2, 4),
      ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
    });
    if (!played) return;
    setMoves((current) => [...current, { moveUci, moveSan, fenBefore: fen, fenAfter: chess.fen(), note: "" }]);
  };

  const updateLastNote = (note: string): void => {
    setMoves((current) => current.map((move, index) => index === current.length - 1 ? { ...move, note } : move));
  };

  const addExploredMoves = (explored: SandboxMove[]): void => {
    setMoves((current) => [
      ...current,
      ...explored.map((move) => ({ ...move, note: "" })),
    ]);
    setAnalysisOpen(false);
  };

  const save = async (): Promise<void> => {
    if (!name.trim() || learnerMoves.length === 0 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await post<OpeningImportResponse>("/api/v1/openings/imports/pgn", {
        pgn: pgnFor(name.trim(), moves),
        learnerColor,
        name: name.trim(),
        sourceType: "self_authored",
        sourceTitle: "Built on the Thinking Board",
        ownershipConfirmed: true,
      });
      const repertoireId = response.repertoireIds[0];
      if (!repertoireId) throw new Error("The repertoire was saved but could not be opened");
      onSaved(repertoireId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save this repertoire");
    } finally {
      setSubmitting(false);
    }
  };

  const lastMove = moves.at(-1);
  const lastMoveBelongsToLearner = lastMove
    ? lastMove.fenBefore.split(" ")[1] === (learnerColor === "white" ? "w" : "b")
    : false;

  return (
    <div className="opening-builder opening-builder-studio">
      <div className="panel opening-builder-heading">
        <div>
          <span className="eyebrow">Opening studio</span>
          <h2>Build your repertoire one decision at a time</h2>
          <p>Choose a practical move beside the board or play one directly. Open the analysis board only when you want to investigate a position more deeply.</p>
        </div>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>

      <div className="panel opening-builder-settings">
        <label>
          Repertoire name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="My White 1.e4 repertoire" />
        </label>
        <label>
          I am preparing
          <select value={learnerColor} disabled={moves.length > 0} onChange={(event) => setLearnerColor(event.target.value as Color)}>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
        <div className="opening-builder-status">
          <strong>{moves.length === 0 ? "No moves saved yet" : `${moves.length} move${moves.length === 1 ? "" : "s"} in this line`}</strong>
          <span>{learnerMoves.length} decision{learnerMoves.length === 1 ? "" : "s"} for you</span>
        </div>
        <button disabled={!name.trim() || learnerMoves.length === 0 || submitting} onClick={() => void save()}>
          {submitting ? "Saving…" : "Save repertoire"}
        </button>
      </div>
      {moves.length > 0 && <p className="opening-studio-lock-note">Building for {learnerColor}. Undo every repertoire move before changing colour.</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className={`opening-builder-grid ${analysisOpen ? "opening-studio-grid" : "opening-guided-grid"}`}>
        <section className={`opening-studio-pane repertoire${analysisOpen ? "" : " guided"}`} aria-label="Repertoire builder board">
          <div className="candidate-banner opening-studio-banner">
            <div>
              <span>My repertoire</span>
              <small>{isLearnerTurn ? "Choose the move you want to remember." : "Add the opponent reply you want to prepare for."}</small>
            </div>
            <strong>{turn === "white" ? "White" : "Black"} to move</strong>
          </div>
          <div className="board-toolbar">
            <span>{analysisOpen ? "Explore separately, then add only the sequence you want" : "A move chosen here is added to this line immediately"}</span>
            <div>
              <button className="text-button" onClick={() => setAnalysisOpen((open) => !open)}>{analysisOpen ? "Back to guided choices" : "Open analysis board"}</button>
              <button className="text-button" disabled={moves.length === 0} onClick={() => setMoves((current) => current.slice(0, -1))}>Undo last move</button>
            </div>
          </div>
          <div className="opening-guided-content">
            <div className="opening-guided-board">
              <ChessBoard
                fen={fen}
                orientation={learnerColor}
                interactive
                lastMove={lastMove?.moveUci ?? null}
                onMove={addMove}
                ariaLabel="Repertoire board"
              />
              <div className="opening-builder-moves" aria-label="Moves in this line">
                {moves.map((move, index) => (
                  <span className={move.fenBefore.split(" ")[1] === (learnerColor === "white" ? "w" : "b") ? "learner" : ""} key={`${move.moveUci}-${index}`}>
                    {index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}{move.moveSan}
                  </span>
                ))}
              </div>
            </div>
            <div className="panel opening-builder-form">
              {!analysisOpen && (
                <>
                  <div className="opening-guided-prompt">
                    <span className="eyebrow">{isLearnerTurn ? "Your repertoire move" : "Opponent reply"}</span>
                    <strong>{isLearnerTurn ? `What will you play as ${learnerColor}?` : "Which reply do you want to prepare for?"}</strong>
                    <small>Choose below to add the move immediately. You can undo it at any time.</small>
                  </div>
                  <OpeningMoveSuggestions
                    fen={fen}
                    learnerColor={learnerColor}
                    ratingGroup={ratingGroup}
                    useExplorer={useExplorer}
                    onChooseMove={addMove}
                  />
                </>
              )}
              {lastMove && (
                <div className="opening-builder-note">
                  <strong>{lastMoveBelongsToLearner ? `Why ${lastMove.moveSan}?` : `What is the idea behind ${lastMove.moveSan}?`}</strong>
                  <p>Add a short explanation if you know it. Leaving this blank is honest and can be filled in later.</p>
                  <textarea
                    rows={4}
                    value={lastMove.note}
                    onChange={(event) => updateLastNote(event.target.value)}
                    placeholder={lastMoveBelongsToLearner ? "For example: Develops with tempo and prepares castling." : "For example: Challenges the centre and opens the bishop."}
                  />
                </div>
              )}
              {lastMove && !lastMoveBelongsToLearner && <OpeningPreparationAdvice target={{
                fen: lastMove.fenBefore, opponentMoveUci: lastMove.moveUci, learnerColor,
              }} />}
              {!lastMove && analysisOpen && <p className="opening-builder-empty-note">Explore on the analysis board, then add the sequence when it makes sense.</p>}
            </div>
          </div>
        </section>

        {analysisOpen && <OpeningAnalysisSandbox
          baseFen={fen}
          orientation={learnerColor}
          ratingGroup={ratingGroup}
          useExplorer={useExplorer}
          onAddMoves={addExploredMoves}
        />}
      </div>
    </div>
  );
}
