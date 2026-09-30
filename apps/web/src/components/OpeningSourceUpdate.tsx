import { useRef, useState } from "react";
import type { OpeningRepertoireSummary, OpeningUpdatePreviewResponse, OpeningUpdateResponse } from "../../../../packages/contracts/src/api";
import { post } from "../api";

export function OpeningSourceUpdate({ repertoire, onUpdated }: {
  repertoire: OpeningRepertoireSummary;
  onUpdated: () => Promise<void>;
}) {
  const savedUrl = repertoire.sourceTitle?.startsWith("https://lichess.org/study/") ? repertoire.sourceTitle : "";
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"lichess" | "pgn">(savedUrl ? "lichess" : "pgn");
  const [studyUrl, setStudyUrl] = useState(savedUrl);
  const [pgn, setPgn] = useState("");
  const [preview, setPreview] = useState<OpeningUpdatePreviewResponse | null>(null);
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const base = `/api/v1/openings/repertoires/${repertoire.id}/updates`;

  const invalidate = () => { setPreview(null); setPermission(false); setError(""); setMessage(""); };
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not update this repertoire"); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return <div className="opening-source-update">
    <button className="secondary" aria-expanded={open} disabled={busy} onClick={() => { setOpen(!open); invalidate(); }}>
      {open ? "Close source update" : "Update from source"}
    </button>
    {repertoire.sourceUpdatedAt && <small>Last source update: {new Date(repertoire.sourceUpdatedAt).toLocaleString()}</small>}
    {open && <div className="opening-source-update-form">
      <h4>Update this repertoire</h4>
      <p>Refresh your lines and source explanations without starting your learning again.</p>
      <label>Update using
        <select value={mode} disabled={busy} onChange={event => { setMode(event.target.value as "lichess" | "pgn"); invalidate(); }}>
          <option value="lichess">Lichess Study link</option>
          <option value="pgn">Pasted opening PGN</option>
        </select>
      </label>
      {mode === "lichess" ? <label>Lichess Study or chapter link
        <input type="url" value={studyUrl} disabled={busy} placeholder="https://lichess.org/study/…" onChange={event => { setStudyUrl(event.target.value); invalidate(); }} />
      </label> : <label>Updated opening PGN
        <textarea rows={8} value={pgn} disabled={busy} placeholder="Paste the chapter PGN here, including its variations and comments." onChange={event => { setPgn(event.target.value); invalidate(); }} />
      </label>}
      {!preview && <button disabled={busy || !(mode === "lichess" ? studyUrl.trim() : pgn.trim())} onClick={() => void run(async () => {
        setPreview(await post<OpeningUpdatePreviewResponse>(`${base}/preview`, mode === "lichess" ? { studyUrl } : { pgn }));
      })}>{busy ? "Checking source…" : "Preview update"}</button>}
      {preview && <div className="opening-update-preview" aria-label="Source update preview">
        <h4>What will change</h4>
        <ul>
          <li>{preview.addedLines} new line{preview.addedLines === 1 ? "" : "s"}</li>
          <li>{preview.extendedLines} existing line{preview.extendedLines === 1 ? "" : "s"} extended</li>
          <li>{preview.addedMoves} new move{preview.addedMoves === 1 ? "" : "s"}</li>
          <li>{preview.updatedNotes} source note{preview.updatedNotes === 1 ? "" : "s"} refreshed</li>
          <li>{preview.retainedLines} other line{preview.retainedLines === 1 ? "" : "s"} kept unchanged</li>
        </ul>
        <details><summary>Chapters in this update</summary><ul>{preview.chapters.map((chapter, index) => <li key={index}>{chapter.title} · {chapter.lineCount} lines</li>)}</ul></details>
        <ul className="opening-import-warnings">{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        <label className="opening-permission"><input type="checkbox" checked={permission} disabled={busy} onChange={event => setPermission(event.target.checked)} />
          <span>I own this material or have permission to use it.</span>
        </label>
        <button disabled={busy || !permission} onClick={() => void run(async () => {
          const result = await post<OpeningUpdateResponse>(base, { previewId: preview.previewId, ownershipConfirmed: permission });
          setMessage(result.message);
          // Keep the preview token if catalogue refresh fails: retry is idempotent.
          await onUpdated();
          setPreview(null);
          setPermission(false);
          setPgn("");
        })}>{busy ? "Applying update…" : "Apply update — keep my progress"}</button>
        <button className="text-button" disabled={busy} onClick={invalidate}>Discard preview</button>
      </div>}
      {message && <p className="success" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>}
  </div>;
}
