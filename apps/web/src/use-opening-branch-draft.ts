import { useEffect, useState } from "react";

export interface BranchDraft { graphKey: string; lineId: string; ply: number; move: { uci: string; san: string }; title: string; explanation: string }

export function useOpeningBranchDraft(repertoireId: string, current: BranchDraft | null) {
  const key = `thinking-board.branch-draft.v1.${repertoireId}`;
  const [recovery, setRecovery] = useState<BranchDraft | null>(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(key) ?? "null") as BranchDraft | null;
      return draft && typeof draft.graphKey === "string" && typeof draft.lineId === "string"
        && Number.isSafeInteger(draft.ply) && draft.ply >= 0 && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(draft.move?.uci)
        && typeof draft.move.san === "string" && typeof draft.title === "string" && typeof draft.explanation === "string" ? draft : null;
    } catch { return null; }
  });
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    if (!current) return;
    try { localStorage.setItem(key, JSON.stringify(current)); setStorageError(""); }
    catch { setStorageError("Draft recovery is unavailable. Save this move before leaving."); }
  }, [key, current?.graphKey, current?.lineId, current?.ply, current?.move.uci, current?.title, current?.explanation]);
  const clear = () => {
    try { localStorage.removeItem(key); } catch { /* Storage failure is shown above. */ }
    setRecovery(null);
  };
  return { recovery, clear, storageError };
}
