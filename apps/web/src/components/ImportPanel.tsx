import { useEffect, useRef, useState } from "react";

import type {
  ImportPgnResponse,
  JobResponse,
  LichessConnectionResponse,
  LichessSyncResponse,
  PgnPreviewResponse,
} from "../../../../packages/contracts/src/api";
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
  const [lichess, setLichess] = useState<LichessConnectionResponse | null>(null);
  const [lichessUsername, setLichessUsername] = useState("");
  const [lichessLimit, setLichessLimit] = useState(50);
  const [lichessBusy, setLichessBusy] = useState(false);
  const [lichessStatus, setLichessStatus] = useState("");

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
    void Promise.all([
      get<JobResponse | null>("/api/v1/jobs/active"),
      get<LichessConnectionResponse>("/api/v1/lichess/connection"),
    ]).then(async ([activeJob, connection]) => {
      if (generation !== pollGeneration.current) return;
      setLichess(connection);
      if (connection.username) setLichessUsername(connection.username);
      if (activeJob) {
        setJob(activeJob);
        setBusy(activeJob.status !== "failed");
        await pollJob(activeJob.id, generation);
        return;
      }
      const lastSync = connection.lastSyncedAt ? Date.parse(connection.lastSyncedAt) : 0;
      const automaticSyncDue = connection.connected && Date.now() - lastSync >= 6 * 60 * 60 * 1000;
      if (!automaticSyncDue) return;
      setLichessBusy(true);
      setLichessStatus("Checking Lichess for new finished games…");
      try {
        const result = await post<LichessSyncResponse>("/api/v1/lichess/sync", { maxGames: 25 });
        if (generation !== pollGeneration.current) return;
        setLichess(result.connection);
        setLichessStatus(`${result.message} Automatic checks run at most every six hours.`);
        if (result.jobId) {
          setBusy(true);
          await pollJob(result.jobId, generation);
        } else {
          onAnalyzed();
        }
      } finally {
        if (generation === pollGeneration.current) setLichessBusy(false);
      }
    }).catch((error: unknown) => {
      if (generation === pollGeneration.current) {
        setStatus(error instanceof Error ? error.message : "Could not restore game and sync status");
      }
    });
    return () => {
      if (generation === pollGeneration.current) pollGeneration.current += 1;
    };
  }, [refreshToken]);

  const connectLichess = async (): Promise<void> => {
    if (!lichessUsername.trim() || lichessBusy) return;
    setLichessBusy(true);
    setLichessStatus("");
    try {
      const connection = await post<LichessConnectionResponse>("/api/v1/lichess/connect", {
        username: lichessUsername,
      });
      setLichess(connection);
      setLichessUsername(connection.username ?? lichessUsername);
      setLichessStatus(`Connected to ${connection.username}. Sync when you are ready.`);
    } catch (error) {
      setLichessStatus(error instanceof Error ? error.message : "Could not connect Lichess");
    } finally {
      setLichessBusy(false);
    }
  };

  const syncLichess = async (): Promise<void> => {
    if (!lichess?.connected || lichessBusy) return;
    setLichessBusy(true);
    setLichessStatus("Downloading finished games from Lichess…");
    try {
      const result = await post<LichessSyncResponse>("/api/v1/lichess/sync", { maxGames: lichessLimit });
      setLichess(result.connection);
      setLichessStatus(`${result.message} ${result.duplicates > 0 ? `${result.duplicates} already imported.` : ""}`.trim());
      if (result.jobId) {
        setBusy(true);
        await pollJob(result.jobId, ++pollGeneration.current);
      } else {
        onAnalyzed();
      }
    } catch (error) {
      setLichessStatus(error instanceof Error ? error.message : "Could not sync Lichess games");
    } finally {
      setLichessBusy(false);
    }
  };

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
      <div className="lichess-sync-card">
        <div>
          <span className="eyebrow">Optional shortcut</span>
          <h3>Sync finished Lichess games</h3>
          <p>Public games need only your username. A read-only token set by the server owner can include games visible to that token; it is never sent to this browser.</p>
        </div>
        <div className="lichess-sync-controls">
          <label>
            Lichess username
            <input value={lichessUsername} onChange={(event) => setLichessUsername(event.target.value)} placeholder="Your Lichess name" />
          </label>
          {lichess?.connected && <label>
            Games per sync
            <select value={lichessLimit} onChange={(event) => setLichessLimit(Number(event.target.value))}>
              <option value={25}>25 latest</option>
              <option value={50}>50 latest</option>
              <option value={100}>100 latest</option>
            </select>
          </label>}
          {!lichess?.connected || lichess.username?.toLocaleLowerCase() !== lichessUsername.trim().toLocaleLowerCase() ? (
            <button disabled={lichessBusy || !lichessUsername.trim()} onClick={() => void connectLichess()}>
              {lichessBusy ? "Connecting…" : lichess?.connected ? "Change account" : "Connect account"}
            </button>
          ) : (
            <button disabled={lichessBusy || busy} onClick={() => void syncLichess()}>
              {lichessBusy ? "Syncing…" : "Sync new games"}
            </button>
          )}
        </div>
        {lichess?.connected && (
          <p className="lichess-connection-note">
            Connected as <strong>{lichess.username}</strong> · {lichess.tokenConfigured ? "server token enabled" : "public games only"}
            {lichess.lastSyncedAt ? ` · last synced ${new Date(lichess.lastSyncedAt).toLocaleString()}` : " · not synced yet"}
          </p>
        )}
        {lichessStatus && <p className="status" aria-live="polite">{lichessStatus}</p>}
      </div>
      <div className="manual-import-divider"><span>or paste PGN manually</span></div>
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
