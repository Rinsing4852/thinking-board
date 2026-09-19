import type {
  CandidateGrade,
  CandidateType,
  Color,
  ResponseCategory,
  WhatChangedCategory,
} from "../../../packages/contracts/src/api";

export const RESPONSE_CATEGORIES: Array<{
  value: ResponseCategory;
  label: string;
  symbol: string;
  description: string;
}> = [
  { value: "check", label: "Check", symbol: "+", description: "Their move attacks your king, so you must respond." },
  { value: "capture", label: "Capture", symbol: "×", description: "They can take one of your pieces or pawns immediately." },
  { value: "threat", label: "Threat", symbol: "!", description: "They set up something important on the next move if you ignore it." },
];

export const WHAT_CHANGED_OPTIONS: Array<{
  value: WhatChangedCategory;
  label: string;
  description: string;
}> = [
  { value: "attacked_piece", label: "Attacked piece", description: "One of your pieces can now be taken." },
  { value: "undefended_piece", label: "Undefended piece", description: "A piece lost its last defender." },
  { value: "opened_line", label: "Opened line", description: "A rook, bishop, or queen now sees through squares that were blocked." },
  { value: "closed_line", label: "Closed line", description: "A rook, bishop, or queen has had its path blocked." },
  { value: "removed_defender", label: "Removed defender", description: "A protecting piece moved away or was exchanged." },
  { value: "created_threat", label: "Created threat", description: "They are preparing to win something important on their next move." },
  { value: "king_safety", label: "Changed king safety", description: "A king gained or lost protection, or a route toward it opened." },
  { value: "nothing_urgent", label: "Nothing urgent", description: "No immediate danger needs an answer." },
];

export const CANDIDATE_TYPES: Array<{
  value: CandidateType;
  label: string;
  order: number;
  description: string;
}> = [
  { value: "check", label: "Checks", order: 1, description: "Moves that attack the king and force a response." },
  { value: "capture", label: "Captures", order: 2, description: "Moves that take an opponent’s piece or pawn now." },
  { value: "threat", label: "Threats", order: 3, description: "Moves that prepare to win something important next move." },
  { value: "improve", label: "Improve a piece", order: 4, description: "A move that develops or activates a piece with little useful work." },
];

export const CANDIDATE_GRADE_COPY: Record<CandidateGrade, { label: string; description: string }> = {
  excellent: { label: "Excellent", description: "One of the strongest choices in the position." },
  good: { label: "Good", description: "A strong move that keeps the position healthy." },
  playable: { label: "Playable", description: "A reasonable move, though stronger choices exist." },
  dubious: { label: "Dubious", description: "This gives the opponent an avoidable opportunity." },
  blunder: { label: "Blunder", description: "This loses something important or allows a decisive attack." },
};

export function formatMoveLabel(moveNumber: number, color: Color, moveSan?: string): string {
  const number = `${moveNumber}${color === "white" ? "." : "…"}`;
  return moveSan ? `${number} ${moveSan}` : number;
}

export function formatOpeningLineContext(moves: string[]): string {
  if (moves.length === 0) return "Starting position";
  return moves.map((move, index) => index % 2 === 0 ? `${Math.floor(index / 2) + 1}.${move}` : move).join(" ");
}

export function categoryLabel(category: ResponseCategory): string {
  return RESPONSE_CATEGORIES.find((option) => option.value === category)?.label ?? category;
}

export function changeCategoryLabel(category: WhatChangedCategory): string {
  return WHAT_CHANGED_OPTIONS.find((option) => option.value === category)?.label ?? category;
}
