import { useEffect, useRef, useState } from "react";
import type { ChessComConnectionResponse, ChessComImportResponse } from "../../../../packages/contracts/src/api";
import { get, post } from "../api";

export function ChessComImport({ onManageAccounts, onSaved, refreshToken }: { onManageAccounts:()=>void; onSaved: () => void; refreshToken: number }) {
  const [connection, setConnection] = useState<ChessComConnectionResponse | null>(null);
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
        setStatus("");
      }
      loadedAccount.current = result.username;
    }).catch(error => { if (request === generation.current) setStatus(error.message); });
  };
  useEffect(() => { setBusy(false); load(); return () => { generation.current++; }; }, [refreshToken]);
  const connected = connection?.connected && Boolean(connection.username);

  async function run() {
    if (busy) return;
    const request = ++generation.current;
    setBusy(true);
    setStatus("Downloading finished Chess.com games…");
    try {
        const result = await post<ChessComImportResponse>("/api/v1/chesscom/import", { month });
        if (request !== generation.current) return;
        setConnection(result.connection); setStatus(result.message); onSaved();
    } catch (error) {
      if (request === generation.current) setStatus(error instanceof Error ? error.message : "Could not import Chess.com games");
    } finally { if (request === generation.current) setBusy(false); }
  }

  return <details className="lichess-sync-card">
    <summary>Import finished Chess.com games <small>{connection?.connected ? `Connected as ${connection.username}` : "Optional · use your username"}</small></summary>
    <p>Import a month of public games. Analyse them separately when ready.</p>
    <div className="lichess-sync-controls">
      <label>Chess.com game month<input type="month" value={month} min="2007-01" max={new Date().toISOString().slice(0, 7)} disabled={busy} onChange={event => setMonth(event.target.value)} /></label>
      <button disabled={busy || !connected || !month} onClick={() => void run()}>
        {busy ? "Please wait…" : "Import this month"}
      </button>
      <button className="secondary" onClick={onManageAccounts}>{connected?"Manage Chess.com account":"Link Chess.com in Profile"}</button>
      {!connection && <button className="text-button" disabled={busy} onClick={load}>Retry Chess.com connection status</button>}
    </div>
    {connection?.lastImportedAt && <p>Last imported {connection.lastMonth} · {new Date(connection.lastImportedAt).toLocaleString()}</p>}
    <p className="panel-help">Recent games may be delayed; paste PGN for immediate access. Reimports skip duplicates. Standard chess only. Not affiliated with Chess.com.</p>
    {status && <p className="status" role="status">{status}</p>}
  </details>;
}
