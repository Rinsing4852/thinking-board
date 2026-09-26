import { useEffect, useState } from "react";
import { Chess } from "chess.js";

import type { Color } from "../../../../packages/contracts/src/api";
import { ChessBoard } from "./ChessBoard";
import { OpeningMoveSuggestions } from "./OpeningMoveSuggestions";

export interface SandboxMove {
  moveUci: string;
  moveSan: string;
  fenBefore: string;
  fenAfter: string;
}

interface OpeningAnalysisSandboxProps {
  baseFen: string;
  orientation: Color;
  ratingGroup: number;
  useExplorer: boolean;
  onAddMoves: (moves: SandboxMove[]) => void;
}

function applyMove(fen: string, moveUci: string): { fen: string; san: string } {
  const chess = new Chess(fen);
  const move = chess.move({
    from: moveUci.slice(0, 2),
    to: moveUci.slice(2, 4),
    ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
  });
  if (!move) throw new Error("That move is not legal in the analysis position");
  return { fen: chess.fen(), san: move.san };
}

export function OpeningAnalysisSandbox({ baseFen, orientation, ratingGroup, useExplorer, onAddMoves }: OpeningAnalysisSandboxProps) {
  const [fen, setFen] = useState(baseFen);
  const [boardOrientation, setBoardOrientation] = useState(orientation);
  const [moves, setMoves] = useState<SandboxMove[]>([]);
  const [moveError, setMoveError] = useState("");

  useEffect(() => {
    setFen(baseFen);
    setMoves([]);
    setMoveError("");
  }, [baseFen]);
  useEffect(() => setBoardOrientation(orientation), [orientation]);

  const playMove = (moveUci: string, suppliedSan?: string): void => {
    try {
      const applied = applyMove(fen, moveUci);
      setMoves((current) => [...current, {
        moveUci,
        moveSan: suppliedSan ?? applied.san,
        fenBefore: fen,
        fenAfter: applied.fen,
      }]);
      setFen(applied.fen);
      setMoveError("");
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : "Could not explore that move");
    }
  };

  const undo = (): void => {
    const last = moves.at(-1);
    if (!last) return;
    setFen(last.fenBefore);
    setMoves((current) => current.slice(0, -1));
  };

  const reset = (): void => {
    setFen(baseFen);
    setMoves([]);
  };

  const addToRepertoire = (): void => {
    if (moves.length === 0) return;
    onAddMoves(moves);
  };

  const lastMove = moves.at(-1)?.moveUci ?? null;
  const turn = fen.split(" ")[1] === "b" ? "Black" : "White";

  return (
    <section className="opening-sandbox" aria-label="Analysis sandbox">
      <div className="candidate-banner opening-studio-banner">
        <div>
          <span>Analysis sandbox</span>
          <small>Explore freely. Nothing is saved until you add it.</small>
        </div>
        <strong>{turn} to move</strong>
      </div>
      <div className="board-toolbar opening-sandbox-toolbar">
        <span>{moves.length === 0 ? "Synced · right-drag to mark ideas" : `${moves.length} unsaved move${moves.length === 1 ? "" : "s"} · right-drag to mark`}</span>
        <div>
          <button className="text-button" onClick={() => setBoardOrientation((current) => current === "white" ? "black" : "white")}>Flip board</button>
          <button className="text-button" disabled={moves.length === 0} onClick={undo}>Undo</button>
          <button className="text-button" disabled={moves.length === 0} onClick={reset}>Reset</button>
        </div>
      </div>
      <ChessBoard
        fen={fen}
        orientation={boardOrientation}
        interactive
        allowAnnotations
        lastMove={lastMove}
        onMove={(uci, san) => playMove(uci, san)}
        ariaLabel="Analysis board"
      />
      <div className="opening-sandbox-moves" aria-label="Unsaved analysis moves">
        {moves.length === 0 && <span>Move on this board or choose an idea below.</span>}
        {moves.map((move, index) => <b key={`${move.moveUci}-${index}`}>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}{move.moveSan}</b>)}
      </div>

      <OpeningMoveSuggestions
        fen={fen}
        ratingGroup={ratingGroup}
        useExplorer={useExplorer}
        onChooseMove={(moveUci, moveSan) => playMove(moveUci, moveSan)}
      />
      {moveError && <p className="error">{moveError}</p>}

      <button className="opening-add-analysis" disabled={moves.length === 0} onClick={addToRepertoire}>
        Add {moves.length || "explored"} move{moves.length === 1 ? "" : "s"} to my repertoire
      </button>
    </section>
  );
}
