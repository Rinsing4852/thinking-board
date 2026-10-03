import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

import type {
  OpeningCoverageGap,
  OpeningCoverageResponse,
  OpeningLineDeletionResponse,
  OpeningLineDetail,
  OpeningLineMutationResponse,
  OpeningLineProgress,
  OpeningRepertoireDeletionResponse,
  OpeningRepertoireDetailResponse,
  OpeningArchiveResponse,
  OpeningMetadataMutationResponse,
  OpeningMoveUndoResponse,
} from "../../../../packages/contracts/src/api";
import { get, patch, post, remove } from "../api";
import { findPlyAtFen } from "../opening-line-position";
import { countTranspositions } from "../opening-transpositions";
import { parseOpeningLocation, openingLocationHash } from "../opening-location";
import { buildOpeningNavigation, openingGraphKey, openingMoveLabel, savedContinuations, switchLineDestination } from "../opening-navigation";
import { ChessBoard } from "./ChessBoard";
import { OpeningLearningComment } from "./OpeningLearningComment";
import { OpeningMoveSuggestions } from "./OpeningMoveSuggestions";
import { OpeningPreparationAdvice } from "./OpeningPreparationAdvice";
import { OpeningBranchNavigation } from "./OpeningBranchNavigation";
import { OpeningLineLibrary } from "./OpeningLineLibrary";
import { OpeningPracticeSelection } from "./OpeningPracticeSelection";
import { OpeningExplanation } from "./OpeningExplanation";
import { useOpeningBranchDraft } from "../use-opening-branch-draft";

interface OpeningLineExplorerProps {
  detail: OpeningRepertoireDetailResponse;
  startingLineId?: string | null;
  startingGap?: OpeningCoverageGap | null;
  initialCoverage?: OpeningCoverageResponse | null;
  preferredRatingGroup: number;
  useExplorer: boolean;
  lineProgress: OpeningLineProgress[];
  busy?: boolean;
  onBack: () => void;
  onPractice: (lineId: string) => void;
  onDetailChanged: (detail: OpeningRepertoireDetailResponse) => void;
  onRepertoireDeleted: (repertoireId: string) => void;
  onPracticeSelectionChanged: () => Promise<void>;
}

export function OpeningLineExplorer({
  detail,
  startingLineId,
  startingGap = null,
  initialCoverage = null,
  preferredRatingGroup,
  useExplorer,
  lineProgress,
  busy = false,
  onBack,
  onPractice,
  onDetailChanged,
  onRepertoireDeleted,
  onPracticeSelectionChanged,
}: OpeningLineExplorerProps) {
  const allLines = useMemo(
    () => detail.chapters.flatMap((chapter) => chapter.lines.map((line) => ({ chapter, line }))),
    [detail],
  );
  const progressByLine = useMemo(
    () => new Map(lineProgress.map((progress) => [progress.lineId, progress])),
    [lineProgress],
  );
  const transpositionsByLine = useMemo(() => countTranspositions(allLines.map(({ line }) => line)), [allLines]);
  const navigation = useMemo(() => buildOpeningNavigation(detail.chapters), [detail.chapters]);
  const graphKey = useMemo(() => openingGraphKey(detail.chapters), [detail.chapters]);
  const coverageGraphRef = useRef(graphKey);
  const gapPlyForLine = (candidate: OpeningLineDetail, gap: OpeningCoverageGap): number | null => {
    return findPlyAtFen(candidate.moves, gap.fen);
  };
  const gapInitial = startingGap
    ? allLines.find(({ line: candidate }) => candidate.title === startingGap.lineTitle && gapPlyForLine(candidate, startingGap) !== null)
      ?? allLines.find(({ line: candidate }) => gapPlyForLine(candidate, startingGap) !== null)
    : undefined;
  const savedLocation = parseOpeningLocation(window.location.hash);
  const savedLineId = savedLocation?.repertoireId === detail.repertoire.id ? savedLocation.lineId : null;
  const initial = gapInitial ?? allLines.find(({ line }) => line.id === (startingLineId ?? savedLineId)) ?? allLines[0];
  const initialPly = initial && startingGap ? gapPlyForLine(initial.line, startingGap) ?? 0
    : initial && savedLineId === initial.line.id ? Math.min(savedLocation!.ply, initial.line.moves.length) : 0;
  const [lineId, setLineId] = useState(initial?.line.id ?? "");
  const [lineLibraryOpen, setLineLibraryOpen] = useState(false);
  const [ply, setPly] = useState(initialPly);
  useEffect(() => {
    const hash = openingLocationHash({ repertoireId: detail.repertoire.id, lineId, ply });
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }, [detail.repertoire.id, lineId, ply]);
  const [editing, setEditing] = useState(Boolean(startingGap));
  const [pendingMove, setPendingMove] = useState<{ uci: string; san: string } | null>(startingGap
    ? { uci: startingGap.moveUci, san: startingGap.moveSan }
    : null);
  const [preparingGap, setPreparingGap] = useState<OpeningCoverageGap | null>(startingGap);
  const [branchTitle, setBranchTitle] = useState("");
  const [newExplanation, setNewExplanation] = useState("");
  const [editingExplanation, setEditingExplanation] = useState(false);
  const [editingComment, setEditingComment] = useState(false);
  const [showSourceMarks, setShowSourceMarks] = useState(false);
  const [returnPositions, setReturnPositions] = useState<Array<{ lineId: string; ply: number }>>([]);
  const [explanationText, setExplanationText] = useState("");
  const [status, setStatus] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [coverage, setCoverage] = useState<OpeningCoverageResponse | null>(initialCoverage);
  const [coverageRating, setCoverageRating] = useState(preferredRatingGroup);
  const [coverageBusy, setCoverageBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<"line" | "repertoire" | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [repertoireName, setRepertoireName] = useState(detail.repertoire.name);
  const [lineTitle, setLineTitle] = useState(initial?.line.title ?? "");
  const [lastMutation, setLastMutation] = useState<{
    lineId: string;
    moveId: string;
    createdBranch: boolean;
    previousLineId: string;
  } | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const coverageRequestRef = useRef<AbortController | null>(null);
  const selected = allLines.find(({ line }) => line.id === lineId) ?? initial;
  const line: OpeningLineDetail | undefined = selected?.line;
  const selectedProgress = line ? progressByLine.get(line.id) : undefined;
  const selectedTranspositions = line ? transpositionsByLine.get(line.id) ?? 0 : 0;
  const selectedLineIndex = selected?.chapter.lines.findIndex((candidate) => candidate.id === lineId) ?? -1;
  const currentMove = ply > 0 ? line?.moves[ply - 1] : undefined;
  const sourceMarks = currentMove?.explanation.boardAnnotations ?? [];
  useEffect(() => setShowSourceMarks(false), [lineId, ply]);
  const displayFen = currentMove?.fenAfter ?? line?.moves[0]?.fenBefore ?? "start";
  const navigationBlocked = localBusy || busy || selectionBusy || Boolean(pendingMove) || editingExplanation || editingComment;
  const lineDisplayTitle = navigation.branches.get(lineId)?.title ?? line?.title ?? "";
  const previousPosition = returnPositions.findLast(position => navigation.lines.has(position.lineId)) ?? null;
  const sharedMoveCount = currentMove ? navigation.moveUses.get(currentMove.id)?.size ?? 1 : 0;
  const branchDraft = useOpeningBranchDraft(detail.repertoire.id, pendingMove ? {
    graphKey, lineId, ply, move: pendingMove, title: branchTitle, explanation: newExplanation,
  } : null);
  const restoreDraft = () => {
    const draft = branchDraft.recovery;
    const savedLine = draft ? navigation.lines.get(draft.lineId)?.line : null;
    if (!draft || draft.graphKey !== graphKey || !savedLine || draft.ply > savedLine.moveCount) return;
    const fen = draft.ply ? savedLine.moves[draft.ply - 1]!.fenAfter : savedLine.moves[0]!.fenBefore;
    try {
      const chess = new Chess(fen);
      const move = chess.move({ from: draft.move.uci.slice(0, 2), to: draft.move.uci.slice(2, 4),
        ...(draft.move.uci[4] ? { promotion: draft.move.uci[4] } : {}) });
      setLineId(draft.lineId); setPly(draft.ply); setEditing(true); setPendingMove({ uci: draft.move.uci, san: move.san });
      setBranchTitle(draft.title); setNewExplanation(draft.explanation); setNotesOpen(true);
    } catch { setStatus("This draft move is no longer legal here. Copy its note before discarding it."); }
  };

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

  useEffect(() => {
    coverageRequestRef.current?.abort();
    setCoverageBusy(false);
    if (coverageGraphRef.current !== graphKey) { setCoverage(null); coverageGraphRef.current = graphKey; }
    return () => { coverageRequestRef.current?.abort(); };
  }, [graphKey, coverageRating]);

  const navigateTo = (nextLineId: string, nextPly: number, remember = true): void => {
    if (navigationBlocked) return;
    const nextLine = navigation.lines.get(nextLineId)?.line;
    if (!nextLine) return;
    if (remember && nextLineId !== lineId) setReturnPositions(previous => [...previous, { lineId, ply }].slice(-20));
    setLineId(nextLineId);
    setPly(Math.min(nextLine.moveCount, Math.max(0, nextPly)));
    setPendingMove(null);
    setEditingExplanation(false);
    setStatus("");
    setLastMutation(null);
    setPreparingGap(null);
    setLineLibraryOpen(false);
  };

  const chooseLine = (nextLineId: string): void => {
    const target = switchLineDestination(navigation, lineId, ply, nextLineId);
    navigateTo(target.lineId, target.ply);
  };

  const returnToPreviousLine = (): void => {
    if (!previousPosition || navigationBlocked) return;
    const previousIndex = returnPositions.lastIndexOf(previousPosition);
    setReturnPositions(returnPositions.slice(0, previousIndex));
    navigateTo(previousPosition.lineId, previousPosition.ply, false);
  };

  const choosePly = (nextPly: number): void => {
    if (navigationBlocked) return;
    setPly(nextPly);
    setPendingMove(null);
    setEditingExplanation(false);
    setStatus("");
    setLastMutation(null);
    setPreparingGap(null);
  };

  const focusCoverageGap = (gap: OpeningCoverageGap): void => {
    if (navigationBlocked) return;
    const target = allLines.find(({ line: candidate }) => candidate.title === gap.lineTitle && gapPlyForLine(candidate, gap) !== null)
      ?? allLines.find(({ line: candidate }) => gapPlyForLine(candidate, gap) !== null);
    if (!target) {
      setStatus("That source position is no longer in a saved line. Refresh coverage and try again.");
      return;
    }
    const targetPly = gapPlyForLine(target.line, gap);
    if (targetPly === null) return;
    setLineId(target.line.id);
    setPly(targetPly);
    setEditing(true);
    setPendingMove({ uci: gap.moveUci, san: gap.moveSan });
    setPreparingGap(gap);
    setBranchTitle("");
    setNewExplanation("");
    setEditingExplanation(false);
    setLastMutation(null);
    setStatus("");
  };

  const previewNewMove = (uci: string, san: string): void => {
    const saved = savedContinuations(navigation, lineId, ply).find(choice => choice.moveUci === uci);
    if (saved) { navigateTo(saved.target.lineId, saved.target.ply); return; }
    if (!editing) { setStatus(`${san} is not a saved continuation here. Use Edit lines if you want to add it. No changes were saved.`); return; }
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
      branchDraft.clear();
      setPendingMove(null);
      setNewExplanation("");
      setBranchTitle("");
      setStatus(preparingGap
        ? `${preparingGap.moveSan} is now in this branch. The board has moved forward—choose your response next.`
        : result.message);
      setPreparingGap(null);
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
        if (result.detail === null) { onRepertoireDeleted(result.deletedRepertoireId); return; }
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
      if (result.detail === null) {
        onRepertoireDeleted(result.deletedRepertoireId);
        return;
      }
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
    const controller = new AbortController();
    coverageRequestRef.current?.abort(); coverageRequestRef.current = controller;
    try {
      const result = await get<OpeningCoverageResponse>(
        `/api/v1/openings/repertoires/${detail.repertoire.id}/coverage?rating=${coverageRating}`,
        controller.signal,
      );
      if (!controller.signal.aborted) setCoverage(result);
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : "Could not check practical coverage");
    } finally {
      if (!controller.signal.aborted) setCoverageBusy(false);
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
    return savedContinuations(navigation, lineId, ply).map(choice => choice.moveUci);
  }, [navigation, lineId, ply]);

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
    <div className="opening-workspace board-first-workspace" onKeyDown={event => {
      if (!event.altKey || navigationBlocked || (event.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); choosePly(Math.max(0, Math.min(line.moveCount, ply + (event.key === "ArrowRight" ? 1 : -1))));
      }
    }}>
      <div className="panel opening-workspace-heading">
        <div>
          <span className="eyebrow">{editing ? "Build" : "Browse"} · saved repertoire</span>
          <h2>{detail.repertoire.name}</h2>
        </div>
        <div className="opening-workspace-actions">
          {detail.repertoire.editable && (
            <button disabled={navigationBlocked} className={editing ? "active" : "secondary"} onClick={() => { setEditing((value) => !value); setPendingMove(null); }}>
              {editing ? "Finish editing" : "Edit lines"}
            </button>
          )}
          <button className="secondary" disabled={navigationBlocked} onClick={onBack}>Back to repertoires</button>
          <button disabled={navigationBlocked || line.archived || line.learnerDecisionCount === 0} onClick={() => onPractice(line.id)}>
            {busy ? "Starting…" : line.practiceEnabled === false ? "Practise this line once" : "Practise this line"}
          </button>
        </div>
      </div>
      {branchDraft.storageError && <p role="alert" className="error">{branchDraft.storageError}</p>}
      {branchDraft.recovery && !pendingMove && <div className="panel opening-draft-recovery">
        <strong>Unsaved branch draft found</strong>
        <p>{branchDraft.recovery.move.san}: {branchDraft.recovery.explanation || "No note added."}</p>
        {branchDraft.recovery.graphKey !== graphKey && <p>The repertoire changed. Keep a copy of this note; the draft cannot be restored onto a different line.</p>}
        <button disabled={navigationBlocked || branchDraft.recovery.graphKey !== graphKey} onClick={restoreDraft}>Restore draft</button>
        <button className="secondary" disabled={navigationBlocked} onClick={() => {
          if (window.confirm("Discard this unsaved branch and its note?")) branchDraft.clear();
        }}>Discard branch draft</button>
      </div>}
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
            <p>{deleteTarget === "line" && allLines.length > 1
              ? "This line, its review results and moves used only by it will be removed for every player profile. Shared moves stay in your other lines. Your imported games stay. This cannot be undone."
              : "All remaining lines, personal notes and opening-review results in this repertoire will be removed for every player profile on this installation. Your imported games stay. This cannot be undone."}</p>
            {deleteTarget === "line" && allLines.length === 1 && <p>This is the final line, so the repertoire will also be deleted.</p>}
            <a href={`/api/v1/openings/repertoires/${detail.repertoire.id}/export.pgn`} download>Export PGN before deleting</a>
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
        {lineLibraryOpen ? "Hide line list" : `Choose another line · ${lineDisplayTitle}`}
      </button>

      <div className="opening-workspace-grid">
        <OpeningLineLibrary chapters={detail.chapters} index={navigation} selectedLineId={line.id}
          open={lineLibraryOpen} disabled={navigationBlocked} progress={progressByLine} transpositions={transpositionsByLine} onChoose={chooseLine} />

        <div className="opening-line-board">
          <div className="candidate-banner">
            <div>
              <span>{selected.chapter.title} · {lineDisplayTitle}</span>
              <small>{editing ? "Play a move to extend this line or create a branch." : "Follow saved moves, or choose Practise this line."} You are {detail.repertoire.learnerColor}.{selectedProgress
                ? ` ${selectedProgress.mastered}/${selectedProgress.decisions} moves secure for now.`
                : ""}{selectedTranspositions > 0
                ? ` ${selectedTranspositions} position${selectedTranspositions === 1 ? "" : "s"} can be reached by another move order.`
                : ""}</small>
            </div>
            <strong>{ply === 0 ? "Starting position" : `${ply} / ${line.moveCount}`}</strong>
          </div>
          <p className="opening-board-prompt">{pendingMove ? `Unsaved move: ${pendingMove.san} — save it or choose another.`
            : editing ? `${displayFen.split(" ")[1] === "w" ? "White" : "Black"} to move — what will you prepare here?`
            : "Browse this line. Use the board, move list or Next."}</p>
          <div className="board-toolbar opening-line-controls">
            <button className="text-button" disabled={navigationBlocked || ply === 0} onClick={() => choosePly(0)}>Start</button>
            <button className="text-button" title="Alt + Left arrow" disabled={navigationBlocked || ply === 0} onClick={() => choosePly(Math.max(0, ply - 1))}>Previous</button>
            <span>{currentMove ? `${currentMove.role === "learner" ? "Your move" : "Opponent"}: ${currentMove.moveSan}` : "Choose a move below or step forward"}</span>
            <button className="text-button" title="Alt + Right arrow" disabled={navigationBlocked || ply >= line.moveCount} onClick={() => choosePly(Math.min(line.moveCount, ply + 1))}>Next</button>
            <button className="text-button" disabled={navigationBlocked || ply >= line.moveCount} onClick={() => choosePly(line.moveCount)}>End</button>
          </div>
          <ChessBoard
            fen={pendingFen}
            animateMoves={false}
            orientation={detail.repertoire.learnerColor}
            interactive={!navigationBlocked && !line.archived}
            allowAnnotations
            sourceAnnotations={showSourceMarks && !pendingMove ? sourceMarks : []}
            lastMove={pendingMove?.uci ?? currentMove?.moveUci ?? null}
            onMove={previewNewMove}
          />
          {!pendingMove && sourceMarks.length > 0 && <button className="text-button" aria-pressed={showSourceMarks}
            onClick={() => setShowSourceMarks(value => !value)}>
            {showSourceMarks ? "Hide source arrows and highlights" : "Show source arrows and highlights"}
          </button>}
          {showSourceMarks && !pendingMove && <p className="opening-inspector-help">
            Source marks: {sourceMarks.map(mark => `${mark.color} ${mark.from === mark.to ? `highlight on ${mark.from}` : `arrow ${mark.from} to ${mark.to}`}`).join("; ")}.
          </p>}
          <div className="opening-move-strip" aria-label="Moves in selected line">
            {line.moves.map((move) => (
              <button
                className={move.ply === ply ? "active" : move.role === "learner" ? "learner" : ""}
                key={`${line.id}-${move.ply}`}
                disabled={navigationBlocked}
                aria-current={move.ply === ply ? "step" : undefined}
                onClick={() => choosePly(move.ply)}
                aria-label={`Go to move ${move.ply}: ${move.moveSan}`}
              >
                {openingMoveLabel(move)}
              </button>
            ))}
          </div>
          <OpeningBranchNavigation index={navigation} lineId={line.id} ply={ply} disabled={navigationBlocked}
            onNavigate={navigateTo} previous={previousPosition} onReturn={returnToPreviousLine} />
          {!editing && !line.archived && <p className="opening-inspector-help">Play a saved move on the board to follow its line. To add a new move, choose Edit lines.</p>}
        </div>

        <button className="secondary opening-notes-toggle" aria-expanded={notesOpen || editing || Boolean(pendingMove)} aria-controls="opening-move-inspector"
          onClick={() => setNotesOpen(value => !value)}>{notesOpen ? "Hide notes" : "Notes and move ideas"}</button>
        <aside id="opening-move-inspector" className={`panel opening-move-inspector ${notesOpen || editing || pendingMove ? "notes-open" : "notes-closed"}`}>
          {editing && !pendingMove && (
            <OpeningMoveSuggestions
              fen={displayFen}
              learnerColor={detail.repertoire.learnerColor}
              ratingGroup={coverageRating}
              useExplorer={useExplorer}
              savedMoveUcis={savedMoveUcis}
              onChooseMove={previewNewMove}
            />
          )}
          {pendingMove && (
            <div className="opening-new-move">
              <span className="eyebrow">{preparingGap ? "Explore this reply" : ply < line.moveCount ? "New branch" : "Extend line"}</span>
              <h3>{pendingMove.san}</h3>
              {displayFen.split(" ")[1] !== (detail.repertoire.learnerColor === "white" ? "w" : "b") && <OpeningPreparationAdvice
                target={{ fen: displayFen, opponentMoveUci: pendingMove.uci, learnerColor: detail.repertoire.learnerColor,
                  repertoireId: detail.repertoire.id }} />}
              <p>{preparingGap
                ? `This reply appears in ${preparingGap.frequencyPercent}% of the sampled games at this position. Check whether it deserves preparation. Save only if you want to add a response.`
                : ply < line.moveCount
                ? "This move differs from the saved continuation. Saving creates another line and keeps the original."
                : "This move will be added after the current end of the line."}</p>
              {ply < line.moveCount && <label>Branch name<input value={branchTitle} onChange={(event) => setBranchTitle(event.target.value)} placeholder={`${line.title} — ${pendingMove.san} branch`} /></label>}
              <label>
                {displayFen.split(" ")[1] === (detail.repertoire.learnerColor === "white" ? "w" : "b") ? `Why ${pendingMove.san}?` : `What is the idea behind ${pendingMove.san}?`}
                <textarea rows={4} value={newExplanation} onChange={(event) => setNewExplanation(event.target.value)} placeholder="Optional now — you can add this later." />
              </label>
              <div className="answer-actions">
                <button disabled={localBusy} onClick={() => void saveNewMove()}>{localBusy ? "Saving…" : "Save move"}</button>
                <button className="secondary" disabled={localBusy} onClick={() => { branchDraft.clear(); setPendingMove(null); setPreparingGap(null); }}>Choose another</button>
              </div>
            </div>
          )}
          {!pendingMove && <>
          <span className="eyebrow">{currentMove ? currentMove.role === "learner" ? "Your decision" : "Opponent reply" : "Line overview"}</span>
          <h3>{currentMove?.moveSan ?? lineDisplayTitle}</h3>
          {!currentMove && (
            <>
              <p>{line.sanSequence}</p>
              <details><summary>Chapter notes</summary><p>{selected.chapter.introduction}</p></details>
              <dl>
                <div><dt>Moves</dt><dd>{line.moveCount}</dd></div>
                <div><dt>Your decisions</dt><dd>{line.learnerDecisionCount}</dd></div>
              </dl>
              <p className="opening-inspector-help">Use Next or select a move below the board to see why it belongs in the repertoire.</p>
            </>
          )}
          {currentMove && (
            <div className="opening-inspector-copy">
              {sharedMoveCount > 1 && <p className="opening-shared-annotation">This move is used in {sharedMoveCount} lines. Memory progress and your learning comment are shared; source notes belong to this line. Editing an explanation applies to all these lines.</p>}
              <OpeningExplanation explanation={currentMove.explanation} showPersonalComment={false} />
              <OpeningLearningComment
                repertoireId={detail.repertoire.id}
                moveId={currentMove.id}
                comment={currentMove.explanation.personalComment}
                onEditingChange={setEditingComment}
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
      <details className="panel opening-workspace-tools" open={toolsOpen} onToggle={event => setToolsOpen(event.currentTarget.open)}>
      <summary>Coverage and repertoire settings</summary>
      {useExplorer && <div className="answer-actions"><label>Explorer rating
        <select value={coverageRating} onChange={event => { coverageRequestRef.current?.abort(); setCoverageRating(Number(event.target.value)); setCoverage(null); }}>
          {[1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500].map(rating => <option key={rating} value={rating}>{rating} band</option>)}
        </select></label><button className="secondary" disabled={coverageBusy} onClick={() => void loadCoverage()}>
          {coverageBusy ? "Checking…" : coverage ? "Refresh coverage" : "Check coverage"}</button></div>}
      {coverage && (
        <div className="panel opening-coverage" role="status">
          <div>
            <span className="eyebrow">Practical coverage · {coverageRating} band · Lichess</span>
            <h3>{coverage.coveragePercent === null ? "No sample yet" : `${coverage.coveragePercent}% of replies covered`}</h3>
            <p>{coverage.message} This measures replies at positions reached after your saved moves, not the chance of reaching the whole line.</p>
          </div>
          <div className="opening-coverage-gaps">
            <strong>{coverage.gaps.length > 0 ? "Missing replies to consider" : "No common missing replies found"}</strong>
            {coverage.gaps.slice(0, 5).map((gap) => (
              <button key={`${gap.positionId}-${gap.moveUci}`} disabled={navigationBlocked} onClick={() => focusCoverageGap(gap)}>
                <span><b>{gap.moveSan}</b> after {gap.lineTitle}</span>
                <small>{gap.frequencyPercent}% at this position{gap.preparation?.decision?.choice === "unprepared" ? " · left unprepared" : gap.preparation?.priority === "low" ? " · optional" : gap.preparation?.priority === "high" ? " · worth preparing" : ""}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <div className="opening-edit-guide">
          <div>
            <strong>Edit mode:</strong> stop at any position and make a move on the board. At the end it extends this line; in the middle a different move creates a new branch, leaving the original intact.
            {allLines.length === 1 && <small>Deleting this final line also removes the repertoire. You can export it first.</small>}
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
        </div>
      )}
      <OpeningPracticeSelection detail={detail} disabled={localBusy || busy || Boolean(pendingMove) || editingExplanation || editingComment}
        onOpenLine={chooseLine} onBusyChange={setSelectionBusy} onChanged={async () => {
          onDetailChanged(await get<OpeningRepertoireDetailResponse>(`/api/v1/openings/repertoires/${detail.repertoire.id}`));
          await onPracticeSelectionChanged();
        }} />
      <details className="panel opening-management" open={manageOpen} onToggle={event => setManageOpen(event.currentTarget.open)}>
        <summary>Manage lines</summary>
        <p>Archive a line to keep its notes and progress for later. Delete it to remove it permanently. Built-in lines can be deleted too.</p>
        <div className="opening-delete-actions">
            <button className="secondary" disabled={navigationBlocked} onClick={() => void setLineArchived(!line.archived)}>
              {localBusy ? "Saving…" : line.archived ? "Restore this line" : "Archive this line"}
            </button>
            <a className="button secondary" href={`/api/v1/openings/repertoires/${detail.repertoire.id}/export.pgn`} download>Export PGN</a>
            <button
              className="secondary danger-button"
              disabled={navigationBlocked}
              onClick={() => setDeleteTarget("line")}
            >Delete selected line</button>
            <button
              className="secondary danger-button"
              disabled={navigationBlocked}
              onClick={() => setDeleteTarget("repertoire")}
            >Delete repertoire</button>
          </div>
      </details>
      </details>
    </div>
  );
}
