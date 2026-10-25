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
  sourceUpdatedAt?: string | null;
  archived: boolean;
  activeLineCount: number;
  archivedLineCount: number;
  review: OpeningReviewCounts;
  newResponseCount?: number;
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

export interface OpeningLineProgress {
  repertoireId: string;
  repertoireName: string;
  lineId: string;
  lineTitle: string;
  practiceEnabled?: boolean;
  learnerColor: Color;
  decisions: number;
  mastered: number;
  accuracyPercent: number | null;
  recallAttempts?: number;
  testedDecisions?: number;
  lapses: number;
  averageResponseMs: number | null;
  gameMisses: number;
  due: number;
}

export interface OpeningProgressResponse {
  totalLines: number;
  masteredLines: number;
  lines: OpeningLineProgress[];
  weakestLines: OpeningLineProgress[];
}

export interface OpeningBoardAnnotation {
  color: "green" | "red" | "blue" | "yellow";
  from: string;
  to: string;
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
    sourceSummary?: string;
    changes: string[];
    concepts: string[];
    opponentIdea: string | null;
    resultingPlan: string | null;
    tacticalWarning: string | null;
    commonMistake: string | null;
    personalComment: string | null;
    ideaHint?: string | null;
    boardAnnotations?: OpeningBoardAnnotation[];
  };
}

export interface OpeningLearningCommentResponse {
  moveId: string;
  comment: string | null;
  ideaHint?: string | null;
}

export interface OpeningLineDetail {
  id: string;
  title: string;
  priority: number;
  moveCount: number;
  learnerDecisionCount: number;
  sanSequence: string;
  archived: boolean;
  practiceEnabled?: boolean;
  moves: OpeningLineMove[];
}

export type OpeningLineFrequencyBand = "common" | "uncommon" | "rare" | "unknown";
export interface OpeningPracticeLineEvidence {
  lineId: string;
  enabled: boolean;
  frequency: {
    band: OpeningLineFrequencyBand;
    percent: number | null;
    moveLabel: string | null;
    sampleGames: number | null;
    knownReplies: number;
    totalReplies: number;
    pathPercent?: number | null;
  };
  recall: OpeningLineProgress | null;
  fullRuns: { completed: number; unaided: number; accuracyPercent: number | null };
}
export interface OpeningPracticeSelectionResponse {
  repertoireId: string;
  ratingGroup: number;
  useExplorer: boolean;
  enabledCount: number;
  lines: OpeningPracticeLineEvidence[];
  remainingPositions: number;
  message: string | null;
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
    archived: boolean;
  };
  chapters: OpeningChapterDetail[];
}

export interface OpeningLineMutationResponse {
  changed?: boolean;
  detail: OpeningRepertoireDetailResponse;
  lineId: string;
  moveId: string;
  createdBranch: boolean;
  message: string;
}

export interface OpeningMoveUndoResponse {
  detail: OpeningRepertoireDetailResponse;
  lineId: string;
  message: string;
}

export type OpeningLineDeletionResponse = {
  deletedLineId: string;
  message: string;
} & ({ detail: OpeningRepertoireDetailResponse; nextLineId: string; deletedRepertoireId?: never }
  | { detail: null; nextLineId: null; deletedRepertoireId: string });

export interface OpeningRepertoireDeletionResponse {
  deletedRepertoireId: string;
  message: string;
}

export interface OpeningLibraryDeletionResponse {
  deletedRepertoireIds: string[];
  message: string;
}

export interface OpeningArchiveResponse {
  entity: "repertoire" | "line";
  id: string;
  archived: boolean;
  message: string;
  detail?: OpeningRepertoireDetailResponse;
}

export interface OpeningMetadataMutationResponse {
  detail: OpeningRepertoireDetailResponse;
  message: string;
}

export interface OpeningCoverageGap {
  task?: { id: string; kind: string; priority: number; reason: string };
  taskChoice?: { choice: "later" | "skip"; untilAt: string | null };
  sourceGames?: Array<{ id: string; ply: number }>;

  positionId: string;
  fen: string;
  chapterTitle: string;
  lineTitle: string;
  moveUci: string;
  moveSan: string;
  games: number;
  frequencyPercent: number;
  personalFrequency?: { games: number; positionGames: number; percent: number | null };
  preparation?: OpeningPreparationAssessment;
  lineId?: string;
  status?: OpeningCoverageBranch["status"];
  reachPercent?: number | null;
  recallPercent?: number | null;
  recallAttempts?: number;
  responseLineId?: string | null;
  responseMoveId?: string | null;
  /** Canonical destination of an unanswered reply, for transposition deduplication. */
  targetPositionKey?: string;
}

export interface OpeningCoverageBranch extends OpeningCoverageGap {
  status: "prepared" | "needs_practice" | "missing_response" | "idea_only" | "unprepared" | "unknown";
  responseSan: string | null;
  responseMoveId: string | null;
  responseLineId?: string | null;
  sampledGames: number;
  fresh: boolean;
  reliable: boolean;
  boundary: boolean;
  practiceEnabled: boolean;
}

export interface OpeningCoveragePosition {
  positionId: string;
  fen: string;
  lineId: string;
  lineTitle: string;
  chapterTitle: string;
  ply: number;
  pathSan?: string;
  inScope?: boolean;
  boundary: boolean;
  sampleStatus: "fresh" | "stale" | "small_sample" | "missing";
  sampledGames: number;
  fetchedAt: string | null;
  branches: OpeningCoverageBranch[];
}

export type OpeningPreparationChoice = "idea" | "unprepared" | "line";

export interface OpeningPreparationAssessment {
  priority: "high" | "medium" | "low" | "unknown";
  recommendation: "prepare_line" | "learn_idea" | "optional" | "inspect";
  title: string;
  message: string;
  reasons: string[];
  frequency: {
    status: "known" | "small_sample" | "unknown" | "off" | "unavailable";
    percent: number | null;
    moveGames: number | null;
    positionGames: number;
    ratingGroup: number;
    speeds: string[];
    stale: boolean;
  };
  personal: { occurrences: number; responsesAnalyzed: number; responseMistakes: number; opponentMistakes: number };
  difficulty: "several_replies" | "precise_reply" | "forcing" | "unknown";
  decision: { choice: OpeningPreparationChoice; note: string; updatedAt: string } | null;
}

export interface OpeningPreparationDecisionResponse {
  assessment: OpeningPreparationAssessment;
  inbox: GameOpeningInboxResponse;
  message: string;
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
  evidence?: {
    totalPositions: number; freshPositions: number; stalePositions: number;
    smallSamplePositions: number; missingPositions: number; remainingPositions: number;
    nextOffset: number | null;
    scanMode?: "missing" | "refresh";
  };
  positions?: OpeningCoveragePosition[];
  personal?: {
    replyOccurrences?: number; preparedReplyOccurrences?: number; preparedPercent?: number | null;
    gamesChecked: number; gamesMatched: number; playerDeviations: number;
    opponentDeviations: number; repertoireEnded: number; stayedIn: number;
  };
  goal?: { games: number; thresholdPercent: number; relevantMissing: number; uncertain: number; met: boolean };
  scope?: { personal: string; lichess: string };
  taskHistory?: OpeningCoverageGap[];
  model?: {
    throughMove: number; routeLineId: string; routeTitle: string;
    preparedPercent: number; missingPercent: number; ideaPercent: number;
    unpreparedPercent: number; unknownPercent: number;
    assumptions: string;
  };
}

export interface OpeningAnalysisLine {
  depth?: number;
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

export interface OpeningMoveQuality {
  verdict: "playable" | "weaker" | "uncertain";
  message: string;
  lossCp?: number;
  depth?: number;
}

export interface OpeningPositionAnalysisResponse {
  engineName?: string;
  nodes?: number;
  fen: string;
  depth: number;
  lines: OpeningAnalysisLine[];
}

export interface OpeningExplorerReply {
  moveUci: string;
  moveSan: string;
  games: number;
  frequencyPercent: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
}

export interface OpeningExplorerPositionResponse {
  fen: string;
  ratingGroup: number;
  speeds: string[];
  totalGames: number;
  opening: { eco: string; name: string } | null;
  replies: OpeningExplorerReply[];
  cached: boolean;
  fetchedAt?: string;
  stale?: boolean;
}

export type OpeningRatingPlatform = "lichess" | "chess_com" | "fide" | "not_sure";
export type OpeningPracticePace = "normal" | "relaxed";
export type OpeningPausePolicy = "never" | "mistakes" | "notes" | "always";

export interface OpeningPlayerPreferences {
  coverageGoalGames?: number;
  explorerSpeeds?: string[];
  configured: boolean;
  ratingGroup: number;
  platform: OpeningRatingPlatform;
  useExplorer: boolean;
  explorerAvailable: boolean;
  newMovesPerSession: number;
  dailyPracticeGoal: number;
  practiceTimeZone: string;
  practiceDepth: number;
  boardSounds: boolean;
  practicePace: OpeningPracticePace;
  pauseAfterMove: OpeningPausePolicy;
  updatedAt: string | null;
}

export interface OpeningPracticeActivity {
  date: string;
  timeZone: string;
  goal: number;
  completedToday: number;
  independentToday: number;
  remaining: number;
  goalReached: boolean;
  streakDays: number;
  days: Array<{ date: string; completed: number; independent: number }>;
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

export interface GameOpeningInboxOccurrence {
  game: {
    id: string;
    white: string;
    black: string;
    playerColor: Color;
    result: string;
    playedAt: string | null;
    analyzedAt: string | null;
  };
  reviewedAt: string | null;
}

export interface GameOpeningInboxGroup {
  key: string;
  opening: GameOpeningConnection;
  occurrenceCount: number;
  unreviewedCount: number;
  latestGameId: string;
  occurrences: GameOpeningInboxOccurrence[];
  preparation?: OpeningPreparationAssessment;
}

export interface GameOpeningInboxResponse {
  groups: GameOpeningInboxGroup[];
  totalGroups: number;
  unreviewedGroups: number;
  repeatedGroups: number;
}

export interface OpeningSurprisePreparationResponse {
  repertoire: {
    id: string;
    name: string;
    copiedFromBuiltIn: boolean;
  };
  lineId: string;
  opponentMove: { moveUci: string; moveSan: string };
  replyMove: { moveUci: string; moveSan: string };
  message: string;
  inbox: GameOpeningInboxResponse;
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

export interface OpeningUpdatePreviewResponse {
  previewId: string;
  repertoireId: string;
  addedLines: number;
  extendedLines: number;
  retainedLines: number;
  updatedNotes: number;
  addedMoves: number;
  chapters: Array<{ title: string; lineCount: number }>;
  warnings: string[];
}

export interface OpeningUpdateResponse {
  repertoireId: string;
  sourceUpdatedAt: string;
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
    ideaHint?: string | null;
  };
  next: OpeningLessonState;
}

export type OpeningLessonActiveState = OpeningLessonStep | OpeningWhyAnswerResponse;

export interface OpeningReviewOpponentMove {
  moveUci: string;
  moveSan: string;
}

export type OpeningReviewReasonKind = "game_miss" | "due" | "new" | "early" | "retry";

export interface OpeningReviewRecommendation {
  activity?: OpeningPracticeActivity;
  available: boolean;
  repertoire: { id: string; name: string; learnerColor: Color } | null;
  counts: {
    gameMisses: number;
    due: number;
    new: number;
    early: number;
    total: number;
  };
  message: string;
}

export interface OpeningReviewExercise {
  lastDifferentMove?: {moveUci:string;moveSan:string};
  kind: "exercise";
  sessionId: string;
  queueEntryId: string;
  repertoire: { id: string; name: string };
  learnerColor: Color;
  positionNumber: number;
  totalPositions: number;
  presentationKind: "scheduled" | "lapse_repeat";
  phase?: "introduction" | "recall";
  introductionProgress?: { current: number; total: number };
  responseSequence?: {number: number; total: number};
  learningStage: "new" | "learning" | "review";
  practiceReason: { kind: OpeningReviewReasonKind; label: string };
  lineRun: { lineId: string; lineTitle: string; chapterTitle?: string } | null;
  sourceContext?: { lineId: string; ply: number };
  fenBeforeOpponent: string;
  fenToMove: string;
  opponentMove: OpeningReviewOpponentMove | null;
  movesBefore: string[];
  moveNumber: number;
  prompt: string;
  acceptedMoves: OpeningAcceptedMove[];
  assistance: { pieceHint: boolean; moveShown: boolean; ideaHint?: boolean };
  preparationNote?: string | null;
  introduction: {
    repertoireMove: { moveId: string; moveUci: string; moveSan: string };
    fenAfterMove: string;
    explanation: {
      summary: string;
      sourceSummary?: string;
      changes: string[];
      resultingPlan: string | null;
      tacticalWarning: string | null;
      commonMistake: string | null;
      personalComment: string | null;
      ideaHint?: string | null;
      boardAnnotations?: OpeningBoardAnnotation[];
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
  extraPractice?: boolean;
  revealed: boolean;
  playedMove: { moveUci: string; moveSan: string };
  repertoireMove: { moveId: string; moveUci: string; moveSan: string };
  fenAfterMove: string;
  message: string;
  explanation: {
    summary: string;
    sourceSummary?: string;
    changes: string[];
    resultingPlan: string | null;
    tacticalWarning: string | null;
    commonMistake: string | null;
    personalComment: string | null;
    ideaHint?: string | null;
    boardAnnotations?: OpeningBoardAnnotation[];
  };
  nextDueAt: string;
  lapseQueued: boolean;
  sourceGames?: OpeningReviewGameEvidence;
}

export interface OpeningReviewGameEvidence {
  occurrences: number;
  games: Array<{ gameId: string; white: string; black: string; playedAt: string | null;
    playedMove: string; repertoireMove: string; moveNumber: number }>;
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
  firstTryRemembered: number;
  helpedPositions: number;
  mistakePositions: number;
  repeatAttempts: number;
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
  profileId?: string;
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

/** Imported example games and replay state, independent of scheduled recall. */
export interface OpeningStudyMove {
  ply: number; moveNumber: number; moverColor: Color; san: string; uci: string; fenAfter: string; comment: string | null;
}
export interface OpeningStudyGame {
  id: string; white: string; black: string; whiteRating: string | null; blackRating: string | null;
  date: string | null; result: string; source: string; event: string | null;
  matchPly: number; transposition: boolean; continuationMoves: number; annotationCount: number; reason: string;
}
export interface OpeningStudyReplay {
  game: OpeningStudyGame; initialFen: string; moves: OpeningStudyMove[]; currentPly: number; version: number;
}
export interface OpeningStudyResponse {
  repertoireId: string; lineId: string; savedPly: number; fen: string; learnerColor: Color;
  searchRating: number | null;
  libraryGames: number; matches: OpeningStudyGame[]; totalMatches: number;
  replay: OpeningStudyReplay | null;
  quiz?: OpeningStudyQuiz | null;
}

/** Whole-repertoire encounter goal under explicit saved-line policies. */
export interface OpeningRepertoireGoal {
  repertoireId: string; games: number; ratingGroup: number; speeds: string[]; maxPlies: number;
  plansAvailable: number; plansOmitted: number; conditionalStarts: number; met: boolean;
  plans: Array<{ id: string; title: string; conditional: boolean; conflict: boolean; met: boolean; relevantMissing: number;
    outcomes: Record<"terminal"|"stopped"|"rare"|"missing"|"idea"|"omitted"|"unknown"|"depth"|"cycle"|"work", number> }>;
  gaps: OpeningCoverageGap[]; policy: string;
  planScan: {offset: number; nextOffset: number|null; snapshot: string};
  scan: {checked: number; remaining: number; nextOffset: number|null; available: number; failed: number; mode: "missing"|"refresh"};
}

/** Verified Lichess examples from a bounded provider sample, not an exhaustive search. */
export interface OpeningStudyDiscoveryGame {
  source?:"online"|"masters";
  id: string; sourceUrl: string; white: string; black: string;
  whiteRating: number | null; blackRating: number | null; learnerRating: number;
  date: string | null; result: string; transposition: boolean; reason: string;
}
export interface OpeningStudyDiscoveryResponse {
  source?:OpeningStudySource;
  games: OpeningStudyDiscoveryGame[]; rating: number; learnerColor: Color;
  message: string; partial: boolean;
}

export interface GameReplayMove {
  ply:number; moveNumber:number; moverColor:Color; uci:string; san:string; fenBefore:string; fenAfter:string;
}
export interface GameReplayCheckpoint {
  id:string; ply:number; kind:"opening"|"engine"|"opponent"|"gap";
  label:string; question:string; canRecall:boolean; canSchedule:boolean;
  attempts:number; recalled:boolean;
}
export interface GameReplayResponse {
  gameId:string; snapshotId:string; savedAt:string; version:number; playerColor:Color;
  initialFen:string; moves:GameReplayMove[]; checkpoints:GameReplayCheckpoint[];
  currentPly:number; activeCheckpointId:string|null; phase:"replay"|"question"|"feedback";
  displayFen:string; displayMove:string|null; updatesAvailable:boolean; analysisPending:boolean;
  feedback:null|{message:string; outcome:string; answers:Array<{uci:string;san:string}>; explanation:string};
}
export interface GameReplayAction {
  snapshotId:string; version:number;
  action:"next"|"previous"|"jump"|"retry"|"answer"|"reveal"|"refresh"|"schedule"|"skip";
  ply?:number; checkpointId?:string; moveUci?:string;
}

export interface OpeningStudyQuiz {
  version: number; game: OpeningStudyGame; currentPly: number; totalPlies: number;
  fen: string; complete: boolean; hint: string | null;
  feedback: { playedSan: string | null; historicalSan: string; historicalUci: string;
    matches: boolean; revealed: boolean; comment: string | null } | null;
  progress: { attempted: number; matchedUnaided: number; helped: number };
}
export interface OpeningStudyQuizAction {
  savedPly: number; gameId: string; expectedFen: string; version: number;
  action: "start" | "hint" | "answer" | "reveal" | "continue" | "retry" | "restart" | "exit";
  moveUci?: string;
}

export type OpeningStudySource = "online" | "masters" | "both";
export interface OpeningMasterPosition {
  source:"masters"; fen:string; totalGames:number; fetchedAt:string; cached:boolean;
  replies:Array<Omit<OpeningExplorerReply,"frequencyPercent"> & {frequencyPercent:number|null}>;
}
export interface OpeningGeneratedDraft {
  id:string; state:"preview"|"applied"|"undone"; moves:Array<{uci:string;san:string}>;
  source:string; message:string;
  detail?:OpeningRepertoireDetailResponse; lineId?:string;
}

export type GameMoveGrade = "best" | "good" | "inaccuracy" | "mistake" | "blunder";
export interface GameQualityMove {
  ply:number; moveNumber:number; color:Color; san:string; grade:GameMoveGrade;
  accuracy:number; chanceLoss:number; chancesBefore:number; chancesAfter:number; bestSan:string;
  verification?:{reason:string;initialGrade:GameMoveGrade;depth:number}|null;
}
export interface GameQualitySide {
  moves:number; accuracy:number|null; counts:Record<GameMoveGrade,number>; errorsPer100Moves:number|null;
  firstMistake:number|null; firstBlunder:number|null;
}
export interface GameQualityReport {
  gameId:string; analyzedAt:string; cohort:string; engine:string; depth:number; ruleVersion:string;
  playerColor:Color; timeControl:string; white:GameQualitySide; black:GameQualitySide;
  moves:GameQualityMove[]; opening:GameOpeningConnection|null;
}
export interface GameQualityWindow {
  games:number; moves:number; accuracy:number|null; goodMovePercent:number|null; blundersPerGame:number|null; mistakesPerGame:number|null;
  errorsPer100Moves:number|null; firstMistakeMedian:number|null; firstBlunderMedian:number|null; blunderFreeGames:number;
  checkpoints:Array<{move:number;observed:number;withoutBlunder:number;endedEarlier:number}>;
}
export interface GameQualityTrends {
  totalGames:number; analyzedGames:number; excludedGames:number;
  cohorts:Array<{id:string;engine:string;depth:number;ruleVersion:string}>; cohort:string|null;
  timeControls:string[]; timeControl:string|null; recent:GameQualityWindow; previous:GameQualityWindow;
}
