import { useEffect, useState } from "react";
import { emptyOpeningDraft, OPENING_DRAFT_KEY, parseOpeningDraft } from "./opening-draft";

export function useOpeningDraft() {
  const [initial] = useState(() => {
    try { return parseOpeningDraft(localStorage.getItem(OPENING_DRAFT_KEY)); } catch { return null; }
  });
  const [draft, setDraft] = useState(initial ?? emptyOpeningDraft());
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    try {
      if (draft.name || draft.moves.length) localStorage.setItem(OPENING_DRAFT_KEY, JSON.stringify(draft));
      else localStorage.removeItem(OPENING_DRAFT_KEY);
      setStorageError("");
    } catch { setStorageError("Draft recovery is unavailable in this browser. Save the repertoire before leaving."); }
  }, [draft]);
  const discard = () => {
    try { localStorage.removeItem(OPENING_DRAFT_KEY); } catch { /* The visible warning covers storage failure. */ }
    setDraft(emptyOpeningDraft());
  };
  return { draft, setDraft, recovered: Boolean(initial), storageError, discard };
}
