import { useEffect, useState } from "react";

import type {
  OpeningPlayerPreferences,
  OpeningRatingPlatform,
} from "../../../../packages/contracts/src/api";
import { patch } from "../api";

interface OpeningPlayerContextProps {
  preferences: OpeningPlayerPreferences;
  onSaved: (preferences: OpeningPlayerPreferences) => void;
}

const PLATFORM_LABELS: Record<OpeningRatingPlatform, string> = {
  lichess: "Lichess",
  chess_com: "Chess.com",
  fide: "FIDE",
  not_sure: "Not sure",
};

export function OpeningPlayerContext({ preferences, onSaved }: OpeningPlayerContextProps) {
  const [editing, setEditing] = useState(!preferences.configured);
  const [ratingGroup, setRatingGroup] = useState(preferences.ratingGroup);
  const [platform, setPlatform] = useState<OpeningRatingPlatform>(preferences.platform);
  const [useExplorer, setUseExplorer] = useState(preferences.useExplorer);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setRatingGroup(preferences.ratingGroup);
    setPlatform(preferences.platform);
    setUseExplorer(preferences.useExplorer);
    if (!preferences.configured) setEditing(true);
  }, [preferences]);

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const saved = await patch<OpeningPlayerPreferences>("/api/v1/openings/preferences", {
        ratingGroup,
        platform,
        useExplorer,
      });
      onSaved(saved);
      setEditing(false);
      setMessage("Opening recommendations now use this playing level.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your opening context");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="panel opening-player-context compact">
        <div>
          <span className="eyebrow">Your practical level</span>
          <strong>{PLATFORM_LABELS[preferences.platform]} · {preferences.ratingGroup}+</strong>
          <small>{preferences.useExplorer
            ? "Common-move data is shown while building and checking coverage."
            : "Local Stockfish only; practical game frequencies are off."}</small>
        </div>
        <button className="text-button" onClick={() => { setEditing(true); setMessage(""); }}>Change</button>
        {message && <p className="status" role="status">{message}</p>}
      </div>
    );
  }

  return (
    <div className="panel opening-player-context">
      <div className="opening-player-context-copy">
        <span className="eyebrow">Personalise the move choices</span>
        <h3>{preferences.configured ? "Update your practical level" : "Which games should guide your repertoire?"}</h3>
        <p>This helps rank common opponent replies. It never changes which moves you have saved.</p>
      </div>
      <div className="opening-player-context-fields">
        <label>
          Rating comes from
          <select value={platform} onChange={(event) => setPlatform(event.target.value as OpeningRatingPlatform)}>
            <option value="lichess">Lichess</option>
            <option value="chess_com">Chess.com</option>
            <option value="fide">FIDE</option>
            <option value="not_sure">Not sure</option>
          </select>
        </label>
        <label>
          Closest playing level
          <select value={ratingGroup} onChange={(event) => setRatingGroup(Number(event.target.value))}>
            {[1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500].map((rating) => (
              <option key={rating} value={rating}>{rating}+</option>
            ))}
          </select>
        </label>
        <label className="opening-player-explorer-choice">
          <input
            type="checkbox"
            checked={useExplorer}
            disabled={!preferences.explorerAvailable}
            onChange={(event) => setUseExplorer(event.target.checked)}
          />
          <span>
            <strong>Show practical Lichess frequencies</strong>
            <small>{preferences.explorerAvailable
              ? "Uses the server-side Lichess token and sends only the current position."
              : "Add LICHESS_API_TOKEN to Docker to enable this; Stockfish still works locally."}</small>
          </span>
        </label>
      </div>
      <div className="answer-actions">
        <button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Use these settings"}</button>
        {preferences.configured && <button className="secondary" disabled={saving} onClick={() => { setEditing(false); setMessage(""); }}>Cancel</button>}
      </div>
      {message && <p className="error" role="alert">{message}</p>}
    </div>
  );
}
