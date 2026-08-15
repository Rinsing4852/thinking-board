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
  totals: { games: number; trainingItems: number; due: number; attempts: number };
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
