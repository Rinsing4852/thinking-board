import type {
  OpeningCoverageGap,
  OpeningCoverageResponse,
  OpeningPlayerPreferences,
  OpeningProgressResponse,
  OpeningReviewRecommendation,
} from "../../../../packages/contracts/src/api";
import { ChessBoard } from "./ChessBoard";

interface OpeningHomeCockpitProps {
  recommendation: OpeningReviewRecommendation | null;
  coverage: OpeningCoverageResponse | null;
  coverageLoading: boolean;
  progress: OpeningProgressResponse | null;
  preferences: OpeningPlayerPreferences | null;
  busy: boolean;
  importOpen: boolean;
  onStartRecommended: () => void;
  onStartRun: (repertoireId: string) => void;
  onOpenGames: (() => void) | undefined;
  onAnalyzeGame: (() => void) | undefined;
  onOpenGap: (gap: OpeningCoverageGap) => void;
  onOpenWeakLine: (repertoireId: string, lineId: string) => void;
  onBuild: () => void;
  onImport: () => void;
}

function frequencyLabel(percent: number): string {
  if (percent <= 0) return "rarely played";
  return `about 1 in ${Math.max(1, Math.round(100 / percent))} games`;
}

export function OpeningHomeCockpit({
  recommendation,
  coverage,
  coverageLoading,
  progress,
  preferences,
  busy,
  importOpen,
  onStartRecommended,
  onStartRun,
  onOpenGames,
  onAnalyzeGame,
  onOpenGap,
  onOpenWeakLine,
  onBuild,
  onImport,
}: OpeningHomeCockpitProps) {
  const gap = coverage?.gaps[0] ?? null;
  const weakLine = progress?.weakestLines[0] ?? null;
  const repertoire = recommendation?.repertoire ?? null;
  const orientation = repertoire?.learnerColor ?? weakLine?.learnerColor ?? "white";
  const masteredPercent = progress && progress.totalLines > 0
    ? Math.round((progress.masteredLines / progress.totalLines) * 100)
    : 0;

  return (
    <div className={`opening-home-shell${gap ? " has-focus-board" : " task-only"}`}>
      {gap && <section className="opening-home-board-pane" aria-label="Opening position preview">
        <div className="candidate-banner">
          <div>
            <span>{repertoire?.name ?? "Your opening repertoire"}</span>
            <small>{gap ? `Position before ${gap.moveSan}` : `Board shown from ${orientation}'s side`}</small>
          </div>
          <strong>{orientation === "white" ? "White" : "Black"}</strong>
        </div>
        <ChessBoard
          fen={gap.fen}
          orientation={orientation}
          interactive={false}
          ariaLabel="Opening focus board"
        />
        <div className="opening-home-board-caption">
          <span>
            <span className="eyebrow">Biggest repertoire gap</span>
            <strong>{gap.moveSan} is not covered yet</strong>
            <small>{gap.frequencyPercent}% at this position · {frequencyLabel(gap.frequencyPercent)}</small>
          </span>
          <button onClick={() => onOpenGap(gap)}>Prepare this reply</button>
        </div>
      </section>}

      <section className="panel opening-home-tasks">
        <div className="opening-home-heading">
          <span className="eyebrow">Understand your opening</span>
          <h2>Opening Practice</h2>
          <p>One useful task at a time: prepare likely replies, repair game misses, and remember the ideas behind your moves.</p>
          {progress && progress.totalLines > 0 && (
            <div className="opening-home-progress" aria-label={`${progress.masteredLines} of ${progress.totalLines} opening lines secure for now`}>
              <span><i style={{ width: `${masteredPercent}%` }} /></span>
              <small><strong>{progress.masteredLines} of {progress.totalLines}</strong> lines secure for now</small>
            </div>
          )}
        </div>

        {recommendation?.available && repertoire ? (
          <div className="opening-home-primary">
            <div>
              <span className="eyebrow">Recommended now</span>
              <h3>{repertoire.name}</h3>
              <p>{recommendation.message}</p>
              <div className="opening-recommendation-mix" aria-label="Recommended session contents">
                {recommendation.counts.gameMisses > 0 && <span><strong>{recommendation.counts.gameMisses}</strong> from your games</span>}
                {recommendation.counts.due > 0 && <span><strong>{recommendation.counts.due}</strong> due moves</span>}
                {recommendation.counts.new > 0 && <span><strong>{recommendation.counts.new}</strong> new moves</span>}
                {recommendation.counts.early > 0 && <span><strong>{recommendation.counts.early}</strong> extra review</span>}
              </div>
            </div>
            <div className="answer-actions opening-home-primary-actions">
              <button disabled={busy} onClick={onStartRecommended}>
                {busy ? "Starting…" : `Start ${recommendation.counts.total}-position practice`}
              </button>
              <button className="secondary" disabled={busy} onClick={() => onStartRun(repertoire.id)}>
                Practise a varied line
              </button>
            </div>
          </div>
        ) : (
          <div className="opening-home-primary empty">
            <div>
              <span className="eyebrow">Ready when you are</span>
              <h3>No scheduled positions right now</h3>
              <p>Review early, inspect a line, or add your own repertoire below.</p>
            </div>
          </div>
        )}

        <div className="opening-home-actions">
          {onAnalyzeGame && (
            <button className="opening-home-action primary-route" onClick={onAnalyzeGame}>
              <span><b>Analyse a played game</b><small>Paste a game PGN or sync Lichess, then compare it with your repertoire.</small></span>
              <strong>Paste PGN →</strong>
            </button>
          )}
          {recommendation && recommendation.counts.gameMisses > 0 && onOpenGames && (
            <button className="opening-home-action" onClick={onOpenGames}>
              <span><b>Repair game misses</b><small>{recommendation.counts.gameMisses} position{recommendation.counts.gameMisses === 1 ? "" : "s"} from your play</small></span>
              <strong>Review →</strong>
            </button>
          )}
          {preferences?.useExplorer && (
            <button className="opening-home-action" disabled={coverageLoading || !gap} onClick={() => gap && onOpenGap(gap)}>
              <span><b>{coverageLoading ? "Checking common replies…" : gap ? `Prepare for ${gap.moveSan}` : "Common replies covered"}</b><small>{gap ? `${gap.lineTitle} · ${frequencyLabel(gap.frequencyPercent)}` : coverage?.message ?? "No practical gap found."}</small></span>
              <strong>{gap ? "Add response →" : "✓"}</strong>
            </button>
          )}
          {weakLine && (
            <button className="opening-home-action" onClick={() => onOpenWeakLine(weakLine.repertoireId, weakLine.lineId)}>
              <span><b>Strengthen {weakLine.lineTitle}</b><small>{weakLine.gameMisses > 0
                ? `Missed in ${weakLine.gameMisses} game${weakLine.gameMisses === 1 ? "" : "s"}`
                : weakLine.accuracyPercent === null ? "Not practised yet" : `${weakLine.accuracyPercent}% recall accuracy`}</small></span>
              <strong>Open →</strong>
            </button>
          )}
        </div>

        <div className="opening-home-create">
          <span>Build or import repertoire</span>
          <div>
            <button className="secondary" onClick={onBuild}>Build on the board</button>
            <button className="text-button" onClick={onImport}>{importOpen ? "Close importer" : "Import repertoire lines"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
