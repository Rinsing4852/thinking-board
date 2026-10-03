import { useEffect, useMemo } from "react";
import { RecallClock } from "./recall-clock";

export function useRecallClock(queueEntryId: string, running: boolean) {
  const key = `opening-recall:${queueEntryId}`;
  const clock = useMemo(() => {
    let elapsed = 0;
    try {
      const stored = Number(sessionStorage.getItem(key));
      if (Number.isSafeInteger(stored) && stored >= 0) elapsed = stored;
    } catch { /* Storage is optional. */ }
    return new RecallClock(() => performance.now(), Math.max(0, elapsed));
  }, [key]);
  const save = () => {
    try { sessionStorage.setItem(key, String(clock.read())); } catch { /* Practice works without storage. */ }
  };
  useEffect(() => {
    clock.setRunning(running);
    save();
    return () => { clock.setRunning(false); save(); };
  }, [clock, running]);
  useEffect(() => {
    const suspend = () => { clock.setRunning(false); save(); };
    const restore = () => { if (running && !document.hidden) clock.setRunning(true); };
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", restore);
    return () => { suspend(); window.removeEventListener("pagehide", suspend); window.removeEventListener("pageshow", restore); };
  }, [clock, running]);
  return { read: () => { save(); return clock.read(); } };
}
