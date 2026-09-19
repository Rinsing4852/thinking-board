import type {
  OpeningImportColor,
  OpeningImportResponse,
  OpeningLichessStudyPreviewResponse,
} from "../../../../packages/contracts/src/api.js";
import { OpeningPgnImportService } from "./opening-pgn-import.js";

const MAX_STUDY_BYTES = 5 * 1024 * 1024;
const STUDY_PATH = /^\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?\/?$/;

export interface LichessStudyReference {
  studyId: string;
  chapterId: string | null;
  canonicalUrl: string;
  exportUrl: string;
}

interface LichessImportInput {
  studyUrl: string;
  learnerColor: OpeningImportColor;
  name?: string | undefined;
  selectedChapterIndexes?: number[] | undefined;
  ownershipConfirmed?: boolean | undefined;
}

export function resolveLichessStudyUrl(value: string): LichessStudyReference {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a complete Lichess Study URL, for example https://lichess.org/study/abcdefgh");
  }
  if (url.protocol !== "https:" || !["lichess.org", "www.lichess.org"].includes(url.hostname.toLowerCase())) {
    throw new Error("Only secure lichess.org Study links can be imported");
  }
  const match = STUDY_PATH.exec(url.pathname);
  if (!match) throw new Error("This does not look like a Lichess Study or chapter link");
  const studyId = match[1]!;
  const chapterId = match[2] ?? null;
  const canonicalUrl = `https://lichess.org/study/${studyId}${chapterId ? `/${chapterId}` : ""}`;
  const exportUrl = `https://lichess.org/api/study/${studyId}${chapterId ? `/${chapterId}` : ""}.pgn?comments=true&variations=true&clocks=false`;
  return { studyId, chapterId, canonicalUrl, exportUrl };
}

export class OpeningLichessImportService {
  constructor(
    private readonly openingImports: OpeningPgnImportService,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async preview(input: LichessImportInput): Promise<OpeningLichessStudyPreviewResponse> {
    const reference = resolveLichessStudyUrl(input.studyUrl);
    const pgn = await this.download(reference);
    const preview = this.openingImports.previewStudy({
      pgn,
      learnerColor: input.learnerColor,
      name: input.name,
      sourceType: "lichess_study",
      sourceTitle: `Lichess Study ${reference.studyId}`,
    });
    return {
      ...preview,
      studyId: reference.studyId,
      chapterId: reference.chapterId,
      studyUrl: reference.canonicalUrl,
      warnings: [
        ...preview.warnings,
        reference.chapterId
          ? "This link points to one chapter. Only that chapter will be imported."
          : "Choose the chapters you want before importing the study.",
      ],
    };
  }

  async import(input: LichessImportInput): Promise<OpeningImportResponse> {
    if (input.ownershipConfirmed !== true) {
      throw new Error("Confirm that you own or have permission to use this study before importing it");
    }
    const reference = resolveLichessStudyUrl(input.studyUrl);
    const pgn = await this.download(reference);
    return this.openingImports.import({
      pgn,
      learnerColor: input.learnerColor,
      name: input.name,
      sourceType: "lichess_study",
      sourceTitle: reference.canonicalUrl,
      selectedChapterIndexes: input.selectedChapterIndexes,
      ownershipConfirmed: true,
    });
  }

  private async download(reference: LichessStudyReference): Promise<string> {
    const response = await this.fetcher(reference.exportUrl, {
      headers: { Accept: "application/x-chess-pgn" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error("Lichess could not find that public study or chapter");
      throw new Error(`Lichess Study download failed with status ${response.status}`);
    }
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_STUDY_BYTES) throw new Error("That study is larger than the 5 MB import limit");
    const pgn = await response.text();
    if (Buffer.byteLength(pgn, "utf8") > MAX_STUDY_BYTES) throw new Error("That study is larger than the 5 MB import limit");
    if (!pgn.trim()) throw new Error("Lichess returned an empty study");
    return pgn;
  }
}
