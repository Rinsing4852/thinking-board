import { useEffect, useRef, useState } from "react";

import type { ImportPgnResponse, JobResponse, PgnPreviewResponse } from "../../../../packages/contracts/src/api";
import { get, post } from "../api";

interface ImportPanelProps {
  refreshToken: number;
  onAnalyzed: () => void;
}
export function ImportPanel({ refreshToken, onAnalyzed }: ImportPanelProps) {
  const [pgn, setPgn] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [preview, setPreview] = useState<PgnPreviewResponse | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobResponse | null>(null);
  const pollGeneration = useRef(0);

  const pollJob = async (jobId: string, generation: number): Promise<void> => {
    for (;;) {
      const current = await get<JobResponse>(`/api/v1/jobs/${jobId}`);
      if (generation !== pollGeneration.current) return;
      setJob(current);
      if (current.status === "completed") {
        setStatus("Analysis complete. Your exercises are ready below.");
        setBusy(false);
        onAnalyzed();
        return;
      }
      if (current.status === "failed") {
        setStatus(current.error ?? "Analysis stopped before it finished.");
        setBusy(false);
        return;
      }
      setBusy(true);
      setStatus(current.status === "queued"
        ? "Your game is waiting for the local engine."
        : `Analysing game ${Math.min(current.progressCurrent + 1, current.progressTotal)} of ${current.progressTotal} locally…`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  useEffect(() => {
    const generation = ++pollGeneration.current;
    setJob(null);
    setBusy(false);
    void get<JobResponse | null>("/api/v1/jobs/active").then((activeJob) => {
      if (!activeJob || generation !== pollGeneration.current) return;
      setJob(activeJob);
      setBusy(activeJob.status !== "failed");
      return pollJob(activeJob.id, generation);
    }).catch((error: unknown) => {
      if (generation === pollGeneration.current) {
        setStatus(error instanceof Error ? error.message : "Could not restore analysis progress");
      }
    });
    return () => {
      if (generation === pollGeneration.current) pollGeneration.current += 1;
    };
  }, [refreshToken]);

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

  const importPgn = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await post<ImportPgnResponse>("/api/v1/imports/pgn", { pgn, playerName });
      setStatus(
        `Imported ${result.imported} game${result.imported === 1 ? "" : "s"}. `
        + `${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped. `
        + `${result.rejected} rejected.`,
      );
      if (result.jobId) await pollJob(result.jobId, ++pollGeneration.current);
      else onAnalyzed();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const retryAnalysis = async (): Promise<void> => {
    if (!job || job.status !== "failed") return;
    setBusy(true);
    setStatus("Restarting local analysis…");
    try {
      await post(`/api/v1/jobs/${job.id}/retry`);
      await pollJob(job.id, ++pollGeneration.current);
    } catch (error) {
      setBusy(false);
      setStatus(error instanceof Error ? error.message : "Could not restart analysis");
    }
  };

  return (
    <section className="panel import-panel" id="import">
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
      {job && job.status !== "completed" && (
        <div className={`analysis-status ${job.status}`} aria-live="polite">
          <div>
            <strong>{job.status === "failed" ? "Analysis needs attention" : "Local analysis in progress"}</strong>
            <span>{status}</span>
          </div>
          {job.status === "failed" ? (
            <button onClick={() => void retryAnalysis()}>Retry analysis</button>
          ) : (
            <progress value={job.progressCurrent} max={Math.max(1, job.progressTotal)} />
          )}
        </div>
      )}
      {status && (!job || job.status === "completed") && <p className="status" aria-live="polite">{status}</p>}
    </section>
  );
}
