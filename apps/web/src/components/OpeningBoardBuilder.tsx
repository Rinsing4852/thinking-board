import { useMemo, useState } from "react";
import { Chess } from "chess.js";

import type { Color, OpeningImportResponse } from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { ChessBoard } from "./ChessBoard";
import { OpeningAnalysisSandbox, type SandboxMove } from "./OpeningAnalysisSandbox";

interface BuiltMove {
  moveUci: string;
  moveSan: string;
  fenBefore: string;
  fenAfter: string;
  note: string;
}

interface OpeningBoardBuilderProps {
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

export function OpeningBoardBuilder({ onCancel, onSaved }: OpeningBoardBuilderProps) {
  const [name, setName] = useState("");
  const [learnerColor, setLearnerColor] = useState<Color>("white");
  const [moves, setMoves] = useState<BuiltMove[]>([]);
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
    chess.move({
      from: moveUci.slice(0, 2),
      to: moveUci.slice(2, 4),
      ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
    });
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
          <h2>Build and investigate your repertoire</h2>
          <p>Your repertoire stays on the left. Test engine ideas and common human moves on the right, then deliberately add the line you want to remember.</p>
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

      <div className="opening-builder-grid opening-studio-grid">
        <section className="opening-studio-pane repertoire" aria-label="Repertoire builder board">
          <div className="candidate-banner opening-studio-banner">
            <div>
              <span>My repertoire</span>
              <small>{isLearnerTurn ? "Choose the move you want to remember." : "Add the opponent reply you want to prepare for."}</small>
            </div>
            <strong>{turn === "white" ? "White" : "Black"} to move</strong>
          </div>
          <div className="board-toolbar">
            <span>Changes here become part of the saved line</span>
            <button className="text-button" disabled={moves.length === 0} onClick={() => setMoves((current) => current.slice(0, -1))}>Undo last move</button>
          </div>
          <ChessBoard
            fen={fen}
            orientation={learnerColor}
            interactive
            lastMove={lastMove?.moveUci ?? null}
            onMove={addMove}
            ariaLabel="Repertoire board"
          />
          <div className="panel opening-builder-form">
            <div className="opening-builder-moves">
              {moves.map((move, index) => (
                <span className={move.fenBefore.split(" ")[1] === (learnerColor === "white" ? "w" : "b") ? "learner" : ""} key={`${move.moveUci}-${index}`}>
                  {index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}{move.moveSan}
                </span>
              ))}
            </div>
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
          {!lastMove && <p className="opening-builder-empty-note">Make a move directly, or explore on the analysis board and add the line when it makes sense.</p>}
          </div>
        </section>

        <OpeningAnalysisSandbox baseFen={fen} orientation={learnerColor} onAddMoves={addExploredMoves} />
      </div>
    </div>
  );
}
