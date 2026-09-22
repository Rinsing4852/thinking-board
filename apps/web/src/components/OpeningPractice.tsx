import { useEffect, useRef, useState } from "react";

import type {
  OpeningCatalogResponse,
  OpeningCoverageResponse,
  OpeningLessonActiveState,
  OpeningLessonComplete,
  OpeningImportColor,
  OpeningImportPreviewResponse,
  OpeningImportResponse,
  OpeningImportSourceType,
  OpeningLessonState,
  OpeningLessonStep,
  OpeningMoveAnswerResponse,
  OpeningRepertoireDetailResponse,
  OpeningRepertoireSummary,
  OpeningReviewActiveState,
  OpeningReviewRecommendation,
  OpeningWhyAnswerResponse,
  OpeningArchiveResponse,
  OpeningProgressResponse,
} from "../../../../packages/contracts/src/api";
import { get, patch, post } from "../api";
import { applyUciMove, getMoveHint } from "../opening-board";
import { formatMoveLabel, formatOpeningLineContext } from "../training-language";
import { ChessBoard } from "./ChessBoard";
import { OpeningBoardBuilder } from "./OpeningBoardBuilder";
import { OpeningExplanation } from "./OpeningExplanation";
import { OpeningLineExplorer } from "./OpeningLineExplorer";
import { OpeningReview } from "./OpeningReview";
import { OpeningLearningComment } from "./OpeningLearningComment";

type LessonPhase = "catalog" | "observe" | "move" | "why" | "feedback" | "complete";
type ActiveLessonPhase = Exclude<LessonPhase, "catalog" | "complete">;
type ReviewMode = "due" | "new" | "early";

interface OpeningPracticeProps {
  refreshToken: number;
  onOpenGames?: () => void;
}

export function OpeningPractice({ refreshToken, onOpenGames }: OpeningPracticeProps) {
  const [catalog, setCatalog] = useState<OpeningRepertoireSummary[]>([]);
  const [step, setStep] = useState<OpeningLessonStep | null>(null);
  const [complete, setComplete] = useState<OpeningLessonComplete | null>(null);
  const [activeReview, setActiveReview] = useState<OpeningReviewActiveState | null>(null);
  const [recommendation, setRecommendation] = useState<OpeningReviewRecommendation | null>(null);
  const [reviewPaused, setReviewPaused] = useState(false);
  const [phase, setPhase] = useState<LessonPhase>("catalog");
  const [pausedLessonPhase, setPausedLessonPhase] = useState<ActiveLessonPhase | null>(null);
  const [displayFen, setDisplayFen] = useState("");
  const [lastMove, setLastMove] = useState<string | null>(null);
  const [moveNotice, setMoveNotice] = useState("");
  const [hintSquare, setHintSquare] = useState<string | null>(null);
  const [moveFeedback, setMoveFeedback] = useState<OpeningMoveAnswerResponse | null>(null);
  const [whyFeedback, setWhyFeedback] = useState<OpeningWhyAnswerResponse | null>(null);
  const [pendingNext, setPendingNext] = useState<OpeningLessonState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const [showImporter, setShowImporter] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [workspaceDetail, setWorkspaceDetail] = useState<OpeningRepertoireDetailResponse | null>(null);
  const [workspaceLineId, setWorkspaceLineId] = useState<string | null>(null);
  const [importPgn, setImportPgn] = useState("");
  const [importName, setImportName] = useState("");
  const [importColor, setImportColor] = useState<OpeningImportColor>("white");
  const [importSourceType, setImportSourceType] = useState<OpeningImportSourceType>("book_notes");
  const [importSourceTitle, setImportSourceTitle] = useState("");
  const [importSourceAuthor, setImportSourceAuthor] = useState("");
  const [lichessStudyUrl, setLichessStudyUrl] = useState("");
  const [selectedChapterIndexes, setSelectedChapterIndexes] = useState<number[]>([]);
  const [importPermission, setImportPermission] = useState(false);
  const [importPreview, setImportPreview] = useState<OpeningImportPreviewResponse | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState("");
  const [coverageSpotlight, setCoverageSpotlight] = useState<OpeningCoverageResponse | null>(null);
  const [coverageSpotlightLoading, setCoverageSpotlightLoading] = useState(false);
  const [openingProgress, setOpeningProgress] = useState<OpeningProgressResponse | null>(null);
  const activeCatalog = catalog.filter((repertoire) => !repertoire.archived);
  const archivedCatalog = catalog.filter((repertoire) => repertoire.archived);

  const showStep = (nextStep: OpeningLessonStep): void => {
    setStep(nextStep);
    setComplete(null);
    setMoveNotice("");
    setHintSquare(null);
    setMoveFeedback(nextStep.moveAnswer);
    setWhyFeedback(null);
    setPendingNext(null);
    setPausedLessonPhase(null);
    setLastMove(nextStep.moveAnswer?.repertoireMove.moveUci ?? null);
    setDisplayFen(nextStep.moveAnswer?.fenAfterMove
      ?? (nextStep.opponentMove ? nextStep.fenBeforeOpponent : nextStep.fenToMove));
    setPhase(nextStep.moveAnswer ? "why" : nextStep.opponentMove ? "observe" : "move");
  };

  const showFeedback = (feedback: OpeningWhyAnswerResponse): void => {
    showStep(feedback.step);
    setWhyFeedback(feedback);
    setPendingNext(feedback.next);
    setPhase("feedback");
  };

  const beginSubmission = (): boolean => {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setSubmitting(true);
    return true;
  };

  const endSubmission = (): void => {
    submittingRef.current = false;
    setSubmitting(false);
  };

  useEffect(() => {
    setLoading(true);
    setError("");
    void Promise.all([
      get<OpeningCatalogResponse>("/api/v1/openings/catalog"),
      get<OpeningLessonActiveState | null>("/api/v1/openings/lessons/active"),
      get<OpeningReviewActiveState | null>("/api/v1/openings/reviews/active"),
      get<OpeningReviewRecommendation>("/api/v1/openings/reviews/recommended"),
      get<OpeningProgressResponse>("/api/v1/openings/progress"),
    ]).then(([catalogResponse, active, review, recommended, progress]) => {
      setCatalog(catalogResponse.repertoires);
      setRecommendation(recommended);
      setOpeningProgress(progress);
      setActiveReview(review);
      setReviewPaused(false);
      setPausedLessonPhase(null);
      if (review) {
        setPhase("catalog");
        setStep(null);
      } else if (active?.kind === "feedback") showFeedback(active);
      else if (active) showStep(active);
      else {
        setStep(null);
        setComplete(null);
        setMoveNotice("");
        setHintSquare(null);
        setMoveFeedback(null);
        setWhyFeedback(null);
        setPendingNext(null);
        setDisplayFen("");
        setLastMove(null);
        setPhase("catalog");
      }
      const coverageRepertoireId = recommended.repertoire?.id
        ?? catalogResponse.repertoires.find((repertoire) => !repertoire.archived)?.id;
      if (coverageRepertoireId) {
        setCoverageSpotlightLoading(true);
        void get<OpeningCoverageResponse>(`/api/v1/openings/repertoires/${coverageRepertoireId}/coverage?rating=1600`)
          .then(setCoverageSpotlight)
          .catch(() => setCoverageSpotlight(null))
          .finally(() => setCoverageSpotlightLoading(false));
      } else {
        setCoverageSpotlight(null);
      }
    }).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load opening practice");
    }).finally(() => setLoading(false));
  }, [refreshToken]);

  const startLesson = async (repertoireId: string): Promise<void> => {
    if (activeReview && reviewPaused && !window.confirm("Starting a guided line will end the paused memory session. Continue?")) return;
    if (step && pausedLessonPhase && !window.confirm("Starting a different guided line will end the paused guided line. Continue?")) return;
    if (!beginSubmission()) return;
    setError("");
    setArchiveMessage("");
    try {
      const lesson = await post<OpeningLessonStep>(
        `/api/v1/openings/repertoires/${repertoireId}/lessons/start`,
      );
      setActiveReview(null);
      setReviewPaused(false);
      showStep(lesson);
      requestAnimationFrame(() => document.getElementById("opening-practice")?.scrollIntoView({ behavior: "smooth" }));
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start lesson");
    } finally {
      endSubmission();
    }
  };

  const startLineLesson = async (repertoireId: string, lineId: string): Promise<void> => {
    if (activeReview && reviewPaused && !window.confirm("Starting this guided line will end the paused memory session. Continue?")) return;
    if (step && pausedLessonPhase && !window.confirm("Starting this guided line will end the paused guided line. Continue?")) return;
    if (!beginSubmission()) return;
    setError("");
    try {
      const lesson = await post<OpeningLessonStep>(
        `/api/v1/openings/repertoires/${repertoireId}/lines/${lineId}/lessons/start`,
      );
      setActiveReview(null);
      setReviewPaused(false);
      setWorkspaceDetail(null);
      showStep(lesson);
      requestAnimationFrame(() => document.getElementById("opening-practice")?.scrollIntoView({ behavior: "smooth" }));
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start this opening line");
    } finally {
      endSubmission();
    }
  };

  const openWorkspace = async (repertoireId: string, lineId: string | null = null): Promise<void> => {
    if (!beginSubmission()) return;
    setError("");
    try {
      const detail = await get<OpeningRepertoireDetailResponse>(`/api/v1/openings/repertoires/${repertoireId}`);
      setWorkspaceDetail(detail);
      setWorkspaceLineId(lineId);
      setShowBuilder(false);
      setShowImporter(false);
      requestAnimationFrame(() => document.getElementById("opening-practice")?.scrollIntoView({ behavior: "smooth" }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load repertoire lines");
    } finally {
      endSubmission();
    }
  };

  const finishBoardBuild = async (repertoireId: string): Promise<void> => {
    const [updatedCatalog, detail, progress] = await Promise.all([
      get<OpeningCatalogResponse>("/api/v1/openings/catalog"),
      get<OpeningRepertoireDetailResponse>(`/api/v1/openings/repertoires/${repertoireId}`),
      get<OpeningProgressResponse>("/api/v1/openings/progress"),
    ]);
    setCatalog(updatedCatalog.repertoires);
    setOpeningProgress(progress);
    setShowBuilder(false);
    setWorkspaceDetail(detail);
  };

  const finishRepertoireDeletion = (repertoireId: string): void => {
    setWorkspaceDetail(null);
    setCatalog((current) => current.filter((repertoire) => repertoire.id !== repertoireId));
    setRecommendation(null);
    void Promise.all([
      get<OpeningCatalogResponse>("/api/v1/openings/catalog"),
      get<OpeningReviewRecommendation>("/api/v1/openings/reviews/recommended"),
      get<OpeningProgressResponse>("/api/v1/openings/progress"),
    ]).then(([catalogResponse, recommended, progress]) => {
      setCatalog(catalogResponse.repertoires);
      setRecommendation(recommended);
      setOpeningProgress(progress);
    }).catch(() => undefined);
  };

  const setRepertoireArchived = async (repertoire: OpeningRepertoireSummary, archived: boolean): Promise<void> => {
    if (!beginSubmission()) return;
    setError("");
    setArchiveMessage("");
    try {
      const result = await patch<OpeningArchiveResponse>(
        `/api/v1/openings/repertoires/${repertoire.id}/archive`,
        { archived },
      );
      const [catalogResponse, recommended, progress] = await Promise.all([
        get<OpeningCatalogResponse>("/api/v1/openings/catalog"),
        get<OpeningReviewRecommendation>("/api/v1/openings/reviews/recommended"),
        get<OpeningProgressResponse>("/api/v1/openings/progress"),
      ]);
      setCatalog(catalogResponse.repertoires);
      setRecommendation(recommended);
      setOpeningProgress(progress);
      setArchiveMessage(result.message);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Could not update this repertoire");
    } finally {
      endSubmission();
    }
  };

  const startReview = async (repertoireId: string, mode: ReviewMode): Promise<void> => {
    if (step && pausedLessonPhase && !window.confirm("Starting memory practice will end the paused guided line. Continue?")) return;
    if (activeReview && reviewPaused && !window.confirm("Starting a new memory session will end the paused session. Continue?")) return;
    if (!beginSubmission()) return;
    setError("");
    try {
      const review = await post<OpeningReviewActiveState>(
        `/api/v1/openings/repertoires/${repertoireId}/reviews/start`,
        { mode },
      );
      setStep(null);
      setPausedLessonPhase(null);
      setActiveReview(review);
      setReviewPaused(false);
      requestAnimationFrame(() => document.getElementById("opening-practice")?.scrollIntoView({ behavior: "smooth" }));
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start review");
    } finally {
      endSubmission();
    }
  };

  const startRecommendedReview = async (): Promise<void> => {
    if (step && pausedLessonPhase && !window.confirm("Starting memory practice will end the paused guided line. Continue?")) return;
    if (activeReview && reviewPaused && !window.confirm("Starting a new memory session will end the paused session. Continue?")) return;
    if (!beginSubmission()) return;
    setError("");
    try {
      const review = await post<OpeningReviewActiveState>("/api/v1/openings/reviews/recommended/start");
      setStep(null);
      setPausedLessonPhase(null);
      setActiveReview(review);
      setReviewPaused(false);
      requestAnimationFrame(() => document.getElementById("opening-practice")?.scrollIntoView({ behavior: "smooth" }));
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start recommended opening practice");
    } finally {
      endSubmission();
    }
  };

  const finishReview = (): void => {
    setActiveReview(null);
    setReviewPaused(false);
    void Promise.all([
      get<OpeningCatalogResponse>("/api/v1/openings/catalog"),
      get<OpeningReviewRecommendation>("/api/v1/openings/reviews/recommended"),
      get<OpeningProgressResponse>("/api/v1/openings/progress"),
    ])
      .then(([response, recommended, progress]) => {
        setCatalog(response.repertoires);
        setRecommendation(recommended);
        setOpeningProgress(progress);
      })
      .catch(() => undefined);
  };

  const resumeReview = async (): Promise<void> => {
    if (!activeReview || !beginSubmission()) return;
    const sessionId = activeReview.sessionId;
    setError("");
    try {
      const resumed = await post<OpeningReviewActiveState>(`/api/v1/openings/reviews/${sessionId}/resume`);
      setActiveReview(resumed);
      setReviewPaused(false);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Could not resume opening practice");
    } finally {
      endSubmission();
    }
  };

  const playOpponentMove = (): void => {
    if (!step?.opponentMove) return;
    setDisplayFen(step.fenToMove);
    setLastMove(step.opponentMove.moveUci);
    setPhase("move");
  };

  useEffect(() => {
    if (phase !== "observe" || !step?.opponentMove) return;
    const timer = window.setTimeout(playOpponentMove, 650);
    return () => window.clearTimeout(timer);
  }, [phase, step?.attemptId, step?.decisionNumber, step?.opponentMove]);

  const checkMove = async (moveUci: string): Promise<void> => {
    if (!step || !beginSubmission()) return;
    setError("");
    try {
      const result = await post<OpeningMoveAnswerResponse>(
        `/api/v1/openings/lessons/${step.attemptId}/move`,
        { moveUci },
      );
      setMoveNotice("");
      setHintSquare(null);
      setMoveFeedback(result);
      setDisplayFen(result.fenAfterMove);
      setLastMove(result.repertoireMove.moveUci);
      setPhase("why");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not check move");
    } finally {
      endSubmission();
    }
  };

  const playLessonMove = (uci: string, san: string): void => {
    if (!step || submittingRef.current) return;
    const accepted = step.acceptedMoves.some((move) => move.moveUci === uci);
    if (!accepted) {
      const hint = getMoveHint(step.fenToMove, step.acceptedMoves[0]?.moveUci ?? "");
      setMoveNotice(`${san} is not part of this repertoire here. Try again — move the ${hint.piece}.`);
      setHintSquare(hint.square);
      setDisplayFen(step.fenToMove);
      setLastMove(step.opponentMove?.moveUci ?? null);
      return;
    }
    setDisplayFen(applyUciMove(step.fenToMove, uci));
    setLastMove(uci);
    void checkMove(uci);
  };

  const showLessonHint = (): void => {
    if (!step) return;
    const hint = getMoveHint(step.fenToMove, step.acceptedMoves[0]?.moveUci ?? "");
    setHintSquare(hint.square);
    setMoveNotice(`Hint: move the ${hint.piece} on ${hint.square}.`);
  };

  const showLessonMove = (): void => {
    if (!step) return;
    const answer = step.acceptedMoves[0];
    if (!answer) return;
    setMoveNotice(`The repertoire move is ${answer.moveSan}.`);
    setDisplayFen(applyUciMove(step.fenToMove, answer.moveUci));
    setLastMove(answer.moveUci);
    void checkMove(answer.moveUci);
  };

  const checkWhy = async (concept: string | null): Promise<void> => {
    if (!step || !beginSubmission()) return;
    setError("");
    try {
      const result = await post<OpeningWhyAnswerResponse>(
        `/api/v1/openings/lessons/${step.attemptId}/why`,
        concept === null ? { reveal: true } : { concept },
      );
      showFeedback(result);
      window.dispatchEvent(new Event("training-completed"));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not check explanation");
    } finally {
      endSubmission();
    }
  };

  const updateLessonComment = (comment: string | null): void => {
    setWhyFeedback((current) => current ? {
      ...current,
      explanation: { ...current.explanation, personalComment: comment },
    } : current);
  };

  const continueLesson = async (): Promise<void> => {
    if (!step || !pendingNext || !beginSubmission()) return;
    setError("");
    try {
      const next = await post<OpeningLessonState>(
        `/api/v1/openings/lessons/${step.attemptId}/continue`,
      );
      if (next.kind === "complete") {
        setComplete(next);
        setStep(null);
        setPhase("complete");
        return;
      }
      showStep(next);
    } catch (continueError) {
      setError(continueError instanceof Error ? continueError.message : "Could not continue lesson");
    } finally {
      endSubmission();
    }
  };

  const returnToCatalog = (): void => {
    setStep(null);
    setComplete(null);
    setPausedLessonPhase(null);
    setPhase("catalog");
  };

  const pauseLesson = (): void => {
    if (phase === "catalog" || phase === "complete") return;
    setPausedLessonPhase(phase);
    setPhase("catalog");
  };

  const importPayload = () => ({
    pgn: importPgn,
    learnerColor: importColor,
    name: importName,
    sourceType: importSourceType,
    sourceTitle: importSourceTitle,
    sourceAuthor: importSourceAuthor,
  });

  const previewOpeningImport = async (): Promise<void> => {
    if (importSubmitting) return;
    setImportSubmitting(true);
    setImportError("");
    setImportMessage("");
    try {
      const preview = importSourceType === "lichess_study"
        ? await post<OpeningImportPreviewResponse>("/api/v1/openings/imports/lichess/preview", {
          studyUrl: lichessStudyUrl,
          learnerColor: importColor,
          name: importName,
        })
        : await post<OpeningImportPreviewResponse>(
          "/api/v1/openings/imports/pgn/preview",
          importPayload(),
        );
      setImportPreview(preview);
      setSelectedChapterIndexes(preview.chapters.filter((chapter) => chapter.importable).map((chapter) => chapter.sourceIndex));
    } catch (previewError) {
      setImportPreview(null);
      setImportError(previewError instanceof Error ? previewError.message : "Could not preview opening PGN");
    } finally {
      setImportSubmitting(false);
    }
  };

  const importOpening = async (): Promise<void> => {
    if (importSubmitting || !importPreview) return;
    setImportSubmitting(true);
    setImportError("");
    setImportMessage("");
    try {
      const result = importSourceType === "lichess_study"
        ? await post<OpeningImportResponse>("/api/v1/openings/imports/lichess", {
          studyUrl: lichessStudyUrl,
          learnerColor: importColor,
          name: importName,
          selectedChapterIndexes,
          ownershipConfirmed: importPermission,
        })
        : await post<OpeningImportResponse>(
          "/api/v1/openings/imports/pgn",
          { ...importPayload(), ownershipConfirmed: importPermission },
        );
      const [updatedCatalog, progress] = await Promise.all([
        get<OpeningCatalogResponse>("/api/v1/openings/catalog"),
        get<OpeningProgressResponse>("/api/v1/openings/progress"),
      ]);
      setCatalog(updatedCatalog.repertoires);
      setOpeningProgress(progress);
      setImportMessage(result.message);
      setImportPreview(null);
      setImportPgn("");
      setLichessStudyUrl("");
      setSelectedChapterIndexes([]);
      setImportPermission(false);
    } catch (importFailure) {
      setImportError(importFailure instanceof Error ? importFailure.message : "Could not import opening PGN");
    } finally {
      setImportSubmitting(false);
    }
  };

  return (
    <section className={`opening-practice-section ${showBuilder ? "studio-active" : ""}`} id="opening-practice">
      {!showBuilder && !activeReview && !step && <div className="training-copy opening-heading">
        <div>
          <span className="eyebrow">Understand your opening</span>
          <h2>Opening Practice</h2>
        </div>
        <p>Build one dependable repertoire as White with 1.e4 and one as Black with the Modern Defence. New moves are explained before they enter memory review.</p>
      </div>}

      {loading && <div className="panel opening-loading">Loading opening practice…</div>}

      {!loading && activeReview && !reviewPaused && (
        <OpeningReview initial={activeReview} onComplete={finishReview} onPause={() => setReviewPaused(true)} />
      )}

      {!loading && (!activeReview || reviewPaused) && phase === "catalog" && showBuilder && (
        <OpeningBoardBuilder
          onCancel={() => setShowBuilder(false)}
          onSaved={(repertoireId) => void finishBoardBuild(repertoireId).catch((failure) => {
            setError(failure instanceof Error ? failure.message : "Could not open the saved repertoire");
          })}
        />
      )}

      {!loading && (!activeReview || reviewPaused) && phase === "catalog" && workspaceDetail && !showBuilder && (
        <OpeningLineExplorer
          detail={workspaceDetail}
          startingLineId={workspaceLineId}
          initialCoverage={coverageSpotlight?.repertoireId === workspaceDetail.repertoire.id ? coverageSpotlight : null}
          busy={submitting}
          onBack={() => { setWorkspaceDetail(null); setWorkspaceLineId(null); }}
          onPractice={(lineId) => void startLineLesson(workspaceDetail.repertoire.id, lineId)}
          onDetailChanged={setWorkspaceDetail}
          onRepertoireDeleted={finishRepertoireDeletion}
        />
      )}

      {!loading && (!activeReview || reviewPaused) && phase === "catalog" && !showBuilder && !workspaceDetail && (
        <>
          {activeReview && reviewPaused && (
            <div className="panel opening-resume-card">
              <div>
                <span className="eyebrow">Practice paused</span>
                <h3>{activeReview.kind === "feedback" ? activeReview.exercise.repertoire.name : activeReview.repertoire.name}</h3>
                <p>Your place is saved. Resume when you are ready; pausing does not affect the review schedule.</p>
              </div>
              <button disabled={submitting} onClick={() => void resumeReview()}>
                {submitting ? "Resuming…" : "Resume opening practice"}
              </button>
            </div>
          )}
          {step && pausedLessonPhase && (
            <div className="panel opening-resume-card">
              <div>
                <span className="eyebrow">Guided line paused</span>
                <h3>{step.lineTitle}</h3>
                <p>Your place is saved. Guided line study explains a full sequence; it does not change the memory schedule.</p>
              </div>
              <button onClick={() => { setPhase(pausedLessonPhase); setPausedLessonPhase(null); }}>
                Resume guided line
              </button>
            </div>
          )}
          {!activeReview && !(step && pausedLessonPhase) && recommendation?.available && recommendation.repertoire && (
            <div className="opening-cockpit">
              <div className="panel opening-recommendation">
                <div className="opening-recommendation-copy">
                  <span className="eyebrow">Recommended next</span>
                  <h3>{recommendation.repertoire.name}</h3>
                  <p>{recommendation.message}</p>
                  <div className="opening-recommendation-mix" aria-label="Recommended session contents">
                    {recommendation.counts.gameMisses > 0 && <span><strong>{recommendation.counts.gameMisses}</strong> from your games</span>}
                    {recommendation.counts.due > 0 && <span><strong>{recommendation.counts.due}</strong> due</span>}
                    {recommendation.counts.new > 0 && <span><strong>{recommendation.counts.new}</strong> new</span>}
                    {recommendation.counts.early > 0 && <span><strong>{recommendation.counts.early}</strong> early review</span>}
                  </div>
                </div>
                <button disabled={submitting} onClick={() => void startRecommendedReview()}>
                  {submitting ? "Starting…" : `Start ${recommendation.counts.total}-position session`}
                </button>
              </div>
              {recommendation.counts.gameMisses > 0 && onOpenGames && (
                <button className="panel opening-cockpit-action" onClick={onOpenGames}>
                  <span className="eyebrow">From your games</span>
                  <strong>{recommendation.counts.gameMisses} repertoire miss{recommendation.counts.gameMisses === 1 ? "" : "es"}</strong>
                  <small>Inspect what happened and repair the line.</small>
                </button>
              )}
              <button
                className="panel opening-cockpit-action"
                disabled={coverageSpotlightLoading || !coverageSpotlight || !recommendation.repertoire}
                onClick={() => recommendation.repertoire && void openWorkspace(recommendation.repertoire.id)}
              >
                <span className="eyebrow">Practical coverage · 1600+</span>
                <strong>{coverageSpotlightLoading
                  ? "Checking common replies…"
                  : coverageSpotlight?.coveragePercent === null || coverageSpotlight?.coveragePercent === undefined
                    ? "Coverage unavailable"
                    : `${coverageSpotlight.coveragePercent}% covered`}</strong>
                <small>{coverageSpotlight?.gaps[0]
                  ? `Biggest gap: ${coverageSpotlight.gaps[0].moveSan} · ${coverageSpotlight.gaps[0].frequencyPercent}% at that position`
                  : coverageSpotlight?.message ?? "Open the repertoire to check common replies."}</small>
              </button>
              {openingProgress?.weakestLines[0] && (
                <button
                  className="panel opening-cockpit-action"
                  onClick={() => void openWorkspace(
                    openingProgress.weakestLines[0]!.repertoireId,
                    openingProgress.weakestLines[0]!.lineId,
                  )}
                >
                  <span className="eyebrow">Weak line</span>
                  <strong>{openingProgress.weakestLines[0].lineTitle}</strong>
                  <small>{openingProgress.weakestLines[0].gameMisses > 0
                    ? `Missed in ${openingProgress.weakestLines[0].gameMisses} game${openingProgress.weakestLines[0].gameMisses === 1 ? "" : "s"}`
                    : openingProgress.weakestLines[0].accuracyPercent === null
                      ? "Not practised yet"
                      : `${openingProgress.weakestLines[0].accuracyPercent}% recall accuracy`}</small>
                </button>
              )}
            </div>
          )}
          {archiveMessage && <p className="success opening-catalog-status" role="status">{archiveMessage}</p>}
          <div className="panel opening-import-launch">
            <div>
              <span className="eyebrow">Your repertoire</span>
              <h3>Bring in lines from your own PGN</h3>
              <p>Build on the board, paste a PGN, or import a public Lichess Study link. Variations become browsable practice lines.</p>
            </div>
            <div className="opening-import-actions">
              <button onClick={() => { setShowBuilder(true); setShowImporter(false); }}>Build on the board</button>
              <button className="secondary" onClick={() => setShowImporter((shown) => !shown)}>
                {showImporter ? "Close importer" : "Import opening PGN"}
              </button>
            </div>
          </div>

          {showImporter && (
            <div className="panel opening-importer">
              <div className="opening-importer-heading">
                <div>
                  <span className="eyebrow">Private import</span>
                  <h3>Create a trainable repertoire</h3>
                </div>
                <p>This does not connect to or scrape Chessable. Enter lines you are permitted to use and write book explanations in your own words.</p>
              </div>

              <div className="opening-import-fields">
                <label>
                  Repertoire name <small>Optional—PGN headers can supply it</small>
                  <input value={importName} onChange={(event) => { setImportName(event.target.value); setImportPreview(null); }} placeholder="My simple 1.e4 repertoire" />
                </label>
                <label>
                  Practise as
                  <select value={importColor} onChange={(event) => { setImportColor(event.target.value as OpeningImportColor); setImportPreview(null); }}>
                    <option value="white">White</option>
                    <option value="black">Black</option>
                    <option value="both">Both sides</option>
                  </select>
                </label>
                <label>
                  Source type
                  <select value={importSourceType} onChange={(event) => {
                    setImportSourceType(event.target.value as OpeningImportSourceType);
                    setImportPreview(null);
                    setSelectedChapterIndexes([]);
                  }}>
                    <option value="book_notes">My notes from a book</option>
                    <option value="self_authored">My own analysis</option>
                    <option value="lichess_study">My Lichess Study</option>
                    <option value="licensed_pgn">Licensed/exportable PGN</option>
                  </select>
                </label>
                {importSourceType !== "lichess_study" && <label>
                  Source title <small>Stored privately for your reference</small>
                  <input value={importSourceTitle} onChange={(event) => { setImportSourceTitle(event.target.value); setImportPreview(null); }} placeholder="Book or study title" />
                </label>}
                {importSourceType !== "lichess_study" && <label>
                  Author <small>Optional</small>
                  <input value={importSourceAuthor} onChange={(event) => { setImportSourceAuthor(event.target.value); setImportPreview(null); }} placeholder="Author or course creator" />
                </label>}
                {importSourceType !== "lichess_study" && <label className="opening-file-label">
                  Choose a PGN file <small>Maximum 5 MB</small>
                  <input
                    accept=".pgn,text/plain,application/x-chess-pgn"
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void file.text().then((text) => {
                        setImportPgn(text);
                        setImportPreview(null);
                        setImportError("");
                      }).catch(() => setImportError("Could not read that PGN file"));
                    }}
                  />
                </label>}
              </div>

              {importSourceType === "lichess_study" ? (
                <label className="opening-pgn-label">
                  Lichess Study or chapter URL
                  <input
                    type="url"
                    value={lichessStudyUrl}
                    onChange={(event) => { setLichessStudyUrl(event.target.value); setImportPreview(null); setSelectedChapterIndexes([]); }}
                    placeholder="https://lichess.org/study/abcdefgh"
                  />
                  <small>Public studies work without a token. A chapter link imports only that chapter.</small>
                </label>
              ) : <label className="opening-pgn-label">
                Opening PGN
                <textarea
                  value={importPgn}
                  onChange={(event) => { setImportPgn(event.target.value); setImportPreview(null); }}
                  placeholder={'[Event "My repertoire"]\n\n1. e4 e5 2. Nf3 Nc6 (2... Nf6 3. Nxe5) 3. Bc4 *'}
                  rows={9}
                />
              </label>}

              <div className="answer-actions">
                <button disabled={!(importSourceType === "lichess_study" ? lichessStudyUrl.trim() : importPgn.trim()) || importSubmitting} onClick={() => void previewOpeningImport()}>
                  {importSubmitting ? "Checking source…" : importPreview ? "Check updated source" : "Preview import"}
                </button>
              </div>

              {importPreview && (
                <div className="opening-import-preview" role="status">
                  <div>
                    <span className="eyebrow">Ready to import</span>
                    <h4>{importPreview.suggestedName}</h4>
                    <p>Starts with <strong>{importPreview.firstMoveSan}</strong> · {importPreview.chapterCount} chapter{importPreview.chapterCount === 1 ? "" : "s"} · {importPreview.lineCount} practice line{importPreview.lineCount === 1 ? "" : "s"}</p>
                  </div>
                  <dl className="opening-import-facts">
                    <div><dt>Practise</dt><dd>{importPreview.learnerColors.map((color) => color === "white" ? "White" : "Black").join(" and ")}</dd></div>
                    <div><dt>Decisions</dt><dd>{importPreview.learnerDecisionCount}</dd></div>
                    <div><dt>With notes</dt><dd>{importPreview.explainedDecisionCount}</dd></div>
                    <div><dt>Need reasons</dt><dd>{importPreview.missingExplanationCount}</dd></div>
                  </dl>
                  {importSourceType === "lichess_study" ? (
                    <fieldset className="opening-chapter-picker">
                      <legend>Choose study chapters</legend>
                      {importPreview.chapters.map((chapter) => (
                        <label key={`${chapter.title}-${chapter.sourceIndex}`}>
                          <input
                            type="checkbox"
                            checked={selectedChapterIndexes.includes(chapter.sourceIndex)}
                            disabled={!chapter.importable}
                            onChange={(event) => setSelectedChapterIndexes((current) => event.target.checked
                              ? [...current, chapter.sourceIndex].sort((left, right) => left - right)
                              : current.filter((value) => value !== chapter.sourceIndex))}
                          />
                          <span><strong>{chapter.title}</strong><small>{chapter.lineCount} line{chapter.lineCount === 1 ? "" : "s"} · up to {chapter.maximumPly} plies</small></span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <details>
                      <summary>Detected chapters</summary>
                      <ul>{importPreview.chapters.map((chapter) => <li key={chapter.title}><strong>{chapter.title}</strong> — {chapter.lineCount} line{chapter.lineCount === 1 ? "" : "s"}, up to {chapter.maximumPly} plies</li>)}</ul>
                    </details>
                  )}
                  <ul className="opening-import-warnings">{importPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                  <label className="opening-permission">
                    <input type="checkbox" checked={importPermission} onChange={(event) => setImportPermission(event.target.checked)} />
                    <span>I own this material or have permission to use it. Any copied explanations are licensed, or rewritten in my own words.</span>
                  </label>
                  <button disabled={!importPermission || importSubmitting || (importSourceType === "lichess_study" && selectedChapterIndexes.length === 0)} onClick={() => void importOpening()}>
                    {importSubmitting ? "Importing…" : "Import private repertoire"}
                  </button>
                </div>
              )}

              {importMessage && <p className="success" role="status">{importMessage}</p>}
              {importError && <p className="error" role="alert">{importError}</p>}
            </div>
          )}

          <div className="panel opening-mode-guide opening-mode-guide-global" aria-label="Ways to practise a repertoire">
            <p><strong>Quick practice</strong><span>Play continuously; replies and the next position are automatic.</span></p>
            <p><strong>Study line</strong><span>Walk through one complete line and connect every move to its purpose.</span></p>
            <p><strong>Browse lines</strong><span>Inspect every saved branch without starting a lesson.</span></p>
          </div>

          <div className="opening-catalog">
            {activeCatalog.map((repertoire) => (
              <article className="panel opening-card" key={repertoire.id}>
                <div className="opening-card-topline">
                  <span>{repertoire.learnerColor === "white" ? "Play as White" : "Play as Black"}</span>
                  <small>{repertoire.origin === "imported" ? "Private import" : repertoire.status === "preview" ? "Starter preview" : "Published"}</small>
                </div>
                <h3>{repertoire.name}</h3>
                <p>{repertoire.summary}</p>
                {repertoire.sourceTitle && <p className="opening-source">Source: {repertoire.sourceTitle}</p>}
                <div className="opening-tags">
                  {repertoire.style.map((style) => <span key={style}>{style.replaceAll("-", " ")}</span>)}
                </div>
                <dl className="opening-facts">
                  <div><dt>For</dt><dd>{repertoire.audienceLabel}</dd></div>
                  <div><dt>Memory</dt><dd>{repertoire.memoryBurden}</dd></div>
                  <div><dt>Training positions</dt><dd>{repertoire.decisionCount}</dd></div>
                </dl>
                <div className="opening-card-actions">
                  <button disabled={submitting} onClick={() => void startReview(
                    repertoire.id,
                    repertoire.review.due > 0 ? "due" : repertoire.review.new > 0 ? "new" : "early",
                  )}>
                    {submitting ? "Starting…" : repertoire.review.due > 0
                      ? repertoire.review.due > 10
                        ? `Review 10 of ${repertoire.review.due} due`
                        : `Review ${repertoire.review.due} due`
                      : repertoire.review.new > 0 ? `Practise ${Math.min(5, repertoire.review.new)} new moves` : "Review early"}
                  </button>
                  {repertoire.review.due > 0 && repertoire.review.new > 0 && (
                    <button className="secondary" disabled={submitting} onClick={() => void startReview(repertoire.id, "new")}>
                      Practise {Math.min(5, repertoire.review.new)} new instead
                    </button>
                  )}
                  <button className="secondary" disabled={submitting} onClick={() => void startLesson(repertoire.id)}>
                    {repertoire.origin === "imported" ? "Study a full line" : "Study line in order"}
                  </button>
                  <button className="secondary" disabled={submitting} onClick={() => void openWorkspace(repertoire.id)}>
                    View all lines
                  </button>
                  <button className="text-button" disabled={submitting} onClick={() => void setRepertoireArchived(repertoire, true)}>
                    Archive
                  </button>
                </div>
                <p className="opening-review-summary">
                  <strong>{repertoire.review.reviewed}</strong> reviewed · <strong>{repertoire.review.learning}</strong> learning · <strong>{repertoire.review.new}</strong> new
                </p>
              </article>
            ))}
            {activeCatalog.length === 0 && (
              <div className="panel opening-empty-lines">
                <h3>Everything is archived</h3>
                <p>Restore a repertoire below or build your own to resume opening practice.</p>
              </div>
            )}
          </div>
          {archivedCatalog.length > 0 && (
            <details className="panel opening-archive-library">
              <summary>Archived repertoires <span>{archivedCatalog.length}</span></summary>
              <p>Archived repertoires stay out of practice and game comparisons. Their lines, notes and progress are preserved.</p>
              <div className="opening-archive-list">
                {archivedCatalog.map((repertoire) => (
                  <div key={repertoire.id}>
                    <span><strong>{repertoire.name}</strong><small>Play as {repertoire.learnerColor}</small></span>
                    <button className="secondary" disabled={submitting} onClick={() => void setRepertoireArchived(repertoire, false)}>Restore</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {step && phase !== "catalog" && (
        <div className="opening-lesson">
          <div className="opening-lesson-title panel">
            <div>
              <span className="eyebrow">{step.repertoire.name}</span>
              <h3>{step.chapter.title}</h3>
              <p>{step.chapter.introduction}</p>
            </div>
            <div className="opening-progress">
              <div className="opening-progress-topline">
                <span>Decision {step.decisionNumber} of {step.totalDecisions}</span>
                <button className="text-button" onClick={pauseLesson}>Pause</button>
              </div>
              <progress
                aria-label={`Lesson progress: decision ${step.decisionNumber} of ${step.totalDecisions}`}
                value={step.decisionNumber - 1}
                max={step.totalDecisions}
              />
              <small>{step.lineTitle}</small>
            </div>
          </div>

          <div className="trainer-layout opening-trainer-layout">
            <div className="board-column">
              <div className="candidate-banner">
                <div>
                  <span>{phase === "observe" ? "Before the opponent's move" : phase === "feedback" ? "Repertoire move shown" : `${step.learnerColor === "white" ? "White" : "Black"} to move`}</span>
                  <small>You are {step.learnerColor === "white" ? "White" : "Black"}. Your side is nearest.</small>
                </div>
                <strong>{phase === "observe"
                  ? "Notice their reply"
                  : moveFeedback
                    ? formatMoveLabel(step.moveNumber, step.learnerColor, moveFeedback.repertoireMove.moveSan)
                    : formatMoveLabel(step.moveNumber, step.learnerColor)}</strong>
              </div>
              <div className="board-toolbar">
                <span>{phase === "observe"
                  ? "Look at the position before advancing"
                  : phase === "move"
                    ? submitting ? "Checking your move…" : "Play a move — it is checked immediately"
                    : "The lesson's move is displayed"}</span>
              </div>
              <div className="opening-line-context" aria-label="Moves leading to this position">
                <span>Position reached after</span>
                <strong>{formatOpeningLineContext(step.movesBefore)}</strong>
              </div>
              <ChessBoard
                fen={displayFen}
                orientation={step.learnerColor}
                interactive={phase === "move" && !submitting}
                lastMove={lastMove}
                highlightedSquares={hintSquare ? [hintSquare] : []}
                onMove={playLessonMove}
              />
            </div>

            <div className="panel question-card opening-question-card" aria-live="polite">
              <span className="step-number">OPENING</span>

              {phase === "observe" && step.opponentMove && (
                <>
                  <span className="eyebrow">NOTICE</span>
                  <h3>The opponent is about to reply.</h3>
                  <p className="instruction">First look at what is developed, attacked, or defended. {step.opponentMove.moveSan} will play automatically.</p>
                  <button className="secondary" onClick={playOpponentMove}>Play now</button>
                </>
              )}

              {phase === "move" && (
                <>
                  <span className="eyebrow">CHOOSE</span>
                  <h3>{step.prompt}</h3>
                  <p className="instruction">Tap or click a piece, then a highlighted square — or drag the piece. Your move is checked immediately.</p>
                  {moveNotice && (
                    <div className="opening-move-result outside_repertoire" role="status">
                      <strong>{moveNotice.startsWith("Hint:") ? "Hint" : "Try again"}</strong>
                      <p>{moveNotice}</p>
                    </div>
                  )}
                  <div className="answer-actions">
                    <button className="secondary" disabled={submitting} onClick={showLessonHint}>
                      Hint: show the piece
                    </button>
                    <button className="secondary" disabled={submitting} onClick={showLessonMove}>
                      {submitting ? "Showing…" : "Show move"}
                    </button>
                  </div>
                </>
              )}

              {phase === "why" && moveFeedback && (
                <>
                  <span className="eyebrow">EXPLAIN</span>
                  <div className={`opening-move-result ${moveFeedback.moveOutcome}`} role="status">
                    <strong>{moveFeedback.moveOutcome === "repertoire"
                      ? "Repertoire move found"
                      : moveFeedback.moveOutcome === "alternative"
                        ? "Good alternative"
                        : "Different legal move"}</strong>
                    <p>{moveFeedback.message}</p>
                    {moveFeedback.moveOutcome !== "repertoire" && (
                      <small>You played {moveFeedback.playedMoveSan}; this line continues with {moveFeedback.repertoireMove.moveSan}.</small>
                    )}
                  </div>
                  <h3>{moveFeedback.whyQuestion}</h3>
                  <p className="instruction">{moveFeedback.whyOptions.length === 1
                    ? "Confirm the note status. The trainer will not invent a reason that was absent from your PGN."
                    : "Choose the main purpose. Other benefits will be explained afterwards."}</p>
                  <div className="opening-reason-options">
                    {moveFeedback.whyOptions.map((option) => (
                      <button
                        className="opening-reason"
                        disabled={submitting}
                        key={option.value}
                        onClick={() => void checkWhy(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button className="text-button" disabled={submitting} onClick={() => void checkWhy(null)}>
                    {submitting ? "Checking…" : "Show explanation"}
                  </button>
                </>
              )}

              {phase === "feedback" && whyFeedback && (
                <div className={`feedback ${whyFeedback.outcome === "correct" ? "excellent" : whyFeedback.outcome === "partial" || whyFeedback.outcome === "incorrect" ? "partial" : "revealed"}`} role="status">
                  <span className="feedback-label">{whyFeedback.correctConcept === "imported_note"
                    ? "Personal note reviewed"
                    : whyFeedback.correctConcept === "missing_explanation"
                      ? "Explanation gap identified"
                      : whyFeedback.outcome === "correct" ? "Main purpose identified" : whyFeedback.outcome === "partial" ? "Useful secondary benefit" : whyFeedback.outcome === "incorrect" ? "Different main purpose" : "Explanation shown"}</span>
                  <h3>{whyFeedback.explanation.summary}</h3>
                  {whyFeedback.outcome === "incorrect" && (
                    <p className="answer-comparison">The main idea here is <strong>{whyFeedback.correctLabel}</strong>.</p>
                  )}
                  {whyFeedback.outcome === "partial" && (
                    <p className="answer-comparison"><strong>{whyFeedback.selectedLabel}</strong> is a real benefit. The primary purpose here is <strong>{whyFeedback.correctLabel}</strong>.</p>
                  )}
                  <OpeningExplanation
                    explanation={whyFeedback.explanation}
                    showSummary={false}
                    showPersonalComment={false}
                    changesLabel={whyFeedback.correctConcept === "imported_note"
                      ? "Your imported note"
                      : whyFeedback.correctConcept === "missing_explanation"
                        ? "What the PGN tells us"
                        : "What changed"}
                  />
                  {moveFeedback && (
                    <OpeningLearningComment
                      repertoireId={step.repertoire.id}
                      moveId={moveFeedback.repertoireMove.moveId}
                      comment={whyFeedback.explanation.personalComment}
                      onSaved={updateLessonComment}
                    />
                  )}
                  <button disabled={submitting} onClick={() => void continueLesson()}>
                    {submitting ? "Continuing…" : pendingNext?.kind === "complete" ? "Finish lesson" : "Continue"}
                  </button>
                </div>
              )}

              {error && <p className="error" role="alert">{error}</p>}
            </div>
          </div>
        </div>
      )}

      {phase === "complete" && complete && (
        <div className="panel opening-complete" role="status">
          <span className="eyebrow">Guided line complete</span>
          <h3>{complete.chapterTitle}</h3>
          <p>{complete.message}</p>
          <div className="opening-complete-scores">
            <div><strong>{complete.repertoireMoves}/{complete.decisions}</strong><span>repertoire moves</span></div>
            <div><strong>{complete.reasonsUnderstood}/{complete.decisions}</strong><span>ideas identified</span></div>
          </div>
          <button onClick={returnToCatalog}>Back to opening choices</button>
        </div>
      )}

      {error && phase === "catalog" && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
