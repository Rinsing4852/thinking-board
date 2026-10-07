import { useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

import type { Color, OpeningImportResponse } from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { ChessBoard } from "./ChessBoard";
import { OpeningAnalysisSandbox, type SandboxMove } from "./OpeningAnalysisSandbox";
import { OpeningMoveSuggestions } from "./OpeningMoveSuggestions";
import { OpeningPreparationAdvice } from "./OpeningPreparationAdvice";
import { useOpeningDraft } from "../use-opening-draft";
import type { BuiltMove } from "../opening-draft";

interface OpeningBoardBuilderProps {
  ratingGroup: number;
  useExplorer: boolean;
  onCancel: () => void;
  onSaved: (repertoireId: string) => void | Promise<void>;
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
  const { draft, setDraft, recovered, storageError, discard } = useOpeningDraft();
  const { name, learnerColor, moves } = draft;
  const setName = (value: string) => setDraft(current => ({ ...current, name: value }));
  const setLearnerColor = (value: Color) => setDraft(current => ({ ...current, learnerColor: value }));
  const setMoves = (update: (moves: BuiltMove[]) => BuiltMove[]) => setDraft(current => ({ ...current, moves: update(current.moves) }));
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const saveLock = useRef(false);
  const savedId = useRef<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const draftLocked = submitting || savedId.current !== null;
  const fen = moves.at(-1)?.fenAfter ?? START_FEN;
  const turn = fen.split(" ")[1] === "b" ? "black" : "white";
  const isLearnerTurn = turn === learnerColor;
  const learnerMoves = useMemo(
    () => moves.filter((move) => move.fenBefore.split(" ")[1] === (learnerColor === "white" ? "w" : "b")),
    [learnerColor, moves],
  );

  const addMove = (moveUci: string, moveSan: string): void => {
    if (!building || saveLock.current || savedId.current) return;
    const chess = new Chess(fen);
    const played = chess.move({
      from: moveUci.slice(0, 2),
      to: moveUci.slice(2, 4),
      ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
    });
    if (!played) return;
    const next = [...moves, { moveUci, moveSan, fenBefore: fen, fenAfter: chess.fen(), note: "" }];
    setMoves(() => next);
    if (isLearnerTurn) void save(next);
  };

  const updateLastNote = (note: string): void => {
    setMoves((current) => current.map((move, index) => index === current.length - 1 ? { ...move, note } : move));
  };

  const addExploredMoves = (explored: SandboxMove[]): void => {
    if (saveLock.current || savedId.current) return;
    const next = [...moves, ...explored.map(move => ({ ...move, note: "" }))];
    setMoves(() => next);
    setAnalysisOpen(false);
    if (next.some(move => move.fenBefore.split(" ")[1] === (learnerColor === "white" ? "w" : "b"))) void save(next);
  };

  const save = async (sequence = moves): Promise<void> => {
    if (!name.trim() || !sequence.some(move => move.fenBefore.split(" ")[1] === (learnerColor === "white" ? "w" : "b")) || saveLock.current) return;
    saveLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      if (!savedId.current) {
        const response = await post<OpeningImportResponse>("/api/v1/openings/imports/pgn", {
          pgn: pgnFor(name.trim(), sequence),
          learnerColor,
          name: name.trim(),
          sourceType: "self_authored",
          sourceTitle: "Built on the Thinking Board",
          ownershipConfirmed: true,
        });
        savedId.current = response.repertoireIds[0] ?? null;
      }
      if (!savedId.current) throw new Error("The repertoire was saved but could not be opened");
      await onSaved(savedId.current);
      discard();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save this repertoire");
    } finally {
      saveLock.current = false;
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
          <h2>{building ? "Choose your first moves" : "Name your repertoire and choose your side"}</h2>
          <p>{building ? "Play on the board or select a move. Your first response creates the repertoire; each new move then saves automatically." : "Then build one decision at a time: their reply, your response."}</p>
        </div>
        <button className="secondary" disabled={submitting} onClick={onCancel}>Back to repertoires</button>
      </div>

      <div className="panel opening-builder-settings">
        <label>
          Repertoire name
          <input maxLength={120} disabled={building || submitting} value={name} onChange={(event) => setName(event.target.value)} placeholder="My White 1.e4 repertoire" />
        </label>
        <label>
          I am preparing
          <select value={learnerColor} disabled={building || moves.length > 0} onChange={(event) => setLearnerColor(event.target.value as Color)}>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
        <div className="opening-builder-status">
          <strong>{submitting ? "Saving repertoire…" : recovered ? "Recovered draft" : building ? "Ready to build" : "Not started"}</strong>
          <span>{learnerMoves.length} decision{learnerMoves.length === 1 ? "" : "s"} for you</span>
          <small>{storageError || (building ? "Your first response saves this to your server." : "Any unfinished draft is kept on this browser.")}</small>
          <button className="text-button" disabled={submitting || (!name && !moves.length)} onClick={() => {
            if (window.confirm("Discard this unsaved draft? Saved repertoires are not affected.")) {
              discard();
              savedId.current = null;
              setBuilding(false);
              setAnalysisOpen(false);
              setError("");
            }
          }}>Discard draft</button>
        </div>
        {!building && <button disabled={!name.trim() || submitting} onClick={() => {
          setBuilding(true);
          if (learnerMoves.length) void save();
        }}>{recovered ? "Continue building" : "Start building"}</button>}
        {error && <button disabled={submitting} onClick={() => void save()}>{submitting ? "Saving…" : savedId.current ? "Open saved repertoire" : "Retry saving repertoire"}</button>}
      </div>
      {moves.length > 0 && <p className="opening-studio-lock-note">Building for {learnerColor}. Undo every repertoire move before changing colour.</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {building && <div className={`opening-builder-grid ${analysisOpen ? "opening-studio-grid" : "opening-guided-grid"}`}>
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
              <button className="text-button" disabled={draftLocked} onClick={() => setAnalysisOpen((open) => !open)}>{analysisOpen ? "Back to guided choices" : "Open analysis board"}</button>
              <button className="text-button" disabled={moves.length === 0 || draftLocked} onClick={() => setMoves((current) => current.slice(0, -1))}>Undo last move</button>
            </div>
          </div>
          <div className="opening-guided-content">
            <div className="opening-guided-board">
              <ChessBoard
                fen={fen}
                orientation={learnerColor}
                interactive={!draftLocked}
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
                    disabled={draftLocked}
                    onChooseMove={addMove}
                  />
                </>
              )}
              {lastMove && (
                <div className="opening-builder-note">
                  <strong>{lastMoveBelongsToLearner ? `Why ${lastMove.moveSan}?` : `What is the idea behind ${lastMove.moveSan}?`}</strong>
                  <p>Add a short explanation if you know it. Leaving this blank is honest and can be filled in later.</p>
                  <textarea
                    disabled={draftLocked}
                    rows={4}
                    maxLength={1000}
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
          disabled={draftLocked}
        />}
      </div>}
    </div>
  );
}
