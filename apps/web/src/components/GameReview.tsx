import { useEffect, useState } from "react";

import { get, patch } from "../api";

interface Concept {
  id: string;
  family: "thinking_process" | "tactical";
  label: string;
}

interface GameSummary {
  id: string;
  white: string;
  black: string;
  playerColor: string;
  result: string;
  analyzedAt: string | null;
}

interface Review {
  game: GameSummary;
  mistakes: Array<{
    ply: number;
    moveNumber: number;
    playedMove: string;
    centipawnLoss: number | null;
    comparisonLoss: number;
    classification: string;
    trainingItemId: string | null;
    diagnosisItemId: string | null;
    explanation: string | null;
    evaluationBefore: number | null;
    evaluationAfter: number | null;
    evaluationBeforeMate: number | null;
    evaluationAfterMate: number | null;
    concepts: Array<Concept & { source: string }>;
    betterCandidates: Array<{ moveSan: string; rank: number }>;
  }>;
}

interface GameReviewProps {
  refreshToken: number;
  onTrain: (itemId: string) => void;
}

export function GameReview({ refreshToken, onTrain }: GameReviewProps) {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    void get<{ games: GameSummary[] }>("/api/v1/games").then((data) => {
      setGames(data.games);
      const first = data.games[0];
      if (first) void get<Review>(`/api/v1/games/${first.id}/review`).then((nextReview) => {
        setReview(nextReview);
        setShowAll(false);
      }).catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load game review");
      });
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Could not load games"));
    void get<{ concepts: Concept[] }>("/api/v1/concepts").then((data) => setConcepts(data.concepts)).catch(() => undefined);
  }, [refreshToken]);

  const saveDiagnosis = async (itemId: string, thinking: string, tactic: string): Promise<void> => {
    const conceptIds = [thinking, tactic].filter(Boolean);
    try {
      await patch(`/api/v1/training/items/${itemId}/classification`, { conceptIds });
      setStatus("Diagnosis saved. Future session weighting will use it.");
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save diagnosis");
    }
  };

  if (games.length === 0) return null;
  return (
    <section className="review-section">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">From your games</span>
          <h2>Important mistakes</h2>
        </div>
        <span className="step-number">Review</span>
      </div>
      <div className="game-chips">
        {games.map((game) => (
          <button
            key={game.id}
            className="secondary"
            onClick={() => void get<Review>(`/api/v1/games/${game.id}/review`).then((nextReview) => {
              setReview(nextReview);
              setShowAll(false);
            }).catch((loadError: unknown) => {
              setError(loadError instanceof Error ? loadError.message : "Could not load game review");
            })}
          >
            {game.white} – {game.black}
          </button>
        ))}
      </div>
      {review && (
        <div className="mistake-list">
          {review.mistakes.length === 0 && <p>No meaningful mistakes were found in this game.</p>}
          {review.mistakes.slice(0, showAll ? review.mistakes.length : 4).map((mistake) => (
            <article key={mistake.ply} className="mistake-card">
              <div>
                <span className="eyebrow">Move {mistake.moveNumber}</span>
                <h3>{mistake.playedMove}?</h3>
              </div>
              <div>
                <strong>{mistake.classification}</strong>
                <p>{mistake.explanation ?? "The move caused a meaningful evaluation loss."}</p>
                <p className="review-detail"><b>Evaluation swing:</b> {
                  mistake.evaluationBeforeMate !== null || mistake.evaluationAfterMate !== null
                    ? mistake.concepts.some((concept) => concept.id === "tactic.allowed_mate")
                      ? "Allowed a forced mate"
                      : "Mate evaluation changed"
                    : `${mistake.centipawnLoss} cp`
                }</p>
                {mistake.betterCandidates.length > 0 && <p className="review-detail"><b>Better candidates:</b> {mistake.betterCandidates.map((candidate) => candidate.moveSan).join(", ")}</p>}
                {mistake.concepts.length > 0 && <div className="concept-chips">{mistake.concepts.map((concept) => <span key={concept.id}>{concept.label}</span>)}</div>}
                {mistake.diagnosisItemId && (
                  <>
                    <div className="diagnosis-editor">
                      <label>Thinking-process failure
                        <select id={`thinking-${mistake.ply}`} defaultValue={mistake.concepts.find((concept) => concept.family === "thinking_process")?.id ?? ""}>
                          <option value="">Choose…</option>
                          {concepts.filter((concept) => concept.family === "thinking_process").map((concept) => <option key={concept.id} value={concept.id}>{concept.label}</option>)}
                        </select>
                      </label>
                      <label>Tactical motif
                        <select id={`tactic-${mistake.ply}`} defaultValue={mistake.concepts.find((concept) => concept.family === "tactical")?.id ?? ""}>
                          <option value="">Choose…</option>
                          {concepts.filter((concept) => concept.family === "tactical").map((concept) => <option key={concept.id} value={concept.id}>{concept.label}</option>)}
                        </select>
                      </label>
                      <button className="secondary" onClick={() => {
                        const thinking = (document.getElementById(`thinking-${mistake.ply}`) as HTMLSelectElement).value;
                        const tactic = (document.getElementById(`tactic-${mistake.ply}`) as HTMLSelectElement).value;
                        void saveDiagnosis(mistake.diagnosisItemId!, thinking, tactic);
                      }}>Save diagnosis</button>
                    </div>
                    {mistake.trainingItemId && (
                    <button
                      className="review-train-button"
                      onClick={() => {
                        onTrain(mistake.trainingItemId!);
                      }}
                    >
                      Train this position
                    </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
          {review.mistakes.length > 4 && (
            <button className="secondary" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Show the most important four" : `Show all ${review.mistakes.length} mistakes`}
            </button>
          )}
        </div>
      )}
      {status && <p className="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
