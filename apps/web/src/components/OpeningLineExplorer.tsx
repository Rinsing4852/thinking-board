import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

import type {
  OpeningCoverageResponse,
  OpeningLineDeletionResponse,
  OpeningLineDetail,
  OpeningLineMutationResponse,
  OpeningRepertoireDeletionResponse,
  OpeningRepertoireDetailResponse,
  OpeningArchiveResponse,
  OpeningMetadataMutationResponse,
  OpeningMoveUndoResponse,
} from "../../../../packages/contracts/src/api";
import { get, patch, post, remove } from "../api";
import { ChessBoard } from "./ChessBoard";
import { OpeningLearningComment } from "./OpeningLearningComment";
import { OpeningMoveSuggestions } from "./OpeningMoveSuggestions";

interface OpeningLineExplorerProps {
  detail: OpeningRepertoireDetailResponse;
  startingLineId?: string | null;
  initialCoverage?: OpeningCoverageResponse | null;
  preferredRatingGroup: number;
  useExplorer: boolean;
  busy?: boolean;
  onBack: () => void;
  onPractice: (lineId: string) => void;
  onDetailChanged: (detail: OpeningRepertoireDetailResponse) => void;
  onRepertoireDeleted: (repertoireId: string) => void;
}

export function OpeningLineExplorer({
  detail,
  startingLineId,
  initialCoverage = null,
  preferredRatingGroup,
  useExplorer,
  busy = false,
  onBack,
  onPractice,
  onDetailChanged,
  onRepertoireDeleted,
}: OpeningLineExplorerProps) {
  const allLines = useMemo(
    () => detail.chapters.flatMap((chapter) => chapter.lines.map((line) => ({ chapter, line }))),
    [detail],
  );
  const initial = allLines.find(({ line }) => line.id === startingLineId) ?? allLines[0];
  const [lineId, setLineId] = useState(initial?.line.id ?? "");
  const [lineLibraryOpen, setLineLibraryOpen] = useState(false);
  const [ply, setPly] = useState(0);
  const [editing, setEditing] = useState(false);
  const [pendingMove, setPendingMove] = useState<{ uci: string; san: string } | null>(null);
  const [branchTitle, setBranchTitle] = useState("");
  const [newExplanation, setNewExplanation] = useState("");
  const [editingExplanation, setEditingExplanation] = useState(false);
  const [explanationText, setExplanationText] = useState("");
  const [status, setStatus] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [coverage, setCoverage] = useState<OpeningCoverageResponse | null>(initialCoverage);
  const [coverageRating, setCoverageRating] = useState(preferredRatingGroup);
  const [coverageBusy, setCoverageBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<"line" | "repertoire" | null>(null);
  const [repertoireName, setRepertoireName] = useState(detail.repertoire.name);
  const [lineTitle, setLineTitle] = useState(initial?.line.title ?? "");
  const [lastMutation, setLastMutation] = useState<{
    lineId: string;
    moveId: string;
    createdBranch: boolean;
    previousLineId: string;
  } | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const selected = allLines.find(({ line }) => line.id === lineId) ?? initial;
  const line: OpeningLineDetail | undefined = selected?.line;
  const selectedLineIndex = selected?.chapter.lines.findIndex((candidate) => candidate.id === lineId) ?? -1;
  const currentMove = ply > 0 ? line?.moves[ply - 1] : undefined;
  const displayFen = currentMove?.fenAfter ?? line?.moves[0]?.fenBefore ?? "start";

  const setLineArchived = async (archived: boolean): Promise<void> => {
    if (!line || localBusy) return;
    setLocalBusy(true);
    setStatus("");
    try {
      const result = await patch<OpeningArchiveResponse>(
        `/api/v1/openings/repertoires/${detail.repertoire.id}/lines/${line.id}/archive`,
        { archived },
      );
      if (!result.detail) throw new Error("The updated repertoire could not be loaded");
      onDetailChanged(result.detail);
      const nextLine = archived
        ? result.detail.chapters.flatMap((chapter) => chapter.lines).find((candidate) => !candidate.archived)
        : result.detail.chapters.flatMap((chapter) => chapter.lines).find((candidate) => candidate.id === line.id);
      if (nextLine) setLineId(nextLine.id);
      setPly(0);
      setPendingMove(null);
      setEditingExplanation(false);
      setStatus(result.message);
    } catch (archiveError) {
      setStatus(archiveError instanceof Error ? archiveError.message : "Could not update this line");
    } finally {
      setLocalBusy(false);
    }
  };

  const renameRepertoire = async (): Promise<void> => {
    if (localBusy || repertoireName.trim() === detail.repertoire.name) return;
    setLocalBusy(true);
    setStatus("");
    try {
      const result = await patch<OpeningMetadataMutationResponse>(
        `/api/v1/openings/repertoires/${detail.repertoire.id}`,
        { name: repertoireName },
      );
      onDetailChanged(result.detail);
      setStatus(result.message);
    } catch (renameError) {
      setStatus(renameError instanceof Error ? renameError.message : "Could not rename this repertoire");
    } finally {
      setLocalBusy(false);
    }
  };

  const updateLine = async (input: { title?: string; direction?: "earlier" | "later" }): Promise<void> => {
    if (!line || localBusy) return;
    setLocalBusy(true);
    setStatus("");
    try {
      const result = await patch<OpeningMetadataMutationResponse>(
        `/api/v1/openings/repertoires/${detail.repertoire.id}/lines/${line.id}`,
        input,
      );
      onDetailChanged(result.detail);
      setStatus(result.message);
    } catch (updateError) {
      setStatus(updateError instanceof Error ? updateError.message : "Could not update this line");
    } finally {
      setLocalBusy(false);
    }
  };

  useEffect(() => {
    if (!deleteTarget) return;
    deleteDialogRef.current?.focus();
    deleteDialogRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [deleteTarget]);

  useEffect(() => {
    setRepertoireName(detail.repertoire.name);
    setLineTitle(line?.title ?? "");
  }, [detail.repertoire.name, line?.id, line?.title]);

  useEffect(() => {
    if (initialCoverage && initialCoverage.ratingGroup === coverageRating) setCoverage(initialCoverage);
  }, [initialCoverage, coverageRating]);

  useEffect(() => {
    setCoverageRating(preferredRatingGroup);
    setCoverage((current) => current?.ratingGroup === preferredRatingGroup ? current : null);
  }, [preferredRatingGroup]);

  const chooseLine = (nextLineId: string): void => {
    setLineId(nextLineId);
    setPly(0);
    setPendingMove(null);
    setEditingExplanation(false);
    setStatus("");
    setLastMutation(null);
    setLineLibraryOpen(false);
  };

  const choosePly = (nextPly: number): void => {
    setPly(nextPly);
    setPendingMove(null);
    setEditingExplanation(false);
    setStatus("");
    setLastMutation(null);
  };

  const previewNewMove = (uci: string, san: string): void => {
    setPendingMove({ uci, san });
    setNewExplanation("");
    setBranchTitle("");
    setStatus("");
  };

  const saveNewMove = async (): Promise<void> => {
    if (!pendingMove || !line || localBusy) return;
    setLocalBusy(true);
    setStatus("");
    try {
      const result = await post<OpeningLineMutationResponse>(
        `/api/v1/openings/repertoires/${detail.repertoire.id}/lines/${line.id}/moves`,
        {
          afterPly: ply,
          moveUci: pendingMove.uci,
          branchTitle,
          summary: newExplanation,
        },
      );
      onDetailChanged(result.detail);
      setLineId(result.lineId);
      setPly(ply + 1);
      setPendingMove(null);
      setNewExplanation("");
      setBranchTitle("");
      setStatus(result.message);
      setLastMutation({
        lineId: result.lineId,
        moveId: result.moveId,
        createdBranch: result.createdBranch,
        previousLineId: line.id,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save that move");
    } finally {
      setLocalBusy(false);
    }
  };

  const undoLastSave = async (): Promise<void> => {
    if (!lastMutation || localBusy) return;
    setLocalBusy(true);
    setStatus("");
    try {
      if (lastMutation.createdBranch) {
        const result = await remove<OpeningLineDeletionResponse>(
          `/api/v1/openings/repertoires/${detail.repertoire.id}/lines/${lastMutation.lineId}`,
        );
        onDetailChanged(result.detail);
        setLineId(lastMutation.previousLineId);
        setPly(Math.max(0, ply - 1));
        setStatus("The new branch was removed.");
      } else {
        const result = await post<OpeningMoveUndoResponse>(
          `/api/v1/openings/repertoires/${detail.repertoire.id}/lines/${lastMutation.lineId}/moves/undo`,
          { moveId: lastMutation.moveId },
        );
        onDetailChanged(result.detail);
        setLineId(result.lineId);
        setPly(Math.max(0, ply - 1));
        setStatus(result.message);
      }
      setLastMutation(null);
      setPendingMove(null);
    } catch (undoError) {
      setStatus(undoError instanceof Error ? undoError.message : "Could not undo the last save");
    } finally {
      setLocalBusy(false);
    }
  };

  const saveExplanation = async (): Promise<void> => {
    if (!currentMove || localBusy) return;
    setLocalBusy(true);
    setStatus("");
    try {
      const updated = await patch<OpeningRepertoireDetailResponse>(
        `/api/v1/openings/repertoires/${detail.repertoire.id}/moves/${currentMove.id}/explanation`,
        { summary: explanationText },
      );
      onDetailChanged(updated);
      setEditingExplanation(false);
      setStatus("Explanation saved in your private repertoire.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the explanation");
    } finally {
      setLocalBusy(false);
    }
  };

  const deleteSelectedLine = async (): Promise<void> => {
    if (!line || localBusy) return;
    setLocalBusy(true);
    setStatus("");
    try {
      const result = await remove<OpeningLineDeletionResponse>(
        `/api/v1/openings/repertoires/${detail.repertoire.id}/lines/${line.id}`,
      );
      onDetailChanged(result.detail);
      setLineId(result.nextLineId);
      setPly(0);
      setEditingExplanation(false);
      setPendingMove(null);
      setDeleteTarget(null);
      setStatus(result.message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete this line");
    } finally {
      setLocalBusy(false);
    }
  };

  const deleteEntireRepertoire = async (): Promise<void> => {
    if (localBusy) return;
    setLocalBusy(true);
    setStatus("");
    try {
      const result = await remove<OpeningRepertoireDeletionResponse>(
        `/api/v1/openings/repertoires/${detail.repertoire.id}`,
      );
      onRepertoireDeleted(result.deletedRepertoireId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete this repertoire");
      setLocalBusy(false);
    }
  };

  const loadCoverage = async (): Promise<void> => {
    if (coverageBusy) return;
    setCoverageBusy(true);
    setStatus("");
    try {
      setCoverage(await get<OpeningCoverageResponse>(
        `/api/v1/openings/repertoires/${detail.repertoire.id}/coverage?rating=${coverageRating}`,
      ));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not check practical coverage");
    } finally {
      setCoverageBusy(false);
    }
  };

  const updateLearningComment = (moveId: string, comment: string | null): void => {
    onDetailChanged({
      ...detail,
      chapters: detail.chapters.map((chapter) => ({
        ...chapter,
        lines: chapter.lines.map((candidate) => ({
          ...candidate,
          moves: candidate.moves.map((move) => move.id === moveId
            ? { ...move, explanation: { ...move.explanation, personalComment: comment } }
            : move),
        })),
      })),
    });
  };

  const pendingFen = useMemo(() => {
    if (!pendingMove) return displayFen;
    const chess = new Chess(displayFen);
    chess.move({
      from: pendingMove.uci.slice(0, 2),
      to: pendingMove.uci.slice(2, 4),
      ...(pendingMove.uci.length === 5 ? { promotion: pendingMove.uci[4] } : {}),
    });
    return chess.fen();
  }, [displayFen, pendingMove]);
  const savedMoveUcis = useMemo(() => {
    const key = displayFen.split(" ").slice(0, 4).join(" ");
    return allLines.flatMap(({ line: candidate }) => candidate.moves)
      .filter((move) => move.fenBefore.split(" ").slice(0, 4).join(" ") === key)
      .map((move) => move.moveUci)
      .filter((move, index, moves) => moves.indexOf(move) === index);
  }, [allLines, displayFen]);

  if (!line || !selected) {
    return (
      <div className="panel opening-empty-lines">
        <h3>No lines are available yet</h3>
        <p>Add at least one legal line before opening the line explorer.</p>
        <button className="secondary" onClick={onBack}>Back to repertoires</button>
      </div>
    );
  }

  return (
    <div className="opening-workspace">
      <div className="panel opening-workspace-heading">
        <div>
          <span className="eyebrow">Repertoire map</span>
          <h2>{detail.repertoire.name}</h2>
          <p>Inspect every saved line, step through the moves, then practise the exact branch you choose.</p>
        </div>
        <div className="opening-workspace-actions">
          {useExplorer && <label className="coverage-rating">
            Explorer rating
            <select value={coverageRating} onChange={(event) => { setCoverageRating(Number(event.target.value)); setCoverage(null); }}>
              {[1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500].map((rating) => <option key={rating} value={rating}>{rating}+</option>)}
            </select>
          </label>}
          {useExplorer && <button className="secondary" disabled={coverageBusy} onClick={() => void loadCoverage()}>
            {coverageBusy ? "Checking…" : coverage ? "Refresh coverage" : "Check coverage"}
          </button>}
          {detail.repertoire.editable && (
            <button className={editing ? "active" : "secondary"} onClick={() => { setEditing((value) => !value); setPendingMove(null); }}>
              {editing ? "Finish editing" : "Edit lines"}
            </button>
          )}
          <button className="secondary" disabled={localBusy} onClick={() => void setLineArchived(!line.archived)}>
            {localBusy ? "Saving…" : line.archived ? "Restore this line" : "Archive this line"}
          </button>
          <a className="button secondary" href={`/api/v1/openings/repertoires/${detail.repertoire.id}/export.pgn`} download>Export PGN</a>
          <button className="secondary" onClick={onBack}>Back to repertoires</button>
          <button disabled={busy || line.archived || line.learnerDecisionCount === 0} onClick={() => onPractice(line.id)}>
            {busy ? "Starting…" : "Practise this line"}
          </button>
        </div>
      </div>

      {coverage && (
        <div className="panel opening-coverage" role="status">
          <div>
            <span className="eyebrow">Practical coverage · {coverageRating}+ Lichess</span>
            <h3>{coverage.coveragePercent === null ? "No sample yet" : `${coverage.coveragePercent}% of replies covered`}</h3>
            <p>{coverage.message} This measures replies at saved opponent positions, not the chance of reaching the whole line.</p>
          </div>
          <div className="opening-coverage-gaps">
            <strong>{coverage.gaps.length > 0 ? "Biggest missing replies" : "No common missing replies found"}</strong>
            {coverage.gaps.slice(0, 5).map((gap) => (
              <button key={`${gap.positionId}-${gap.moveUci}`} onClick={() => {
                const target = allLines.find(({ line: candidate }) => candidate.title === gap.lineTitle);
                if (target) {
                  setLineId(target.line.id);
                  const targetPly = target.line.moves.find((move) => move.fenBefore.split(" ").slice(0, 4).join(" ") === gap.fen.split(" ").slice(0, 4).join(" "))?.ply;
                  if (targetPly) choosePly(targetPly - 1);
                }
              }}>
                <span><b>{gap.moveSan}</b> after {gap.lineTitle}</span>
                <small>{gap.frequencyPercent}% at this position</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <div className="opening-edit-guide">
          <div>
            <strong>Edit mode:</strong> stop at any position and make a move on the board. At the end it extends this line; in the middle a different move creates a new branch, leaving the original intact.
            {allLines.length === 1 && <small>This is your final line. Delete the repertoire to remove it and start again.</small>}
          </div>
          <div className="opening-edit-metadata">
            <label>Repertoire name
              <span>
                <input value={repertoireName} onChange={(event) => setRepertoireName(event.target.value)} maxLength={120} />
                <button className="secondary" disabled={localBusy || !repertoireName.trim() || repertoireName.trim() === detail.repertoire.name} onClick={() => void renameRepertoire()}>Save</button>
              </span>
            </label>
            <label>Selected line
              <span>
                <input value={lineTitle} onChange={(event) => setLineTitle(event.target.value)} maxLength={120} />
                <button className="secondary" disabled={localBusy || !lineTitle.trim() || lineTitle.trim() === line.title} onClick={() => void updateLine({ title: lineTitle })}>Save</button>
              </span>
            </label>
            <div className="opening-order-actions" aria-label="Line order">
              <button className="secondary" disabled={localBusy || selectedLineIndex <= 0} onClick={() => void updateLine({ direction: "earlier" })}>Move earlier</button>
              <button className="secondary" disabled={localBusy || selectedLineIndex >= selected.chapter.lines.length - 1} onClick={() => void updateLine({ direction: "later" })}>Move later</button>
            </div>
          </div>
          <div className="opening-delete-actions">
            <button
              className="secondary danger-button"
              disabled={allLines.length === 1 || localBusy}
              onClick={() => setDeleteTarget("line")}
            >Delete selected line</button>
            <button
              className="secondary danger-button"
              disabled={localBusy}
              onClick={() => setDeleteTarget("repertoire")}
            >Delete repertoire</button>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div
          className="panel opening-delete-confirm"
          role="alertdialog"
          aria-labelledby="opening-delete-title"
          ref={deleteDialogRef}
          tabIndex={-1}
        >
          <div>
            <span className="eyebrow">Confirm deletion</span>
            <h3 id="opening-delete-title">{deleteTarget === "line" ? `Delete “${line.title}”?` : `Delete “${detail.repertoire.name}”?`}</h3>
            <p>{deleteTarget === "line"
              ? "This line and moves used only by it will be removed. Shared moves stay in your other lines. This cannot be undone."
              : "Every line, explanation and opening-review result in this personal repertoire will be removed. Your imported games stay. This cannot be undone."}</p>
          </div>
          <div className="answer-actions">
            <button className="secondary" disabled={localBusy} onClick={() => setDeleteTarget(null)}>
              {deleteTarget === "line" ? "Keep line" : "Keep repertoire"}
            </button>
            <button className="danger-button danger-confirm" disabled={localBusy} onClick={() => void (deleteTarget === "line" ? deleteSelectedLine() : deleteEntireRepertoire())}>
              {localBusy ? "Deleting…" : deleteTarget === "line" ? "Delete line" : "Delete repertoire"}
            </button>
          </div>
        </div>
      )}
      {status && <div className="opening-workspace-status" aria-live="polite">
        <p className={status.toLowerCase().includes("could not") || status.toLowerCase().includes("not legal") ? "error" : "status"}>{status}</p>
        {lastMutation && <button className="text-button" disabled={localBusy} onClick={() => void undoLastSave()}>Undo last save</button>}
      </div>}

      <button
        className="secondary opening-line-library-toggle"
        aria-expanded={lineLibraryOpen}
        aria-controls="opening-line-library"
        onClick={() => setLineLibraryOpen((open) => !open)}
      >
        {lineLibraryOpen ? "Hide line list" : `Choose another line · ${line.title}`}
      </button>

      <div className="opening-workspace-grid">
        <aside id="opening-line-library" className={`panel opening-line-library ${lineLibraryOpen ? "mobile-open" : ""}`} aria-label="Opening lines">
          <div className="opening-line-library-title">
            <strong>Lines</strong>
            <span>{allLines.length}</span>
          </div>
          {detail.chapters.map((chapter) => (
            <section key={chapter.id}>
              <h3>{chapter.title}</h3>
              <p>{chapter.introduction}</p>
              <div className="opening-line-buttons">
                {chapter.lines.map((candidate) => (
                  <button
                    className={`${candidate.id === line.id ? "active" : ""}${candidate.archived ? " archived" : ""}`.trim()}
                    key={candidate.id}
                    onClick={() => chooseLine(candidate.id)}
                  >
                    <strong>{candidate.title}</strong>
                    <span>{candidate.archived ? "Archived · " : ""}{candidate.learnerDecisionCount} decisions · {candidate.moveCount} moves</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <div className="opening-line-board">
          <div className="candidate-banner">
            <div>
              <span>{selected.chapter.title}</span>
              <small>You are {detail.repertoire.learnerColor}. Your side is nearest.</small>
            </div>
            <strong>{ply === 0 ? "Starting position" : `${ply} / ${line.moveCount}`}</strong>
          </div>
          <div className="board-toolbar opening-line-controls">
            <button className="text-button" disabled={ply === 0} onClick={() => choosePly(0)}>Start</button>
            <button className="text-button" disabled={ply === 0} onClick={() => choosePly(Math.max(0, ply - 1))}>Previous</button>
            <span>{currentMove ? `${currentMove.role === "learner" ? "Your move" : "Opponent"}: ${currentMove.moveSan}` : "Choose a move below or step forward"}</span>
            <button className="text-button" disabled={ply >= line.moveCount} onClick={() => choosePly(Math.min(line.moveCount, ply + 1))}>Next</button>
            <button className="text-button" disabled={ply >= line.moveCount} onClick={() => choosePly(line.moveCount)}>End</button>
          </div>
          <ChessBoard
            fen={pendingFen}
            orientation={detail.repertoire.learnerColor}
            interactive={editing && !pendingMove}
            allowAnnotations
            lastMove={pendingMove?.uci ?? currentMove?.moveUci ?? null}
            onMove={previewNewMove}
          />
          <div className="opening-move-strip" aria-label="Moves in selected line">
            {line.moves.map((move) => (
              <button
                className={move.ply === ply ? "active" : move.role === "learner" ? "learner" : ""}
                key={`${line.id}-${move.ply}`}
                onClick={() => choosePly(move.ply)}
                aria-label={`Go to move ${move.ply}: ${move.moveSan}`}
              >
                {move.ply % 2 === 1 && <small>{Math.ceil(move.ply / 2)}.</small>}
                {move.moveSan}
              </button>
            ))}
          </div>
        </div>

        <aside className="panel opening-move-inspector">
          {editing && !pendingMove && (
            <OpeningMoveSuggestions
              fen={displayFen}
              ratingGroup={coverageRating}
              useExplorer={useExplorer}
              savedMoveUcis={savedMoveUcis}
              onChooseMove={previewNewMove}
            />
          )}
          {pendingMove && (
            <div className="opening-new-move">
              <span className="eyebrow">{ply < line.moveCount ? "New branch" : "Extend line"}</span>
              <h3>{pendingMove.san}</h3>
              <p>{ply < line.moveCount
                ? "This move differs from the saved continuation. Saving creates another line and keeps the original."
                : "This move will be added after the current end of the line."}</p>
              {ply < line.moveCount && <label>Branch name<input value={branchTitle} onChange={(event) => setBranchTitle(event.target.value)} placeholder={`${line.title} — ${pendingMove.san} branch`} /></label>}
              <label>
                {displayFen.split(" ")[1] === (detail.repertoire.learnerColor === "white" ? "w" : "b") ? `Why ${pendingMove.san}?` : `What is the idea behind ${pendingMove.san}?`}
                <textarea rows={4} value={newExplanation} onChange={(event) => setNewExplanation(event.target.value)} placeholder="Optional now — you can add this later." />
              </label>
              <div className="answer-actions">
                <button disabled={localBusy} onClick={() => void saveNewMove()}>{localBusy ? "Saving…" : "Save move"}</button>
                <button className="secondary" disabled={localBusy} onClick={() => setPendingMove(null)}>Choose another</button>
              </div>
            </div>
          )}
          {!pendingMove && <>
          <span className="eyebrow">{currentMove ? currentMove.role === "learner" ? "Your decision" : "Opponent reply" : "Line overview"}</span>
          <h3>{currentMove?.moveSan ?? line.title}</h3>
          {!currentMove && (
            <>
              <p>{line.sanSequence}</p>
              <dl>
                <div><dt>Moves</dt><dd>{line.moveCount}</dd></div>
                <div><dt>Your decisions</dt><dd>{line.learnerDecisionCount}</dd></div>
              </dl>
              <p className="opening-inspector-help">Use Next or select a move below the board to see why it belongs in the repertoire.</p>
            </>
          )}
          {currentMove && (
            <div className="opening-inspector-copy">
              <strong>{currentMove.role === "learner" ? "Why this move" : "What they are trying to do"}</strong>
              <p>{currentMove.role === "opponent" && currentMove.explanation.opponentIdea
                ? currentMove.explanation.opponentIdea
                : currentMove.explanation.summary}</p>
              <strong>What changes</strong>
              <ul>{currentMove.explanation.changes.map((change) => <li key={change}>{change}</li>)}</ul>
              {currentMove.explanation.resultingPlan && <><strong>Plan</strong><p>{currentMove.explanation.resultingPlan}</p></>}
              {currentMove.explanation.tacticalWarning && <><strong>Watch out</strong><p>{currentMove.explanation.tacticalWarning}</p></>}
              {currentMove.explanation.commonMistake && <><strong>Common mistake</strong><p>{currentMove.explanation.commonMistake}</p></>}
              <OpeningLearningComment
                repertoireId={detail.repertoire.id}
                moveId={currentMove.id}
                comment={currentMove.explanation.personalComment}
                onSaved={(comment) => updateLearningComment(currentMove.id, comment)}
              />
              {detail.repertoire.editable && !editingExplanation && (
                <button className="secondary" onClick={() => { setExplanationText(currentMove.explanation.summary); setEditingExplanation(true); }}>
                  Edit explanation
                </button>
              )}
              {detail.repertoire.editable && editingExplanation && (
                <div className="opening-explanation-editor">
                  <label>Your explanation<textarea rows={5} value={explanationText} onChange={(event) => setExplanationText(event.target.value)} /></label>
                  <div className="answer-actions">
                    <button disabled={localBusy || !explanationText.trim()} onClick={() => void saveExplanation()}>{localBusy ? "Saving…" : "Save explanation"}</button>
                    <button className="secondary" onClick={() => setEditingExplanation(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
          </>}
        </aside>
      </div>
    </div>
  );
}
