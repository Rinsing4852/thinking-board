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

interface Mistake {
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
}

interface Review {
  game: GameSummary;
  mistakes: Mistake[];
}

interface GameReviewProps {
  refreshToken: number;
  onTrain: (itemId: string) => void;
}

interface MistakeCardProps {
  mistake: Mistake;
  concepts: Concept[];
  onSave: (itemId: string, thinking: string, tactic: string) => void;
  onTrain: (itemId: string) => void;
}

function MistakeCard({ mistake, concepts, onSave, onTrain }: MistakeCardProps) {
  const [thinking, setThinking] = useState(
    mistake.concepts.find((concept) => concept.family === "thinking_process")?.id ?? "",
  );
  const [tactic, setTactic] = useState(
    mistake.concepts.find((concept) => concept.family === "tactical")?.id ?? "",
  );
  const mateChanged = mistake.evaluationBeforeMate !== null || mistake.evaluationAfterMate !== null;
  const pawnSwing = mistake.centipawnLoss === null
    ? null
    : (mistake.centipawnLoss / 100).toFixed(1).replace(/\.0$/, "");

  return (
    <article className="mistake-card">
      <div>
        <span className="eyebrow">Move {mistake.moveNumber}</span>
        <h3>{mistake.playedMove}?</h3>
      </div>
      <div>
        <strong>{mistake.classification}</strong>
        <p>{mistake.explanation ?? "The move gave the opponent a meaningful opportunity."}</p>
        <p className="review-detail"><b>Result:</b> {
          mateChanged
            ? mistake.concepts.some((concept) => concept.id === "tactic.allowed_mate")
              ? "Allowed a forced mate"
              : "The forced-mate situation changed"
            : `The engine estimate worsened by about ${pawnSwing} pawn${pawnSwing === "1" ? "" : "s"}`
        }</p>
        {mistake.betterCandidates.length > 0 && <p className="review-detail"><b>Moves worth considering:</b> {mistake.betterCandidates.map((candidate) => candidate.moveSan).join(", ")}</p>}
        {mistake.concepts.length > 0 && <div className="concept-chips">{mistake.concepts.map((concept) => <span key={concept.id}>{concept.label}</span>)}</div>}
        {mistake.diagnosisItemId && (
          <>
            <div className="diagnosis-editor">
              <label>Thinking step to train
                <select value={thinking} onChange={(event) => setThinking(event.target.value)}>
                  <option value="">Choose…</option>
                  {concepts.filter((concept) => concept.family === "thinking_process").map((concept) => <option key={concept.id} value={concept.id}>{concept.label}</option>)}
                </select>
                <small>Which part of SEE → CANDIDATES → CHECK was missed?</small>
              </label>
              <label>Chess pattern
                <select value={tactic} onChange={(event) => setTactic(event.target.value)}>
                  <option value="">Choose…</option>
                  {concepts.filter((concept) => concept.family === "tactical").map((concept) => <option key={concept.id} value={concept.id}>{concept.label}</option>)}
                </select>
                <small>What tactical idea appeared on the board?</small>
              </label>
              <button className="secondary" onClick={() => onSave(mistake.diagnosisItemId!, thinking, tactic)}>Save diagnosis</button>
            </div>
            {mistake.trainingItemId && <button className="review-train-button" onClick={() => onTrain(mistake.trainingItemId!)}>Train this position</button>}
          </>
        )}
      </div>
    </article>
  );
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
            <MistakeCard
              key={`${review.game.id}-${mistake.ply}`}
              mistake={mistake}
              concepts={concepts}
              onSave={(itemId, thinking, tactic) => void saveDiagnosis(itemId, thinking, tactic)}
              onTrain={onTrain}
            />
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
