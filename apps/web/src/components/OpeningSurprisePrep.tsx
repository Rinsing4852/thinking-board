import { useEffect, useState } from "react";

import type {
  GameOpeningInboxGroup,
  OpeningPositionAnalysisResponse,
  OpeningSurprisePreparationResponse,
} from "../../../../packages/contracts/src/api";
import { post } from "../api";
import { applyUciMove } from "../opening-board";
import { ChessBoard } from "./ChessBoard";

interface SelectedReply {
  moveUci: string;
  moveSan: string;
  fenAfter: string;
}

interface OpeningSurprisePrepProps {
  group: GameOpeningInboxGroup;
  onCancel: () => void;
  onSaved: (response: OpeningSurprisePreparationResponse) => void;
}

function scoreLabel(line: OpeningPositionAnalysisResponse["lines"][number]): string {
  if (line.score.kind === "mate") {
    return line.score.value > 0 ? `Mate in ${line.score.value}` : `Mated in ${Math.abs(line.score.value)}`;
  }
  const pawns = line.score.value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

export function OpeningSurprisePrep({ group, onCancel, onSaved }: OpeningSurprisePrepProps) {
  const departure = group.opening.departure!;
  const [selected, setSelected] = useState<SelectedReply | null>(null);
  const [analysis, setAnalysis] = useState<OpeningPositionAnalysisResponse | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(true);
  const [opponentSummary, setOpponentSummary] = useState("");
  const [replySummary, setReplySummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setAnalysisBusy(true);
    void post<OpeningPositionAnalysisResponse>(
      "/api/v1/openings/analysis",
      { fen: departure.fenAfter },
      controller.signal,
    ).then(setAnalysis).catch(() => {
      if (!controller.signal.aborted) {
        setError("Stockfish suggestions are unavailable right now. You can still choose your reply on the board.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setAnalysisBusy(false);
    });
    return () => controller.abort();
  }, [departure.fenAfter]);

  const chooseReply = (moveUci: string, moveSan: string): void => {
    try {
      setSelected({ moveUci, moveSan, fenAfter: applyUciMove(departure.fenAfter, moveUci) });
      setError("");
    } catch {
      setError("That reply is not legal in this position");
    }
  };

  const save = async (): Promise<void> => {
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await post<OpeningSurprisePreparationResponse>(
        `/api/v1/openings/game-inbox/${group.key}/prepare`,
        {
          replyMoveUci: selected.moveUci,
          opponentSummary,
          replySummary,
        },
      );
      onSaved(response);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save this repertoire reply");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="opening-surprise-prep" aria-label={`Prepare a reply to ${departure.moveSan}`}>
      <div className="opening-surprise-copy">
        <span className="eyebrow">Prepare the position</span>
        <h4>How will you answer {departure.moveSan}?</h4>
        <p>Move your piece on the board or choose a Stockfish candidate. Nothing is saved until you confirm it.</p>
        {group.opening.repertoire.origin === "built_in" && (
          <p className="opening-personal-copy-note">Saving creates an editable personal copy. The built-in course remains unchanged.</p>
        )}
      </div>

      <div className="opening-surprise-grid">
        <div>
          <ChessBoard
            fen={selected?.fenAfter ?? departure.fenAfter}
            orientation={group.opening.repertoire.learnerColor}
            interactive={!selected}
            lastMove={selected?.moveUci ?? departure.moveUci}
            onMove={chooseReply}
            ariaLabel={`Position after ${departure.moveSan}`}
          />
          {selected && (
            <div className="opening-selected-reply">
              <span>Your reply</span>
              <strong>{selected.moveSan}</strong>
              <button className="text-button" onClick={() => setSelected(null)}>Choose another move</button>
            </div>
          )}
        </div>

        <div className="opening-surprise-guidance">
          <div>
            <span className="eyebrow">Local Stockfish</span>
            <h4>Strong replies</h4>
            <p>These are ideas to compare, not a demand to memorise the first move.</p>
          </div>
          {analysisBusy && <p>Analysing the position…</p>}
          <div className="opening-surprise-candidates">
            {analysis?.lines.map((line) => (
              <button
                className={selected?.moveUci === line.moveUci ? "active" : "secondary"}
                key={line.moveUci}
                onClick={() => chooseReply(line.moveUci, line.moveSan)}
              >
                <span><strong>{line.moveSan}</strong><small>{line.pvSan.slice(0, 5).join(" ")}</small></span>
                <b>{scoreLabel(line)}</b>
              </button>
            ))}
          </div>

          <details className="opening-surprise-notes">
            <summary>Add learning notes (optional)</summary>
            <label>
              What is the opponent trying to do with {departure.moveSan}?
              <textarea value={opponentSummary} onChange={(event) => setOpponentSummary(event.target.value)} rows={2} />
            </label>
            <label>
              Why is {selected?.moveSan ?? "your reply"} useful?
              <textarea value={replySummary} onChange={(event) => setReplySummary(event.target.value)} rows={2} />
            </label>
          </details>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="opening-surprise-actions">
            <button className="secondary" disabled={saving} onClick={onCancel}>Cancel</button>
            <button disabled={!selected || saving} onClick={() => void save()}>
              {saving ? "Saving…" : selected ? `Save ${departure.moveSan} → ${selected.moveSan}` : "Choose your reply"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
