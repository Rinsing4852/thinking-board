import { describe, expect, it, vi } from "vitest";

import type { OpeningImportPreviewResponse, OpeningImportResponse } from "../../../../packages/contracts/src/api.js";
import { OpeningLichessImportService, resolveLichessStudyUrl } from "./opening-lichess-import.js";
import type { OpeningPgnImportService } from "./opening-pgn-import.js";

const STUDY_PGN = `[Event "Private study"]
[Result "*"]

1. e4 e5 2. Nf3 *`;

const PREVIEW: OpeningImportPreviewResponse = {
  suggestedName: "Private study",
  learnerColors: ["white"],
  firstMoveSan: "e4",
  chapterCount: 1,
  lineCount: 1,
  learnerDecisionCount: 2,
  explainedDecisionCount: 0,
  missingExplanationCount: 2,
  chapters: [{ sourceIndex: 0, title: "Private study", lineCount: 1, maximumPly: 3, importable: true }],
  warnings: [],
};

const IMPORTED: OpeningImportResponse = {
  repertoireIds: ["private-repertoire"],
  imported: 1,
  duplicates: 0,
  message: "1 private repertoire imported and ready to practise.",
};

function openingImports(overrides: Partial<OpeningPgnImportService> = {}): OpeningPgnImportService {
  return {
    previewStudy: vi.fn(() => PREVIEW),
    import: vi.fn(() => IMPORTED),
    ...overrides,
  } as unknown as OpeningPgnImportService;
}

function pgnResponse(status = 200): Response {
  return new Response(status === 200 ? STUDY_PGN : "", {
    status,
    headers: { "content-type": "application/x-chess-pgn" },
  });
}

describe("Lichess Study import URL", () => {
  it("resolves a complete public study to the official PGN export endpoint", () => {
    expect(resolveLichessStudyUrl("https://lichess.org/study/abcdefgh")).toEqual({
      studyId: "abcdefgh",
      chapterId: null,
      canonicalUrl: "https://lichess.org/study/abcdefgh",
      exportUrl: "https://lichess.org/api/study/abcdefgh.pgn?comments=true&variations=true&clocks=false",
    });
  });

  it("preserves a selected chapter", () => {
    expect(resolveLichessStudyUrl("https://lichess.org/study/abcdefgh/ABCDEFGH?ignored=true")).toMatchObject({
      studyId: "abcdefgh",
      chapterId: "ABCDEFGH",
      canonicalUrl: "https://lichess.org/study/abcdefgh/ABCDEFGH",
      exportUrl: "https://lichess.org/api/study/abcdefgh/ABCDEFGH.pgn?comments=true&variations=true&clocks=false",
    });
  });

  it("rejects non-Lichess and malformed URLs before making a request", () => {
    expect(() => resolveLichessStudyUrl("https://example.com/study/abcdefgh")).toThrow(/only secure lichess\.org/i);
    expect(() => resolveLichessStudyUrl("https://lichess.org/@/player")).toThrow(/does not look like/i);
    expect(() => resolveLichessStudyUrl("not-a-url")).toThrow(/complete Lichess Study URL/i);
  });
});

describe("Lichess Study downloads", () => {
  it("authenticates a private full-study preview with the configured study token", async () => {
    const imports = openingImports();
    const fetcher = vi.fn(async () => pgnResponse());
    const service = new OpeningLichessImportService(imports, "private-token", fetcher as unknown as typeof fetch);

    const result = await service.preview({
      studyUrl: "https://lichess.org/study/abcdefgh",
      learnerColor: "white",
    });

    expect(result).toMatchObject({ studyId: "abcdefgh", chapterId: null, chapterCount: 1 });
    expect(fetcher).toHaveBeenCalledWith(
      "https://lichess.org/api/study/abcdefgh.pgn?comments=true&variations=true&clocks=false",
      expect.objectContaining({
        headers: {
          Accept: "application/x-chess-pgn",
          Authorization: "Bearer private-token",
        },
      }),
    );
    expect(imports.previewStudy).toHaveBeenCalledWith(expect.objectContaining({
      pgn: STUDY_PGN,
      learnerColor: "white",
      sourceType: "lichess_study",
    }));
  });

  it("authenticates a selected chapter import and preserves chapter selection", async () => {
    const imports = openingImports();
    const fetcher = vi.fn(async () => pgnResponse());
    const service = new OpeningLichessImportService(imports, "private-token", fetcher as unknown as typeof fetch);

    await expect(service.import({
      studyUrl: "https://lichess.org/study/abcdefgh/ABCDEFGH",
      learnerColor: "black",
      selectedChapterIndexes: [0],
      ownershipConfirmed: true,
    })).resolves.toEqual(IMPORTED);

    expect(fetcher).toHaveBeenCalledWith(
      "https://lichess.org/api/study/abcdefgh/ABCDEFGH.pgn?comments=true&variations=true&clocks=false",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer private-token" }) }),
    );
    expect(imports.import).toHaveBeenCalledWith(expect.objectContaining({
      pgn: STUDY_PGN,
      learnerColor: "black",
      selectedChapterIndexes: [0],
      ownershipConfirmed: true,
    }));
  });

  it("keeps public study imports unauthenticated when no token is configured", async () => {
    const fetcher = vi.fn(async () => pgnResponse());
    const service = new OpeningLichessImportService(openingImports(), undefined, fetcher as unknown as typeof fetch);

    await service.preview({ studyUrl: "https://lichess.org/study/abcdefgh", learnerColor: "white" });

    expect(fetcher).toHaveBeenCalledWith(
      "https://lichess.org/api/study/abcdefgh.pgn?comments=true&variations=true&clocks=false",
      expect.objectContaining({ headers: { Accept: "application/x-chess-pgn" } }),
    );
  });

  it("explains missing study:read access without exposing the token", async () => {
    const fetcher = vi.fn(async () => pgnResponse(403));
    const service = new OpeningLichessImportService(openingImports(), "do-not-expose", fetcher as unknown as typeof fetch);

    const request = service.preview({ studyUrl: "https://lichess.org/study/abcdefgh", learnerColor: "white" });
    await expect(request).rejects.toThrow(/study:read/);
    await expect(request).rejects.not.toThrow(/do-not-expose/);
  });

  it("guides private-study users when an unauthenticated export is hidden", async () => {
    const fetcher = vi.fn(async () => pgnResponse(404));
    const service = new OpeningLichessImportService(openingImports(), undefined, fetcher as unknown as typeof fetch);

    await expect(service.preview({ studyUrl: "https://lichess.org/study/abcdefgh", learnerColor: "white" }))
      .rejects.toThrow(/private or unlisted.*LICHESS_API_TOKEN.*study:read/i);
  });
});
