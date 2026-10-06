import { useState } from "react";
import type { OpeningImportColor, OpeningImportPreviewResponse, OpeningImportResponse, OpeningImportSourceType } from "../../../../packages/contracts/src/api";
import { post } from "../api";

/** Import form owns its own state; the catalogue only refreshes after a successful import. */
export function OpeningImporter({ onImported }: { onImported: () => Promise<void> }) {
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
      setImportMessage(result.message);
      setImportPreview(null);
      setImportPgn("");
      setLichessStudyUrl("");
      setSelectedChapterIndexes([]);
      setImportPermission(false);
      try { await onImported(); }
      catch { setImportError("Your repertoire was imported, but the list could not refresh. Reload the page to see it; do not import it again."); }
    } catch (importFailure) {
      setImportError(importFailure instanceof Error ? importFailure.message : "Could not import opening PGN");
    } finally {
      setImportSubmitting(false);
    }
  };

  return (
            <div className="panel opening-importer">
              <div className="opening-importer-heading">
                <div>
                  <span className="eyebrow">Private import</span>
                  <h3>Import repertoire lines</h3>
                </div>
                <p>Paste opening lines from your own PGN or import a Lichess Study. This is for preparation—not a played game you want analysed.</p>
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
                  <small>Public studies work without a token. Private studies use the server's study:read token. A chapter link imports only that chapter.</small>
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
  );
}
