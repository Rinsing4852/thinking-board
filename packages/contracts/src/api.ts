export type Color = "white" | "black";
export type ResponseCategory = "check" | "capture" | "threat";
export type WhatChangedCategory =
  | "attacked_piece"
  | "undefended_piece"
  | "opened_line"
  | "closed_line"
  | "removed_defender"
  | "created_threat"
  | "king_safety"
  | "nothing_urgent";
export type CandidateType = "check" | "capture" | "threat" | "improve";
export type CandidateGrade = "excellent" | "good" | "playable" | "dubious" | "blunder";

export interface OpeningRepertoireSummary {
  id: string;
  slug: string;
  name: string;
  learnerColor: Color;
  firstMoveUci: string;
  firstMoveSan: string;
  summary: string;
  audienceLabel: string;
  style: string[];
  memoryBurden: "low" | "medium" | "high";
  contentVersion: number;
  status: "preview" | "published";
  chapterCount: number;
  decisionCount: number;
  origin: "built_in" | "imported";
  sourceTitle: string | null;
  review: OpeningReviewCounts;
}

export interface OpeningReviewCounts {
  total: number;
  due: number;
  new: number;
  learning: number;
  reviewed: number;
}

export interface OpeningCatalogResponse {
  repertoires: OpeningRepertoireSummary[];
}

export interface OpeningLineMove {
  id: string;
  ply: number;
  moveUci: string;
  moveSan: string;
  role: "learner" | "opponent";
  moveKind: "primary" | "alternative" | "response";
  fenBefore: string;
  fenAfter: string;
  explanation: {
    summary: string;
    changes: string[];
    concepts: string[];
    opponentIdea: string | null;
    resultingPlan: string | null;
    tacticalWarning: string | null;
    commonMistake: string | null;
    personalComment: string | null;
  };
}

export interface OpeningLearningCommentResponse {
  moveId: string;
  comment: string | null;
}

export interface OpeningLineDetail {
  id: string;
  title: string;
  priority: number;
  moveCount: number;
  learnerDecisionCount: number;
  sanSequence: string;
  moves: OpeningLineMove[];
}

export interface OpeningChapterDetail {
  id: string;
  title: string;
  introduction: string;
  lines: OpeningLineDetail[];
}

export interface OpeningRepertoireDetailResponse {
  repertoire: {
    id: string;
    name: string;
    learnerColor: Color;
    summary: string;
    origin: "built_in" | "imported";
    sourceTitle: string | null;
    editable: boolean;
  };
  chapters: OpeningChapterDetail[];
}

export interface OpeningLineMutationResponse {
  detail: OpeningRepertoireDetailResponse;
  lineId: string;
  createdBranch: boolean;
  message: string;
}

export interface OpeningCoverageGap {
  positionId: string;
  fen: string;
  chapterTitle: string;
  lineTitle: string;
  moveUci: string;
  moveSan: string;
  games: number;
  frequencyPercent: number;
}

export interface OpeningCoverageResponse {
  repertoireId: string;
  ratingGroup: number;
  speeds: string[];
  positionsChecked: number;
  positionsAvailable: number;
  coveragePercent: number | null;
  coveredGames: number;
  totalGames: number;
  gaps: OpeningCoverageGap[];
  incomplete: boolean;
  message: string;
}

export interface OpeningAnalysisLine {
  rank: number;
  moveUci: string;
  moveSan: string;
  pvSan: string[];
  score: {
    kind: "centipawns" | "mate";
    value: number;
    perspective: "side_to_move";
  };
}

export interface OpeningPositionAnalysisResponse {
  fen: string;
  depth: number;
  lines: OpeningAnalysisLine[];
}

export interface OpeningExplorerReply {
  moveUci: string;
  moveSan: string;
  games: number;
  frequencyPercent: number;
}

export interface OpeningExplorerPositionResponse {
  fen: string;
  ratingGroup: number;
  speeds: string[];
  totalGames: number;
  opening: { eco: string; name: string } | null;
  replies: OpeningExplorerReply[];
  cached: boolean;
}

export interface LichessConnectionResponse {
  connected: boolean;
  username: string | null;
  lastSyncedAt: string | null;
  lastGameAt: string | null;
  tokenConfigured: boolean;
}

export interface LichessSyncResponse extends ImportPgnResponse {
  connection: LichessConnectionResponse;
  message: string;
}

export type GameOpeningStatus =
  | "in_repertoire"
  | "player_deviation"
  | "opponent_deviation"
  | "repertoire_ended"
  | "not_covered";

export interface GameOpeningConnection {
  matchId: string;
  status: GameOpeningStatus;
  repertoire: {
    id: string;
    name: string;
    learnerColor: Color;
    origin: "built_in" | "imported";
  };
  matchedPlies: number;
  matchedPlayerMoves: number;
  lastBookPly: number;
  departure: null | {
    ply: number;
    moveNumber: number;
    moverColor: Color;
    moveUci: string;
    moveSan: string;
    fenBefore: string;
    fenAfter: string;
  };
  expectedMove: null | {
    moveUci: string;
    moveSan: string;
    chapterTitle: string;
    lineTitle: string;
    explanation: {
      summary: string;
      changes: string[];
      resultingPlan: string | null;
      tacticalWarning: string | null;
      commonMistake: string | null;
      personalComment: string | null;
    };
  };
  practiceAvailable: boolean;
}

export type OpeningImportColor = Color | "both";
export type OpeningImportSourceType = "self_authored" | "book_notes" | "lichess_study" | "licensed_pgn";

export interface OpeningImportChapterPreview {
  sourceIndex: number;
  title: string;
  lineCount: number;
  maximumPly: number;
  importable: boolean;
}

export interface OpeningImportPreviewResponse {
  suggestedName: string;
  learnerColors: Color[];
  firstMoveSan: string;
  chapterCount: number;
  lineCount: number;
  learnerDecisionCount: number;
  explainedDecisionCount: number;
  missingExplanationCount: number;
  chapters: OpeningImportChapterPreview[];
  warnings: string[];
}

export interface OpeningLichessStudyPreviewResponse extends OpeningImportPreviewResponse {
  studyId: string;
  chapterId: string | null;
  studyUrl: string;
}

export interface OpeningImportResponse {
  repertoireIds: string[];
  imported: number;
  duplicates: number;
  message: string;
}

export interface OpeningLessonOpponentMove {
  moveUci: string;
  moveSan: string;
}

export interface OpeningAcceptedMove {
  moveUci: string;
  moveSan: string;
}

export interface OpeningLessonStep {
  kind: "step";
  attemptId: string;
  repertoire: { id: string; name: string };
  chapter: { id: string; title: string; introduction: string };
  lineTitle: string;
  learnerColor: Color;
  decisionNumber: number;
  totalDecisions: number;
  moveNumber: number;
  fenBeforeOpponent: string;
  fenToMove: string;
  opponentMove: OpeningLessonOpponentMove | null;
  movesBefore: string[];
  prompt: string;
  acceptedMoves: OpeningAcceptedMove[];
  moveAnswer: OpeningMoveAnswerResponse | null;
}

export interface OpeningLessonComplete {
  kind: "complete";
  attemptId: string;
  repertoireName: string;
  chapterTitle: string;
  decisions: number;
  repertoireMoves: number;
  reasonsUnderstood: number;
  message: string;
}

export type OpeningLessonState = OpeningLessonStep | OpeningLessonComplete;

export interface OpeningReasonOption {
  value: string;
  label: string;
}

export interface OpeningMoveAnswerResponse {
  moveOutcome: "repertoire" | "alternative" | "outside_repertoire";
  playedMoveSan: string;
  repertoireMove: { moveId: string; moveUci: string; moveSan: string };
  fenAfterMove: string;
  message: string;
  whyQuestion: string;
  whyOptions: OpeningReasonOption[];
}

export interface OpeningWhyAnswerResponse {
  kind: "feedback";
  attemptId: string;
  step: OpeningLessonStep;
  outcome: "correct" | "partial" | "incorrect" | "revealed";
  selectedConcept: string | null;
  selectedLabel: string | null;
  selectedIsPrimary: boolean;
  correctConcept: string;
  correctLabel: string;
  explanation: {
    summary: string;
    changes: string[];
    resultingPlan: string | null;
    tacticalWarning: string | null;
    commonMistake: string | null;
    personalComment: string | null;
  };
  next: OpeningLessonState;
}

export type OpeningLessonActiveState = OpeningLessonStep | OpeningWhyAnswerResponse;

export interface OpeningReviewOpponentMove {
  moveUci: string;
  moveSan: string;
}

export interface OpeningReviewExercise {
  kind: "exercise";
  sessionId: string;
  repertoire: { id: string; name: string };
  learnerColor: Color;
  positionNumber: number;
  totalPositions: number;
  presentationKind: "scheduled" | "lapse_repeat";
  learningStage: "new" | "learning" | "review";
  fenBeforeOpponent: string;
  fenToMove: string;
  opponentMove: OpeningReviewOpponentMove | null;
  movesBefore: string[];
  moveNumber: number;
  prompt: string;
  acceptedMoves: OpeningAcceptedMove[];
  introduction: {
    repertoireMove: { moveId: string; moveUci: string; moveSan: string };
    fenAfterMove: string;
    explanation: {
      summary: string;
      changes: string[];
      resultingPlan: string | null;
      tacticalWarning: string | null;
      commonMistake: string | null;
      personalComment: string | null;
    };
  };
}

export interface OpeningReviewFeedback {
  kind: "feedback";
  sessionId: string;
  exercise: OpeningReviewExercise;
  outcome: "remembered" | "learning" | "again";
  recallSpeed: "normal" | "slow" | null;
  assisted: boolean;
  revealed: boolean;
  playedMove: { moveUci: string; moveSan: string };
  repertoireMove: { moveUci: string; moveSan: string };
  fenAfterMove: string;
  message: string;
  explanation: {
    summary: string;
    changes: string[];
    resultingPlan: string | null;
    tacticalWarning: string | null;
    commonMistake: string | null;
    personalComment: string | null;
  };
  nextDueAt: string;
  lapseQueued: boolean;
}

export interface OpeningReviewComplete {
  kind: "complete";
  sessionId: string;
  repertoireName: string;
  attempts: number;
  positions: number;
  remembered: number;
  introduced: number;
  lapses: number;
  message: string;
}

export type OpeningReviewState = OpeningReviewExercise | OpeningReviewComplete;
export type OpeningReviewActiveState = OpeningReviewExercise | OpeningReviewFeedback;

export interface OpeningReviewMistakeResponse {
  moveUci: string;
  moveSan: string;
  attemptNumber: number;
}

export interface PreviewGame {
  index: number;
  white: string;
  black: string;
  result: string;
  date: string | null;
  moveCount: number;
  fingerprint: string;
  duplicate: boolean;
}

export interface PgnPreviewResponse {
  games: PreviewGame[];
  players: string[];
  errors: Array<{ index: number; message: string }>;
}

export interface ImportPgnResponse {
  batchId: string;
  jobId: string | null;
  imported: number;
  duplicates: number;
  rejected: number;
  errors: Array<{ index: number; message: string }>;
}

export interface JobResponse {
  id: string;
  kind: string;
  status: "queued" | "running" | "completed" | "failed";
  progressCurrent: number;
  progressTotal: number;
  result: unknown;
  error: string | null;
}

export interface EmptyTrainingResponse {
  kind: "empty";
  message: string;
  options: Array<{ pool: string; label: string; count: number }>;
}

export interface BlunderCheckExercise {
  kind: "exercise";
  attemptId: string | null;
  itemId: string;
  mode: "blunder_check";
  fenBefore: string;
  fenAfterCandidate: string;
  candidateMoveUci: string;
  candidateMoveSan: string;
  playerColor: Color;
  moveNumber: number;
  prompt: string;
}

export type NextTrainingResponse = EmptyTrainingResponse | BlunderCheckExercise;

export interface WhatChangedExercise {
  kind: "exercise";
  attemptId: string | null;
  itemId: string;
  mode: "what_changed";
  fenBeforeOpponent: string;
  fenAfterOpponent: string;
  opponentMoveUci: string;
  opponentMoveSan: string;
  playerColor: Color;
  moveNumber: number;
  prompt: string;
}

export type NextWhatChangedResponse = EmptyTrainingResponse | WhatChangedExercise;

export interface WhatChangedAnswerResponse {
  outcome: "excellent" | "partial" | "incorrect";
  score: number;
  categoryCorrect: boolean;
  squareCorrect: boolean;
  correctCategory: WhatChangedCategory;
  correctSquares: string[];
  explanation: string;
  checklistPoint: string;
}

export interface CandidateGenerationExercise {
  kind: "exercise";
  attemptId: string | null;
  itemId: string;
  mode: "candidate_generation";
  fen: string;
  playerColor: Color;
  moveNumber: number;
  prompt: string;
}

export type NextCandidateGenerationResponse = EmptyTrainingResponse | CandidateGenerationExercise;

export interface CandidateSubmission {
  moveUci: string;
  declaredType: CandidateType;
}

export interface CandidateGradeResult {
  moveUci: string;
  moveSan: string;
  declaredType: CandidateType;
  detectedTypes: CandidateType[];
  typeCorrect: boolean | null;
  centipawnLoss: number;
  grade: CandidateGrade;
}

export interface CandidateGenerationAnswerResponse {
  outcome: "excellent" | "partial" | "incorrect";
  score: number;
  candidates: CandidateGradeResult[];
  engineCandidates: Array<{
    moveUci: string;
    moveSan: string;
    centipawnLoss: number;
    grade: CandidateGrade;
  }>;
  explanation: string;
  checklistPoint: string;
}

export interface TrainingAnswerResponse {
  outcome: "excellent" | "partial" | "incorrect";
  score: number;
  categoryCorrect: boolean;
  moveCorrect: boolean;
  playedMoveSan: string | null;
  acceptableMoves: Array<{
    moveUci: string;
    moveSan: string;
    categories: ResponseCategory[];
  }>;
  explanation: string;
  checklistPoint: string;
}

export interface PunishBlunderExercise {
  kind: "exercise";
  attemptId: string | null;
  itemId: string;
  mode: "punish_blunder";
  fen: string;
  badMoveSan: string;
  opponentColor: Color;
  moveNumber: number;
  prompt: string;
}

export type NextPunishBlunderResponse = EmptyTrainingResponse | PunishBlunderExercise;

export interface PunishBlunderAnswerResponse {
  outcome: "excellent" | "incorrect";
  score: number;
  moveCorrect: boolean;
  playedMoveSan: string | null;
  acceptableMoves: Array<{
    moveUci: string;
    moveSan: string;
    categories: ResponseCategory[];
  }>;
  explanation: string;
  checklistPoint: string;
}

export interface QuietPositionExercise {
  kind: "exercise";
  attemptId: string | null;
  itemId: string;
  mode: "quiet_position";
  fen: string;
  playerColor: Color;
  moveNumber: number;
  prompt: string;
}

export type NextQuietPositionResponse = EmptyTrainingResponse | QuietPositionExercise;

export interface QuietPositionAnswerResponse {
  outcome: "excellent" | "partial" | "incorrect";
  score: number;
  pieceCorrect: boolean;
  moveCorrect: boolean;
  selectedMoveSan: string | null;
  weakestSquares: string[];
  acceptableMoves: Array<{ moveUci: string; moveSan: string; centipawnLoss: number }>;
  explanation: string;
  checklistPoint: string;
}

export interface SkillMetric {
  conceptId: string;
  family: string;
  label: string;
  attempts: number;
  successes: number;
  successRate: number | null;
  averageResponseMs: number | null;
  recentTrend: "improving" | "steady" | "declining" | "new";
  realGameOccurrences: number;
}

export interface DashboardResponse {
  profile: { id: string; displayName: string } | null;
  totals: {
    games: number;
    trainingItems: number;
    due: number;
    attempts: number;
    gameAttempts: number;
    openingAttempts: number;
  };
  recurringProblems: SkillMetric[];
  skills: SkillMetric[];
  recommendedSession: Array<{ mode: string; label: string; count: number }>;
}

export interface TrainingSessionResponse {
  id: string | null;
  requestedSize: number;
  items: Array<{ itemId: string; mode: string; ordinal: number }>;
  mix: Array<{ mode: string; label: string; count: number }>;
  message: string;
  status?: "active" | "completed";
  completedCount?: number;
  currentItem?: { itemId: string; mode: string; ordinal: number } | null;
}
