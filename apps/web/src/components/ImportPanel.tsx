import { useState } from "react";

import type { ImportPgnResponse, JobResponse, PgnPreviewResponse } from "../../../../packages/contracts/src/api";
import { get, post } from "../api";

interface ImportPanelProps {
  onAnalyzed: () => void;
}
export function ImportPanel({ onAnalyzed }: ImportPanelProps) {
  const [pgn, setPgn] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [preview, setPreview] = useState<PgnPreviewResponse | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const previewPgn = async (): Promise<void> => {
    setBusy(true);
    setStatus("");
    try {
      const result = await post<PgnPreviewResponse>("/api/v1/imports/pgn/preview", { pgn });
      setPreview(result);
      if (result.players.length === 1) setPlayerName(result.players[0] ?? "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not parse PGN");
    } finally {
      setBusy(false);
    }
  };

  const pollJob = async (jobId: string): Promise<void> => {
    for (;;) {
      const job = await get<JobResponse>(`/api/v1/jobs/${jobId}`);
      setStatus(job.status === "running"
        ? `Analysing game ${job.progressCurrent + 1} of ${job.progressTotal} locally…`
        : `Analysis ${job.status}.`);
      if (job.status === "completed") {
        onAnalyzed();
        return;
      }
      if (job.status === "failed") throw new Error(job.error ?? "Analysis failed");
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  };

  const importPgn = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await post<ImportPgnResponse>("/api/v1/imports/pgn", { pgn, playerName });
      setStatus(
        `Imported ${result.imported} game${result.imported === 1 ? "" : "s"}. `
        + `${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped. `
        + `${result.rejected} rejected.`,
      );
      if (result.jobId) await pollJob(result.jobId);
      else onAnalyzed();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel import-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Your games</span>
          <h2>Paste a game (PGN)</h2>
        </div>
        <span className="step-number">01</span>
      </div>
      <p className="panel-help">Copy the game text from Lichess, Chess.com, or a PGN file and paste it below. You can paste more than one game at once.</p>
      <textarea
        value={pgn}
        onChange={(event) => setPgn(event.target.value)}
        placeholder={'[Event "My game"]\n[White "Your name"]\n[Black "Opponent"]\n\n1. e4 ...'}
        aria-label="PGN text"
      />
      <div className="import-actions">
        <button className="secondary" disabled={busy || !pgn.trim()} onClick={() => void previewPgn()}>
          Check PGN
        </button>
        {preview && (
          <>
            <label>
              I am
              <select value={playerName} onChange={(event) => setPlayerName(event.target.value)}>
                <option value="">Select player</option>
                {preview.players.map((player) => <option key={player}>{player}</option>)}
              </select>
            </label>
            <button disabled={busy || !playerName} onClick={() => void importPgn()}>
              Import & analyse
            </button>
          </>
        )}
      </div>
      {preview && (
        <div className="preview-list">
          {preview.games.map((game) => (
            <div key={game.fingerprint} className="preview-game">
              <span>{game.white} <b>vs</b> {game.black}</span>
              <span>{game.moveCount} moves {game.duplicate ? "· already imported" : ""}</span>
            </div>
          ))}
          {preview.errors.map((error) => <p className="error" key={`${error.index}-${error.message}`}>{error.message}</p>)}
        </div>
      )}
      {status && <p className="status" aria-live="polite">{status}</p>}
    </section>
  );
}
