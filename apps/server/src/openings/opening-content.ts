import { createHash } from "node:crypto";

import { Chess } from "chess.js";

import type { Color } from "../../../../packages/contracts/src/api.js";

export const OPENING_CONCEPTS = [
  "central_control",
  "development",
  "king_safety",
  "piece_activity",
  "pawn_structure",
  "pawn_break",
  "prophylaxis",
  "space",
  "tempo",
  "tactical_safety",
  "imported_note",
  "missing_explanation",
] as const;

export type OpeningConcept = (typeof OPENING_CONCEPTS)[number];
export type MemoryBurden = "low" | "medium" | "high";
export type CurriculumStatus = "preview" | "published";

export interface MoveExplanation {
  summary: string;
  changes: readonly string[];
  concepts: readonly OpeningConcept[];
  opponentIdea?: string;
  resultingPlan?: string;
  tacticalWarning?: string;
  commonMistake?: string;
}

export interface AuthoredOpeningMove {
  moveUci: string;
  explanation: MoveExplanation;
  frequency?: number;
  kind?: "primary" | "alternative";
}

export interface AuthoredOpeningLine {
  id: string;
  title: string;
  priority: number;
  moves: AuthoredOpeningMove[];
}

export interface AuthoredOpeningChapter {
  id: string;
  title: string;
  introduction: string;
  rootFen?: string;
  lines: AuthoredOpeningLine[];
}

export interface OpeningSource {
  id: string;
  kind: "authored" | "dataset" | "statistics";
  title: string;
  url?: string;
  license?: string;
  accessedAt?: string;
}

export interface OpeningCurriculum {
  id: string;
  slug: string;
  version: number;
  status: CurriculumStatus;
  name: string;
  learnerColor: Color;
  firstMoveUci: string;
  summary: string;
  audienceLabel: string;
  style: string[];
  memoryBurden: MemoryBurden;
  chapters: AuthoredOpeningChapter[];
  sources: OpeningSource[];
}

export interface CompiledPosition {
  id: string;
  key: string;
  fen: string;
  sideToMove: Color;
}

export interface CompiledMove extends Omit<AuthoredOpeningMove, "kind"> {
  id: string;
  fromPositionId: string;
  toPositionId: string;
  san: string;
  role: "learner" | "opponent";
  kind: "primary" | "alternative" | "response";
}

export interface CompiledLine {
  id: string;
  slug: string;
  title: string;
  priority: number;
  moveIds: string[];
  positionIds: string[];
}

export interface CompiledChapter {
  id: string;
  slug: string;
  title: string;
  introduction: string;
  rootPositionId: string;
  lines: CompiledLine[];
}

export interface CompiledOpeningCurriculum {
  curriculum: OpeningCurriculum;
  firstMoveSan: string;
  positions: CompiledPosition[];
  moves: CompiledMove[];
  chapters: CompiledChapter[];
}

const STANDARD_START_FEN = new Chess().fen();
const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const CONCEPT_SET = new Set<string>(OPENING_CONCEPTS);

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
}

function uniqueId(value: string, seen: Set<string>, label: string): void {
  if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
  seen.add(value);
}

export function openingPositionKey(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) throw new Error(`Invalid FEN: ${fen}`);
  return fields.slice(0, 4).join(" ");
}

function sideToMove(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

function applyUci(chess: Chess, moveUci: string, label: string): { san: string; fen: string } {
  if (!UCI_MOVE.test(moveUci)) throw new Error(`${label} must use UCI notation`);
  try {
    const move = chess.move({
      from: moveUci.slice(0, 2),
      to: moveUci.slice(2, 4),
      ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
    });
    if (!move) throw new Error("move was rejected");
    return { san: move.san, fen: chess.fen() };
  } catch {
    throw new Error(`${label} is illegal in the authored position: ${moveUci}`);
  }
}

function validateExplanation(
  explanation: MoveExplanation,
  role: "learner" | "opponent",
  label: string,
): void {
  if (!explanation || typeof explanation !== "object") throw new Error(`${label} explanation is required`);
  nonEmpty(explanation.summary, `${label} explanation summary`);
  if (!Array.isArray(explanation.changes) || explanation.changes.length === 0) {
    throw new Error(`${label} must describe what the move changes`);
  }
  explanation.changes.forEach((change, index) => nonEmpty(change, `${label} change ${index + 1}`));
  if (!Array.isArray(explanation.concepts) || explanation.concepts.length === 0) {
    throw new Error(`${label} must include at least one concept`);
  }
  for (const concept of explanation.concepts) {
    if (!CONCEPT_SET.has(concept)) throw new Error(`${label} has unknown concept: ${concept}`);
  }
  if (role === "opponent") nonEmpty(explanation.opponentIdea, `${label} opponent idea`);
}

function annotationsMatch(left: MoveExplanation, right: MoveExplanation): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function compileOpeningCurriculum(curriculum: OpeningCurriculum): CompiledOpeningCurriculum {
  nonEmpty(curriculum.id, "Curriculum id");
  nonEmpty(curriculum.slug, "Curriculum slug");
  nonEmpty(curriculum.name, "Curriculum name");
  nonEmpty(curriculum.summary, "Curriculum summary");
  nonEmpty(curriculum.audienceLabel, "Curriculum audience");
  if (!Number.isInteger(curriculum.version) || curriculum.version < 1) {
    throw new Error("Curriculum version must be a positive integer");
  }
  if (curriculum.status !== "preview" && curriculum.status !== "published") {
    throw new Error("Curriculum status must be preview or published");
  }
  if (curriculum.learnerColor !== "white" && curriculum.learnerColor !== "black") {
    throw new Error("Curriculum learner color must be white or black");
  }
  if (!UCI_MOVE.test(curriculum.firstMoveUci)) throw new Error("Curriculum first move must use UCI notation");
  if (!Array.isArray(curriculum.style) || curriculum.style.length === 0) {
    throw new Error("Curriculum must describe at least one style");
  }
  curriculum.style.forEach((style, index) => nonEmpty(style, `Curriculum style ${index + 1}`));
  if (!(["low", "medium", "high"] as const).includes(curriculum.memoryBurden)) {
    throw new Error("Curriculum memory burden must be low, medium or high");
  }
  if (!Array.isArray(curriculum.chapters) || curriculum.chapters.length === 0) {
    throw new Error("Curriculum must contain at least one chapter");
  }
  if (!Array.isArray(curriculum.sources) || curriculum.sources.length === 0) {
    throw new Error("Curriculum must cite at least one source");
  }
  const sourceIds = new Set<string>();
  curriculum.sources.forEach((source, index) => {
    nonEmpty(source.id, `Source ${index + 1} id`);
    uniqueId(source.id, sourceIds, "source id");
    nonEmpty(source.title, `Source ${source.id} title`);
    if (!["authored", "dataset", "statistics"].includes(source.kind)) {
      throw new Error(`Source ${source.id} has an invalid kind`);
    }
    if (source.kind === "statistics" && !source.url) {
      throw new Error(`Statistics source ${source.id} must include a URL`);
    }
  });

  const positions = new Map<string, CompiledPosition>();
  const moves = new Map<string, CompiledMove>();
  const chapterIds = new Set<string>();
  let firstMoveSan: string | null = null;

  const putPosition = (fen: string): CompiledPosition => {
    const key = openingPositionKey(fen);
    const existing = positions.get(key);
    if (existing) return existing;
    const position = { id: stableId("op", key), key, fen, sideToMove: sideToMove(fen) };
    positions.set(key, position);
    return position;
  };

  const chapters = curriculum.chapters.map((chapter, chapterIndex): CompiledChapter => {
    nonEmpty(chapter.id, `Chapter ${chapterIndex + 1} id`);
    uniqueId(chapter.id, chapterIds, "chapter id");
    nonEmpty(chapter.title, `Chapter ${chapter.id} title`);
    nonEmpty(chapter.introduction, `Chapter ${chapter.id} introduction`);
    if (!Array.isArray(chapter.lines) || chapter.lines.length === 0) {
      throw new Error(`Chapter ${chapter.id} must contain at least one line`);
    }
    const rootFen = chapter.rootFen ?? STANDARD_START_FEN;
    try {
      new Chess(rootFen);
    } catch {
      throw new Error(`Chapter ${chapter.id} has an invalid root FEN`);
    }
    const root = putPosition(rootFen);
    const lineIds = new Set<string>();

    const lines = chapter.lines.map((line, lineIndex): CompiledLine => {
      nonEmpty(line.id, `Line ${lineIndex + 1} id`);
      uniqueId(line.id, lineIds, `line id in chapter ${chapter.id}`);
      nonEmpty(line.title, `Line ${line.id} title`);
      if (!Number.isInteger(line.priority) || line.priority < 1) {
        throw new Error(`Line ${line.id} priority must be a positive integer`);
      }
      if (!Array.isArray(line.moves) || line.moves.length === 0) {
        throw new Error(`Line ${line.id} must contain at least one move`);
      }
      if (line.moves[0]?.moveUci !== curriculum.firstMoveUci && rootFen === STANDARD_START_FEN) {
        throw new Error(`Line ${line.id} does not begin with ${curriculum.firstMoveUci}`);
      }

      const chess = new Chess(rootFen);
      const moveIds: string[] = [];
      const positionIds = [root.id];
      let learnerDecisions = 0;
      line.moves.forEach((authoredMove, moveIndex) => {
        const label = `${curriculum.slug}/${chapter.id}/${line.id} ply ${moveIndex + 1}`;
        const from = putPosition(chess.fen());
        const role = from.sideToMove === curriculum.learnerColor ? "learner" : "opponent";
        if (role === "learner") learnerDecisions += 1;
        validateExplanation(authoredMove.explanation, role, label);
        if (authoredMove.kind !== undefined && authoredMove.kind !== "primary" && authoredMove.kind !== "alternative") {
          throw new Error(`${label} has an invalid move kind`);
        }
        if (role === "opponent" && authoredMove.kind !== undefined) {
          throw new Error(`${label} cannot assign a learner move kind to an opponent reply`);
        }
        if (authoredMove.frequency !== undefined
          && (!Number.isFinite(authoredMove.frequency) || authoredMove.frequency < 0 || authoredMove.frequency > 1)) {
          throw new Error(`${label} frequency must be between 0 and 1`);
        }
        const applied = applyUci(chess, authoredMove.moveUci, label);
        const to = putPosition(applied.fen);
        const moveId = stableId("om", `${curriculum.id}|${from.key}|${authoredMove.moveUci}`);
        const existing = moves.get(moveId);
        if (existing && !annotationsMatch(existing.explanation, authoredMove.explanation)) {
          throw new Error(`${label} repeats a position move with conflicting explanations`);
        }
        const kind = role === "opponent" ? "response" : (authoredMove.kind ?? "primary");
        if (existing && (existing.kind !== kind || existing.frequency !== authoredMove.frequency)) {
          throw new Error(`${label} repeats a position move with conflicting metadata`);
        }
        if (!existing) {
          moves.set(moveId, {
            ...authoredMove,
            id: moveId,
            fromPositionId: from.id,
            toPositionId: to.id,
            san: applied.san,
            role,
            kind,
          });
        }
        if (moveIndex === 0 && rootFen === STANDARD_START_FEN) firstMoveSan ??= applied.san;
        moveIds.push(moveId);
        positionIds.push(to.id);
      });

      if (learnerDecisions === 0) throw new Error(`Line ${line.id} must contain at least one learner decision`);

      return {
        id: `${curriculum.id}:${chapter.id}:${line.id}`,
        slug: line.id,
        title: line.title,
        priority: line.priority,
        moveIds,
        positionIds,
      };
    });

    return {
      id: `${curriculum.id}:${chapter.id}`,
      slug: chapter.id,
      title: chapter.title,
      introduction: chapter.introduction,
      rootPositionId: root.id,
      lines,
    };
  });

  if (!firstMoveSan) throw new Error("Curriculum does not contain a line from the standard starting position");
  if (![...moves.values()].some((move) => move.role === "learner")) {
    throw new Error("Curriculum must contain at least one learner decision");
  }

  return {
    curriculum,
    firstMoveSan,
    positions: [...positions.values()],
    moves: [...moves.values()],
    chapters,
  };
}
