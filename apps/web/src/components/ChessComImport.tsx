import { useEffect, useRef, useState } from "react";
import type { ChessComConnectionResponse, ChessComImportResponse } from "../../../../packages/contracts/src/api";
import { get, post } from "../api";

const CHECK_INTERVAL = 12 * 60 * 60 * 1000;
export function ChessComImport({ onManageAccounts, onSaved, refreshToken }: { onManageAccounts:()=>void; onSaved: () => void; refreshToken: number }) {
  const [connection, setConnection] = useState<ChessComConnectionResponse | null>(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  const loadedAccount = useRef<string | null>(null), autoAttempt = useRef<string | null>(null);

  async function run(account: ChessComConnectionResponse, selectedMonth?: string, automatic = false) {
    const request = ++generation.current;
    setBusy(true);
    setStatus(automatic ? "Checking Chess.com for new games…" : "Downloading finished Chess.com games…");
    try {
      const result = await post<ChessComImportResponse>(selectedMonth ? "/api/v1/chesscom/import" : "/api/v1/chesscom/sync", {
        profileId: account.profileId, username: account.username,
        ...(selectedMonth ? {month: selectedMonth} : {automatic}),
      }, pending.current?.signal);
      if (request !== generation.current) return;
      setConnection(result.connection); setStatus(result.message);
      if (result.imported) onSaved();
    } catch (error) {
      if (request === generation.current) setStatus(error instanceof Error ? error.message : "Could not sync Chess.com games");
    } finally { if (request === generation.current) setBusy(false); }
  }

  const load = () => {
    const request = ++generation.current;
    void get<ChessComConnectionResponse>("/api/v1/chesscom/connection", pending.current?.signal).then(result => {
      if (request !== generation.current) return;
      setConnection(result);
      const key = `${result.profileId}:${result.username}`;
      if (loadedAccount.current !== key) setStatus("");
      loadedAccount.current = key;
      const last = result.lastSyncedAt ? Date.parse(result.lastSyncedAt) : 0;
      if (result.connected && result.username && (!Number.isFinite(last) || Date.now() - last >= CHECK_INTERVAL)
        && autoAttempt.current !== `${key}:${result.lastSyncedAt}`) {
        autoAttempt.current = `${key}:${result.lastSyncedAt}`;
        void run(result, undefined, true);
      }
    }).catch(error => { if (request === generation.current) setStatus(error.message); });
  };
  useEffect(() => {
    pending.current = new AbortController(); setBusy(false); setConnection(null); load();
    return () => { generation.current++; pending.current?.abort(); };
  }, [refreshToken]);
  const connected = connection?.connected && Boolean(connection.username);

  return <details className="lichess-sync-card">
    <summary>Sync Chess.com games <small>{connection?.connected ? `Connected as ${connection.username}` : "Optional · use your username"}</small></summary>
    <p>Checks for new games when you open My games, at most every 12 hours. Analyse separately.</p>
    <div className="lichess-sync-controls">
      <button disabled={busy || !connected} onClick={() => { if (connection && !busy) void run(connection); }}>
        {busy ? "Checking Chess.com…" : "Sync recent games"}
      </button>
      <button className="secondary" onClick={onManageAccounts}>{connected ? "Manage Chess.com account" : "Link Chess.com in Profile"}</button>
      {!connection && <button className="text-button" disabled={busy} onClick={load}>Retry Chess.com connection status</button>}
    </div>
    {connection?.lastSyncedAt && <p>Last checked {connection.lastSyncMonth} · {new Date(connection.lastSyncedAt).toLocaleString()}</p>}
    <details><summary>Import a specific month</summary>
      <div className="lichess-sync-controls">
        <label>Chess.com game month<input type="month" value={month} min="2007-01" max={new Date().toISOString().slice(0, 7)} disabled={busy} onChange={event => setMonth(event.target.value)} /></label>
        <button disabled={busy || !connected || !month} onClick={() => { if (connection && !busy) void run(connection, month); }}>Import this month</button>
      </div>
      {connection?.lastImportedAt && <p>Last month import: {connection.lastMonth} · {new Date(connection.lastImportedAt).toLocaleString()}</p>}
    </details>
    <p className="panel-help">Chess.com can publish games late. Reimports skip duplicates. Standard chess only. Not affiliated with Chess.com.</p>
    {status && <p className="status" role="status">{status}</p>}
  </details>;
}
