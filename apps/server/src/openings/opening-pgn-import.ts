import { createHash } from "node:crypto";

import { Chess } from "chess.js";

import type {
  Color,
  OpeningImportColor,
  OpeningImportPreviewResponse,
  OpeningImportResponse,
  OpeningImportSourceType,
} from "../../../../packages/contracts/src/api.js";
import { splitPgnGames } from "../chess/pgn.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import {
  compileOpeningCurriculum,
  openingPositionKey,
  type AuthoredOpeningMove,
  type MoveExplanation,
  type OpeningCurriculum,
} from "./opening-content.js";
import { OpeningContentService } from "./opening-content-service.js";

interface ImportMove {
  uci: string;
  san: string;
  fenBefore: string;
  comment: string | null;
}

interface ImportLine {
  title: string;
  moves: ImportMove[];
}

interface ImportChapter {
  title: string;
  introduction: string;
  lines: ImportLine[];
}

interface ParsedOpeningPgn {
  suggestedName: string;
  firstMoveUci: string;
  firstMoveSan: string;
  fingerprint: string;
  chapters: ImportChapter[];
}

interface PrepareInput {
  pgn: string;
  learnerColor: OpeningImportColor;
  name?: string | undefined;
  sourceTitle?: string | undefined;
  sourceAuthor?: string | undefined;
  sourceType?: OpeningImportSourceType | undefined;
  selectedChapterIndexes?: number[] | undefined;
}

interface PreparedImport {
  parsed: ParsedOpeningPgn;
  curricula: OpeningCurriculum[];
  requestedName: string;
  sourceTitle: string;
  sourceAuthor: string | null;
  sourceType: OpeningImportSourceType;
}

type PgnToken =
  | { kind: "move"; value: string }
  | { kind: "comment"; value: string }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "result" };

const STANDARD_FEN = new Chess().fen();
const RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);
const SOURCE_TYPES = new Set<OpeningImportSourceType>([
  "self_authored",
  "book_notes",
  "lichess_study",
  "licensed_pgn",
]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cleanText(value: string | undefined, fallback: string, maxLength = 160): string {
  const cleaned = value?.trim().replace(/\s+/g, " ") ?? "";
  return (cleaned || fallback).slice(0, maxLength);
}

function slugPart(value: string): string {
  return value.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "opening";
}

function parseHeaders(chunk: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const match of chunk.matchAll(/^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\]\s*$/gm)) {
    headers[match[1]!] = match[2]!.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  }
  return headers;
}

function movetext(chunk: string): string {
  return chunk.replace(/^\s*\[[^\n]*\]\s*$/gm, " ");
}

function tokenizePgn(value: string): PgnToken[] {
  const tokens: PgnToken[] = [];
  let index = 0;
  while (index < value.length) {
    const char = value[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "{") {
      const end = value.indexOf("}", index + 1);
      if (end < 0) throw new Error("A PGN comment is missing its closing }");
      const comment = value.slice(index + 1, end).trim().replace(/\s+/g, " ");
      if (comment) tokens.push({ kind: "comment", value: comment });
      index = end + 1;
      continue;
    }
    if (char === ";") {
      const end = value.indexOf("\n", index + 1);
      const stop = end < 0 ? value.length : end;
      const comment = value.slice(index + 1, stop).trim().replace(/\s+/g, " ");
      if (comment) tokens.push({ kind: "comment", value: comment });
      index = stop;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "open" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "close" });
      index += 1;
      continue;
    }

    let end = index;
    while (end < value.length && !/[\s{}();]/.test(value[end]!)) end += 1;
    let token = value.slice(index, end);
    index = end;
    token = token.replace(/^\d+\.(?:\.\.)?/, "");
    if (!token || /^\d+\.{1,3}$/.test(token) || /^\$\d+$/.test(token) || token === "e.p.") continue;
    if (RESULTS.has(token)) {
      tokens.push({ kind: "result" });
      continue;
    }
    token = token.replace(/[!?]+$/g, "");
    if (token) tokens.push({ kind: "move", value: token });
  }
  return tokens;
}

function moveUci(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function cloneMoves(moves: ImportMove[]): ImportMove[] {
  return moves.map((move) => ({ ...move }));
}

function parseLines(chunk: string): ImportLine[] {
  const tokens = tokenizePgn(movetext(chunk));
  let cursor = 0;

  const readSequence = (startFen: string, baseMoves: ImportMove[], nested: boolean): ImportMove[][] => {
    const chess = new Chess(startFen);
    const localMoves: ImportMove[] = [];
    const variations: ImportMove[][] = [];
    let pendingComment: string | null = null;

    while (cursor < tokens.length) {
      const token = tokens[cursor]!;
      if (token.kind === "close") {
        if (!nested) throw new Error("PGN has an unexpected closing parenthesis");
        cursor += 1;
        break;
      }
      if (token.kind === "open") {
        if (localMoves.length === 0) throw new Error("A PGN variation has no preceding move");
        cursor += 1;
        const previous = localMoves[localMoves.length - 1]!;
        const variationBase = [...cloneMoves(baseMoves), ...cloneMoves(localMoves.slice(0, -1))];
        variations.push(...readSequence(previous.fenBefore, variationBase, true));
        continue;
      }
      if (token.kind === "comment") {
        const previous = localMoves[localMoves.length - 1];
        if (previous) previous.comment = previous.comment ? `${previous.comment} ${token.value}` : token.value;
        else pendingComment = pendingComment ? `${pendingComment} ${token.value}` : token.value;
        cursor += 1;
        continue;
      }
      if (token.kind === "result") {
        cursor += 1;
        if (nested) throw new Error("A game result appeared inside a variation");
        break;
      }

      const fenBefore = chess.fen();
      let applied;
      try {
        applied = chess.move(token.value, { strict: false });
      } catch {
        throw new Error(`Illegal or unsupported move "${token.value}" at ply ${baseMoves.length + localMoves.length + 1}`);
      }
      if (!applied) throw new Error(`Illegal move "${token.value}"`);
      localMoves.push({
        uci: moveUci(applied),
        san: applied.san,
        fenBefore,
        comment: pendingComment,
      });
      pendingComment = null;
      cursor += 1;
    }

    if (nested && cursor >= tokens.length && tokens[tokens.length - 1]?.kind !== "close") {
      throw new Error("A PGN variation is missing its closing parenthesis");
    }
    const main = [...cloneMoves(baseMoves), ...cloneMoves(localMoves)];
    return main.length > 0 ? [main, ...variations] : variations;
  };

  const parsed = readSequence(STANDARD_FEN, [], false);
  if (cursor < tokens.length) throw new Error("PGN contains moves after the game result");
  const seen = new Set<string>();
  return parsed
    .filter((line) => {
      const key = line.map((move) => move.uci).join(" ");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((moves, index) => ({ title: index === 0 ? "Main line" : `Variation ${index + 1}`, moves }));
}

export function parseOpeningPgn(pgn: string, selectedChapterIndexes?: number[]): ParsedOpeningPgn {
  const allChunks = splitPgnGames(pgn);
  if (allChunks.length === 0) throw new Error("Paste at least one PGN line to preview");
  const indexes = selectedChapterIndexes === undefined
    ? allChunks.map((_, index) => index)
    : [...new Set(selectedChapterIndexes)];
  if (indexes.length === 0) throw new Error("Choose at least one study chapter to import");
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= allChunks.length)) {
    throw new Error("One of the selected study chapters is not available");
  }
  const chunks = indexes.map((index) => allChunks[index]!);

  const chapters: ImportChapter[] = chunks.map((chunk, index) => {
    const headers = parseHeaders(chunk);
    if (headers.SetUp === "1" || headers.FEN) {
      throw new Error(`Chapter ${index + 1} starts from a custom position. Opening imports currently require the normal starting position.`);
    }
    const lines = parseLines(chunk);
    if (lines.length === 0) throw new Error(`Chapter ${index + 1} contains no moves`);
    if (headers.Variation) lines[0]!.title = cleanText(headers.Variation, "Main line");
    return {
      title: cleanText(headers.Chapter ?? headers.Opening ?? headers.Event, `Chapter ${index + 1}`),
      introduction: cleanText(headers.Description, "A private repertoire chapter imported from PGN."),
      lines,
    };
  });

  const allLines = chapters.flatMap((chapter) => chapter.lines);
  const first = allLines[0]?.moves[0];
  if (!first) throw new Error("The PGN contains no opening moves");
  const differentFirstMove = allLines.find((line) => line.moves[0]?.uci !== first.uci);
  if (differentFirstMove) {
    throw new Error(`This import mixes different first moves. Put ${first.san} lines and ${differentFirstMove.moves[0]?.san ?? "other first-move"} lines in separate repertoires.`);
  }
  const canonical = chapters.map((chapter) => ({
    title: chapter.title,
    lines: chapter.lines.map((line) => line.moves.map((move) => move.uci)),
  }));
  const firstHeaders = parseHeaders(chunks[0]!);
  return {
    suggestedName: cleanText(firstHeaders.Repertoire ?? firstHeaders.Opening ?? firstHeaders.Event, `${first.san} personal repertoire`),
    firstMoveUci: first.uci,
    firstMoveSan: first.san,
    fingerprint: sha256(JSON.stringify(canonical)),
    chapters,
  };
}

function explanationFor(move: ImportMove, learnerColor: Color, preferredComment: string | null): MoveExplanation {
  const mover: Color = move.fenBefore.split(" ")[1] === "b" ? "black" : "white";
  const isLearner = mover === learnerColor;
  if (preferredComment) {
    return {
      summary: preferredComment,
      changes: [`Your imported note is attached to ${move.san}.`],
      concepts: ["imported_note"],
      ...(!isLearner ? { opponentIdea: preferredComment } : {}),
      ...(isLearner ? { resultingPlan: "Use your note as the starting point, then add your own plan as you refine this repertoire." } : {}),
    };
  }
  return {
    summary: isLearner
      ? `No explanation has been added for ${move.san} yet.`
      : `${move.san} is an opponent response from the imported PGN.`,
    changes: [`The imported repertoire continues with ${move.san}.`],
    concepts: ["missing_explanation"],
    ...(!isLearner ? { opponentIdea: "This response is included in the imported line, but its idea has not been explained yet." } : {}),
    ...(isLearner ? { resultingPlan: "Return to your source and add the reason for this move in your own words." } : {}),
  };
}

function buildCurriculum(
  parsed: ParsedOpeningPgn,
  color: Color,
  requestedName: string,
  sourceTitle: string,
  sourceAuthor: string | null,
  includeColorSuffix: boolean,
): OpeningCurriculum {
  const shortHash = parsed.fingerprint.slice(0, 16);
  const annotationByMove = new Map<string, string>();
  for (const chapter of parsed.chapters) {
    for (const line of chapter.lines) {
      for (const move of line.moves) {
        if (!move.comment) continue;
        const key = `${openingPositionKey(move.fenBefore)}|${move.uci}`;
        if (!annotationByMove.has(key)) annotationByMove.set(key, move.comment);
      }
    }
  }
  const name = includeColorSuffix ? `${requestedName} — ${color === "white" ? "White" : "Black"}` : requestedName;
  return {
    id: `repertoire.imported.${shortHash}.${color}`,
    slug: `import-${shortHash}-${color}`,
    version: 1,
    status: "published",
    name,
    learnerColor: color,
    firstMoveUci: parsed.firstMoveUci,
    summary: `A private repertoire imported from ${sourceTitle}. Practise every included branch and add explanations in your own words.`,
    audienceLabel: "Personal repertoire",
    style: ["imported", "private"],
    memoryBurden: "medium",
    chapters: parsed.chapters.map((chapter, chapterIndex) => ({
      id: `${slugPart(chapter.title)}-${chapterIndex + 1}`,
      title: chapter.title,
      introduction: chapter.introduction,
      lines: chapter.lines.map((line, lineIndex) => ({
        id: `line-${lineIndex + 1}`,
        title: line.title,
        priority: lineIndex + 1,
        moves: line.moves.map((move): AuthoredOpeningMove => ({
          moveUci: move.uci,
          explanation: explanationFor(
            move,
            color,
            annotationByMove.get(`${openingPositionKey(move.fenBefore)}|${move.uci}`) ?? null,
          ),
        })),
      })),
    })),
    sources: [{
      id: "private-import",
      kind: "authored",
      title: sourceAuthor ? `${sourceTitle} — personal notes based on ${sourceAuthor}` : `${sourceTitle} — personal notes`,
    }],
  };
}

export class OpeningPgnImportService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly content: OpeningContentService,
  ) {}

  preview(input: PrepareInput): OpeningImportPreviewResponse {
    const prepared = this.prepare(input);
    const compiled = prepared.curricula.map(compileOpeningCurriculum);
    const learnerMoves = compiled.flatMap((item) => item.moves.filter((move) => move.role === "learner"));
    const explained = learnerMoves.filter((move) => move.explanation.concepts[0] === "imported_note").length;
    const lines = prepared.parsed.chapters.flatMap((chapter) => chapter.lines);
    const warnings: string[] = [];
    if (learnerMoves.length - explained > 0) {
      const missing = learnerMoves.length - explained;
      warnings.push(`${missing} training move${missing === 1 ? " does" : "s do"} not have a written explanation yet. ${missing === 1 ? "It" : "They"} will be labelled clearly during practice.`);
    }
    if (lines.length > prepared.parsed.chapters.length) {
      warnings.push("PGN variations were detected and will be imported as separate practice lines.");
    }
    warnings.push("Imported material stays private on this installation. Only import material you own or have permission to use.");
    return {
      suggestedName: prepared.requestedName,
      learnerColors: prepared.curricula.map((curriculum) => curriculum.learnerColor),
      firstMoveSan: prepared.parsed.firstMoveSan,
      chapterCount: prepared.parsed.chapters.length,
      lineCount: lines.length,
      learnerDecisionCount: learnerMoves.length,
      explainedDecisionCount: explained,
      missingExplanationCount: learnerMoves.length - explained,
      chapters: prepared.parsed.chapters.map((chapter, sourceIndex) => ({
        sourceIndex,
        title: chapter.title,
        lineCount: chapter.lines.length,
        maximumPly: Math.max(...chapter.lines.map((line) => line.moves.length)),
        importable: true,
      })),
      warnings,
    };
  }

  previewStudy(input: PrepareInput): OpeningImportPreviewResponse {
    const chunks = splitPgnGames(input.pgn);
    if (chunks.length === 0) throw new Error("The Lichess Study contains no PGN chapters");
    const skipped: number[] = [];
    const chapterPreviews = chunks.flatMap((chunk, sourceIndex) => {
      try {
        return [{ sourceIndex, preview: this.preview({ ...input, pgn: chunk }) }];
      } catch (error) {
        if (error instanceof Error && /contains no moves/i.test(error.message)) {
          skipped.push(sourceIndex);
          return [];
        }
        throw error;
      }
    });
    if (chapterPreviews.length === 0) throw new Error("This Lichess Study has no chapters containing opening moves");
    const learnerDecisionCount = chapterPreviews.reduce((sum, { preview }) => sum + preview.learnerDecisionCount, 0);
    const explainedDecisionCount = chapterPreviews.reduce((sum, { preview }) => sum + preview.explainedDecisionCount, 0);
    const lineCount = chapterPreviews.reduce((sum, { preview }) => sum + preview.lineCount, 0);
    const warnings: string[] = [];
    const missingExplanationCount = learnerDecisionCount - explainedDecisionCount;
    if (missingExplanationCount > 0) {
      warnings.push(`${missingExplanationCount} training move${missingExplanationCount === 1 ? " does" : "s do"} not have a written explanation yet. ${missingExplanationCount === 1 ? "It" : "They"} will be labelled clearly during practice.`);
    }
    if (lineCount > chapterPreviews.length) warnings.push("PGN variations were detected and will be imported as separate practice lines.");
    warnings.push("Imported material stays private on this installation. Only import material you own or have permission to use.");
    if (skipped.length > 0) warnings.unshift(`${skipped.length} chapter${skipped.length === 1 ? "" : "s"} without moves will be skipped.`);
    if (new Set(chapterPreviews.map(({ preview }) => preview.firstMoveSan)).size > 1) {
      warnings.unshift("This study contains different first moves. Select chapters from one opening for each import.");
    }
    return {
      suggestedName: input.name?.trim() || chapterPreviews[0]!.preview.suggestedName,
      learnerColors: chapterPreviews[0]!.preview.learnerColors,
      firstMoveSan: new Set(chapterPreviews.map(({ preview }) => preview.firstMoveSan)).size === 1
        ? chapterPreviews[0]!.preview.firstMoveSan
        : "Multiple",
      chapterCount: chapterPreviews.reduce((sum, { preview }) => sum + preview.chapterCount, 0),
      lineCount,
      learnerDecisionCount,
      explainedDecisionCount,
      missingExplanationCount,
      chapters: chapterPreviews.flatMap(({ preview, sourceIndex }) => preview.chapters.map((chapter) => ({
        ...chapter,
        sourceIndex,
      }))),
      warnings,
    };
  }

  import(input: PrepareInput & { ownershipConfirmed: boolean }): OpeningImportResponse {
    if (input.ownershipConfirmed !== true) {
      throw new Error("Confirm that you own or have permission to use this material before importing it");
    }
    const prepared = this.prepare(input);
    const repertoireIds: string[] = [];
    let imported = 0;
    let duplicates = 0;
    for (const curriculum of prepared.curricula) {
      const duplicate = this.db.prepare(`
        SELECT repertoire_id FROM opening_imports
        WHERE fingerprint = ? AND learner_color = ?
      `).pluck().get(prepared.parsed.fingerprint, curriculum.learnerColor) as string | undefined;
      if (duplicate) {
        repertoireIds.push(duplicate);
        duplicates += 1;
        continue;
      }
      this.content.sync([curriculum]);
      this.db.prepare(`
        INSERT INTO opening_imports(
          id, repertoire_id, fingerprint, learner_color, source_type, source_title,
          source_author, original_pgn, visibility, ownership_confirmed, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'private', 1, ?)
      `).run(
        id(),
        curriculum.id,
        prepared.parsed.fingerprint,
        curriculum.learnerColor,
        prepared.sourceType,
        prepared.sourceTitle,
        prepared.sourceAuthor,
        input.pgn,
        now(),
      );
      repertoireIds.push(curriculum.id);
      imported += 1;
    }
    return {
      repertoireIds,
      imported,
      duplicates,
      message: imported > 0
        ? `${imported} private repertoire${imported === 1 ? "" : "s"} imported and ready to practise.`
        : "That repertoire is already in your private opening catalogue.",
    };
  }

  private prepare(input: PrepareInput): PreparedImport {
    if (typeof input.pgn !== "string" || !input.pgn.trim()) throw new Error("PGN is required");
    if (input.pgn.length > 5 * 1024 * 1024) throw new Error("Opening PGN must be smaller than 5 MB");
    if (!(["white", "black", "both"] as const).includes(input.learnerColor)) {
      throw new Error("Choose White, Black or both sides");
    }
    const sourceType = input.sourceType ?? "self_authored";
    if (!SOURCE_TYPES.has(sourceType)) throw new Error("Choose a valid source type");
    const parsed = parseOpeningPgn(input.pgn, input.selectedChapterIndexes);
    const requestedName = cleanText(input.name, parsed.suggestedName, 120);
    const sourceTitle = cleanText(input.sourceTitle, "Personal PGN", 160);
    const sourceAuthor = input.sourceAuthor?.trim() ? cleanText(input.sourceAuthor, "", 120) : null;
    const colors: Color[] = input.learnerColor === "both" ? ["white", "black"] : [input.learnerColor];
    const curricula = colors.map((color) => buildCurriculum(
      parsed,
      color,
      requestedName,
      sourceTitle,
      sourceAuthor,
      colors.length > 1,
    ));
    return { parsed, curricula, requestedName, sourceTitle, sourceAuthor, sourceType };
  }
}
