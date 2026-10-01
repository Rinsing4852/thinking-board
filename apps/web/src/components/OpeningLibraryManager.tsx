import { useEffect, useRef, useState } from "react";
import type { OpeningLibraryDeletionResponse, OpeningRepertoireDeletionResponse, OpeningRepertoireSummary } from "../../../../packages/contracts/src/api";
import { post, remove } from "../api";

export function OpeningLibraryManager({ repertoires, onDeleted }: {
  repertoires: OpeningRepertoireSummary[];
  onDeleted: (ids: string[], message: string) => void;
}) {
  const [target, setTarget] = useState<{ items: OpeningRepertoireSummary[]; all: boolean } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const choose = (items: OpeningRepertoireSummary[], all: boolean, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setTarget({ items, all }); setConfirmation(""); setError("");
  };
  useEffect(() => {
    if (!target) return;
    dialogRef.current?.focus();
    return () => { if (triggerRef.current?.isConnected) triggerRef.current.focus(); };
  }, [target]);

  const confirm = async () => {
    if (!target || inFlight.current || (target.all && confirmation.trim().toUpperCase() !== "DELETE")) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = target.all
        ? await post<OpeningLibraryDeletionResponse>("/api/v1/openings/library/delete", {
          repertoireIds: target.items.map(item => item.id), confirmed: true,
        })
        : await remove<OpeningRepertoireDeletionResponse>(`/api/v1/openings/repertoires/${target.items[0]!.id}`);
      onDeleted("deletedRepertoireIds" in result ? result.deletedRepertoireIds : [result.deletedRepertoireId], result.message);
      setTarget(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete the opening material. Reload before trying again.");
    } finally { inFlight.current = false; setBusy(false); }
  };

  if (repertoires.length === 0) return null;
  return <details className="panel opening-library-manager">
    <summary>Manage opening library <span>{repertoires.length} repertoires</span></summary>
    <p>Archive from a repertoire card to keep it for later. Delete here to remove all its lines, notes and opening-review results. Built-in repertoires can be deleted and will not return after a restart.</p>
    <div className="opening-library-list">{repertoires.map(repertoire => <div key={repertoire.id}>
      <span><strong>{repertoire.name}</strong><small>{repertoire.archived ? "Archived" : `Play as ${repertoire.learnerColor}`} · {repertoire.origin === "built_in" ? "Legacy starter" : "Private repertoire"}</small></span>
      <button className="secondary danger-button" disabled={busy} aria-label={`Delete repertoire ${repertoire.name}`} onClick={event => choose([repertoire], false, event.currentTarget)}>Delete</button>
    </div>)}</div>
    <button className="secondary danger-button" disabled={busy} onClick={event => choose([...repertoires], true, event.currentTarget)}>Delete all opening repertoires</button>
    {target && <div className="panel opening-delete-confirm" role="alertdialog" aria-labelledby="opening-library-delete-title" aria-describedby="opening-library-delete-description" tabIndex={-1} ref={dialogRef} onKeyDown={event => {
      if (event.key === "Escape" && !inFlight.current) { event.stopPropagation(); setTarget(null); }
    }}>
      <div>
        <h3 id="opening-library-delete-title">{target.all ? "Delete the entire opening library?" : `Delete “${target.items[0]!.name}”?`}</h3>
        <p id="opening-library-delete-description">{target.all ? "Every active and archived repertoire listed below" : "This repertoire"} will be permanently removed, including its lines, personal notes and opening-review results for all player profiles on this installation. Imported games, game analysis and settings stay. This cannot be undone.</p>
        <ul>{target.items.map(item => <li key={item.id}><strong>{item.name}</strong> · <a href={`/api/v1/openings/repertoires/${item.id}/export.pgn`} download>Export PGN first</a></li>)}</ul>
        <p>PGN exports preserve lines and notes, not your review history. Back up the app data if you may want to restore everything.</p>
        {target.all && <label>Type DELETE to confirm<input value={confirmation} disabled={busy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} /></label>}
      </div>
      <div className="answer-actions">
        <button className="secondary" disabled={busy} onClick={() => setTarget(null)}>Keep my openings</button>
        <button className="danger-button danger-confirm" disabled={busy || (target.all && confirmation.trim().toUpperCase() !== "DELETE")} onClick={() => void confirm()}>{busy ? "Deleting…" : target.all ? "Permanently delete all openings" : "Delete repertoire"}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>}
  </details>;
}
