import { useEffect, useRef, useState } from "react";
import type { ChessComConnectionResponse, ChessComImportResponse } from "../../../../packages/contracts/src/api";
import { get, post } from "../api";

export function ChessComImport({ onSaved, refreshToken }: { onSaved: () => void; refreshToken: number }) {
  const [connection, setConnection] = useState<ChessComConnectionResponse | null>(null);
  const [username, setUsername] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const generation = useRef(0);
  const loadedAccount = useRef<string | null | undefined>(undefined);
  const load = () => {
    const request = ++generation.current;
    void get<ChessComConnectionResponse>("/api/v1/chesscom/connection").then(result => {
      if (request !== generation.current) return;
      setConnection(result);
      if (loadedAccount.current !== result.username) {
        setUsername(result.username ?? ""); setStatus("");
      }
      loadedAccount.current = result.username;
    }).catch(error => { if (request === generation.current) setStatus(error.message); });
  };
  useEffect(() => { setBusy(false); load(); return () => { generation.current++; }; }, [refreshToken]);
  const connected = connection?.connected && connection.username?.toLowerCase() === username.trim().toLowerCase();

  async function run() {
    if (busy) return;
    const request = ++generation.current;
    setBusy(true);
    setStatus(connected ? "Downloading finished Chess.com games…" : "Checking Chess.com username…");
    try {
      if (!connected) {
        const result = await post<ChessComConnectionResponse>("/api/v1/chesscom/connect", { username });
        if (request !== generation.current) return;
        setConnection(result); setUsername(result.username ?? username); loadedAccount.current = result.username;
        setStatus(`Connected as ${result.username}. Choose a month and import your games.`);
      } else {
        const result = await post<ChessComImportResponse>("/api/v1/chesscom/import", { month });
        if (request !== generation.current) return;
        setConnection(result.connection); setStatus(result.message); onSaved();
      }
    } catch (error) {
      if (request === generation.current) setStatus(error instanceof Error ? error.message : "Could not import Chess.com games");
    } finally { if (request === generation.current) setBusy(false); }
  }

  return <details className="lichess-sync-card">
    <summary>Import finished Chess.com games <small>{connection?.connected ? `Connected as ${connection.username}` : "Optional · use your username"}</small></summary>
    <p>Import a month of public games into this player's library. No password or token needed. Then choose individual games or a batch for analysis.</p>
    <div className="lichess-sync-controls">
      <label>Chess.com username<input value={username} disabled={busy} autoComplete="off" placeholder="Your Chess.com name" onChange={event => setUsername(event.target.value)} /></label>
      <label>Chess.com game month<input type="month" value={month} min="2007-01" max={new Date().toISOString().slice(0, 7)} disabled={busy} onChange={event => setMonth(event.target.value)} /></label>
      <button disabled={busy || !username.trim() || Boolean(connected && !month)} onClick={() => void run()}>
        {busy ? "Please wait…" : connected ? "Import this month" : connection?.connected ? "Change Chess.com account" : "Connect Chess.com"}
      </button>
      {!connection && <button className="text-button" disabled={busy} onClick={load}>Retry Chess.com connection status</button>}
    </div>
    {connection?.lastImportedAt && <p>Last imported {connection.lastMonth} · {new Date(connection.lastImportedAt).toLocaleString()}</p>}
    <p className="panel-help">Recently finished games may take time to appear. Reimporting a month skips games already saved. For immediate access, paste the game's PGN above. Only standard chess is supported. Thinking Board is not affiliated with Chess.com.</p>
    {status && <p className="status" role="status">{status}</p>}
  </details>;
}
