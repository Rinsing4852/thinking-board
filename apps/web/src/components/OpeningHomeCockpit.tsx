import { firstPreparationTask } from "../../../../packages/contracts/src/opening-tasks";
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
  recommendationLoading?: boolean;
  coverage: OpeningCoverageResponse | null;
  coverageLoading: boolean;
  progress: OpeningProgressResponse | null;
  preferences: OpeningPlayerPreferences | null;
  libraryEmpty: boolean;
  busy: boolean;
  onStartRecommended: () => void;
  onLearnFirst?: () => void;
  learnableResponses?: number;
  onStartRun: (repertoireId: string) => void;
  onOpenGames: (() => void) | undefined;
  onAnalyzeGame: (() => void) | undefined;
  onOpenGap: (gap: OpeningCoverageGap) => void;
  onOpenWeakLine: (repertoireId: string, lineId: string) => void;
  onSettings: () => void;
}

function frequencyLabel(percent: number): string {
  if (percent <= 0) return "rarely played";
  return `about 1 in ${Math.max(1, Math.round(100 / percent))} replies here`;
}

export function OpeningHomeCockpit({
  recommendation,
  recommendationLoading = false,
  coverage,
  coverageLoading,
  progress,
  preferences,
  libraryEmpty,
  busy,
  onStartRecommended,
  onLearnFirst, learnableResponses=0,
  onStartRun,
  onOpenGames,
  onAnalyzeGame,
  onOpenGap,
  onOpenWeakLine,
  onSettings,
}: OpeningHomeCockpitProps) {
  const gap = coverage ? firstPreparationTask(coverage.gaps) : null;
  const weakLine = progress?.weakestLines[0] ?? null;
  const repertoire = recommendation?.repertoire ?? null;
  const activity = recommendation?.activity;
  const offerLearning=Boolean(onLearnFirst&&learnableResponses>0&&recommendation?.available
    &&recommendation.counts.due===0&&recommendation.counts.gameMisses===0&&(activity?.remaining??1)>0);
  const orientation = gap ? gap.fen.split(" ")[1] === "w" ? "black" : "white" : repertoire?.learnerColor ?? weakLine?.learnerColor ?? "white";
  const masteredPercent = progress && progress.totalLines > 0
    ? Math.round((progress.masteredLines / progress.totalLines) * 100)
    : 0;

  return (
    <div className={`opening-home-shell${gap ? " has-focus-board" : " task-only"}`}>
      {gap && <section className="opening-home-board-pane" aria-label="Opening position preview">
        <div className="candidate-banner">
          <div>
            <span>{gap.lineTitle}</span>
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
            <span className="eyebrow">Reply worth considering</span>
            <strong>{gap.moveSan} is not covered yet</strong>
            <small>{gap.task?.reason}</small>
            <small>{gap.games > 0 ? `${gap.frequencyPercent}% at this position · ${frequencyLabel(gap.frequencyPercent)}` : `Lichess frequency unknown · seen ${gap.personalFrequency?.games ?? gap.preparation?.personal.occurrences ?? 0} times in your games`}</small>
          </span>
          <button onClick={() => onOpenGap(gap)}>Inspect this reply</button>
        </div>
      </section>}

      <section className="panel opening-home-tasks">
        <div className="opening-home-heading">
          <span className="eyebrow">Understand your opening</span>
          <h2>Opening Practice</h2>
          <p>One useful task at a time: prepare likely replies, repair game misses, and remember the ideas behind your moves.</p>
          {activity && <section className="opening-daily-activity" aria-label="Daily opening practice">
            <div className="opening-daily-summary">
              <strong>{activity.goalReached ? "Daily goal reached" : "Today's practice"}</strong>
              <span>{activity.completedToday} / {activity.goal} positions · {activity.streakDays}-day streak</span>
            </div>
            <progress aria-label="Daily practice goal" value={Math.min(activity.completedToday, activity.goal)} max={activity.goal} />
            <small>{activity.independentToday} recalled without help today · {activity.remaining} to your goal · {activity.timeZone}</small>
            <div className="opening-activity-days" aria-label="Practice over the last seven days">
              {activity.days.slice(-7).map(day => <span key={day.date} className={day.completed > 0 ? "practised" : ""}
                title={`${day.date}: ${day.completed} positions, ${day.independent} without help`}>
                <small>{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`))}</small>
                <b>{day.completed}</b>
              </span>)}
            </div>
            <small>A streak means completing practice on consecutive days. Corrected or hinted answers count as practice, but not unaided recall.</small>
          </section>}
        </div>

        <h3>Recommended next steps</h3>
        <p>Practise saved responses, prepare replies from your games, or use Lichess samples at your level.</p>
        {recommendationLoading ? <div className="opening-home-primary" role="status">
          <strong>Preparing your practice suggestions…</strong>
          <p>Your library is ready. You can browse a repertoire or build a line while suggestions load.</p>
        </div> : recommendation?.available && repertoire ? (
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
              {offerLearning ? <>
                <button className="secondary" disabled={busy} onClick={onLearnFirst}>Learn new moves first</button>
                <small>See up to {Math.min(learnableResponses,preferences?.newMovesPerSession??5,activity?.remaining??10)} new saved answers, then recall them with the answers hidden.</small>
              </> : <button className="secondary" disabled={busy} onClick={() => onStartRun(repertoire.id)}>
                Practise a varied line
              </button>}
            </div>
          </div>
        ) : (
          <div className="opening-home-primary empty">
            <div>
              <span className="eyebrow">Ready when you are</span>
              <h3>{libraryEmpty ? "Your opening library is empty" : activity?.goalReached ? "Your daily practice is complete" : "No scheduled positions right now"}</h3>
              <p>{libraryEmpty ? "Build moves on the board, paste opening lines as PGN, or bring in your Lichess Study. Then practise the moves and their ideas." : activity?.goalReached ? "Come back tomorrow, or open a repertoire to practise extra moves or a complete line." : recommendation?.message ?? "Practice suggestions could not be loaded yet. Retry the summary or open a saved line to practise it directly."}</p>

            </div>
          </div>
        )}

          {progress && progress.totalLines > 0 && (
            <div className="opening-home-progress" aria-label={`${progress.masteredLines} of ${progress.totalLines} opening lines secure for now`}>
              <span><i style={{ width: `${masteredPercent}%` }} /></span>
              <small><strong>{progress.masteredLines} of {progress.totalLines}</strong> lines secure for now</small>
            </div>
          )}
        {coverage?.personal?.replyOccurrences ? <p className="opening-home-coverage-summary">
          <strong>Your games: {coverage.personal.preparedPercent}% of observed replies prepared</strong> · {coverage.personal.preparedReplyOccurrences}/{coverage.personal.replyOccurrences} replies at saved positions.
          <br />Lichess {coverage.ratingGroup} band: {preferences?.useExplorer ? `${coverage.evidence?.freshPositions ?? 0} fresh position samples` : "frequency data is off"}.
        </p> : null}
        <div className="opening-home-actions">
          {onAnalyzeGame && (
            <button className="opening-home-action primary-route" onClick={onAnalyzeGame}>
              <span><b>Analyse a played game</b><small>{libraryEmpty ? "Paste a game PGN for local analysis. Add a repertoire to compare your opening moves." : "Paste a game PGN or sync Lichess, then compare it with your repertoire."}</small></span>
              <strong>Paste PGN →</strong>
            </button>
          )}
          {recommendation && recommendation.counts.gameMisses > 0 && onOpenGames && (
            <button className="opening-home-action" onClick={onOpenGames}>
              <span><b>Repair game misses</b><small>{recommendation.counts.gameMisses} position{recommendation.counts.gameMisses === 1 ? "" : "s"} from your play</small></span>
              <strong>Review →</strong>
            </button>
          )}
          {!libraryEmpty && (
            <button className="opening-home-action" disabled={coverageLoading || !gap} onClick={() => gap && onOpenGap(gap)}>
              <span><b>{coverageLoading ? "Checking common replies…" : gap ? `Consider ${gap.moveSan}` : "No evidenced preparation gap yet"}</b><small>{gap ? `${gap.lineTitle} · ${gap.games > 0 ? frequencyLabel(gap.frequencyPercent) : "frequency unknown"}` : coverage?.personal?.gamesChecked ? "No unsaved priority reply was found in these games and samples. Inspect a repertoire to check more positions." : "Import or sync your games to find replies you have faced. Lichess samples can identify other common replies."}</small></span>
              <strong>{gap ? "Consider response →" : "—"}</strong>
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

        {preferences && !preferences.useExplorer && <div className="opening-recommendation-setup" role="region" aria-label="Lichess recommendation setup">
          <strong>{preferences.explorerAvailable ? "Add rating-based Lichess suggestions" : "Lichess frequency data needs setup"}</strong>
          <p>{preferences.explorerAvailable ? "Enable practical frequencies and choose your Lichess rating band in Opening settings." : "Your games still provide preparation recommendations. Add a Lichess API token to the server to also rank common replies at your level."}</p>
          <button className="secondary" onClick={onSettings}>Open recommendation settings</button>
        </div>}

      </section>
    </div>
  );
}
