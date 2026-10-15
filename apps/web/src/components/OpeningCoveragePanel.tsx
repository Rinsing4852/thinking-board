import { useEffect, useId, useState } from "react";
import type { OpeningCoverageBranch, OpeningCoverageGap, OpeningCoverageResponse } from "../../../../packages/contracts/src/api";

const labels: Record<OpeningCoverageBranch["status"], string> = {
  prepared: "Prepared · recall tested", needs_practice: "Needs practice", missing_response: "Missing response",
  idea_only: "Idea only", unprepared: "Deliberately unprepared", unknown: "Evidence unknown",
};

interface Props {
  coverage: OpeningCoverageResponse | null; busy: boolean; disabled: boolean; useExplorer: boolean;
  notice: { error: boolean; message: string } | null;
  rating: number; throughMove: number; routeId: string;
  lines: Array<{ id: string; title: string }>;
  onScope: (rating: number, depth: number, routeId: string) => void;
  onLoad: (offset?: number, refresh?: boolean) => void;
  onInspect: (gap: OpeningCoverageGap) => void;
  onPractice: (lineId: string, moveId?: string) => void;
  onBoundary: (positionId: string, value: boolean) => void;
}

export function OpeningCoveragePanel({ coverage, busy, disabled, useExplorer, notice, rating, throughMove, routeId,
  lines, onScope, onLoad, onInspect, onPractice, onBoundary }: Props) {
  const [filter, setFilter] = useState("actionable");
  const [showAll, setShowAll] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [depthText, setDepthText] = useState(String(throughMove));
  const depthHelpId = useId();
  useEffect(() => setShowAll(false), [coverage?.repertoireId, rating, throughMove, routeId]);
  useEffect(() => setDepthText(String(throughMove)), [throughMove]);
  const depth = Number(depthText);
  const validDepth = depthText.trim() !== "" && Number.isInteger(depth) && depth >= 1 && depth <= 30;
  const locked = busy || disabled || !validDepth;
  const model = coverage?.model;
  const evidence = coverage?.evidence;
  const positions = coverage?.positions ?? [];
  const responses = new Map(positions.filter(position => position.inScope !== false && !position.boundary).flatMap(position => position.branches)
    .filter(branch => branch.responseMoveId).map(branch => [branch.responseMoveId, branch]));
  const tested = [...responses.values()].filter(branch => (branch.recallAttempts ?? 0) > 0);
  const retained = [...responses.values()].filter(branch => branch.status === "prepared");
  const candidates = coverage?.gaps.filter(gap => gap.status !== "unprepared"
    && (gap.status !== "unknown" || (gap.personalFrequency?.games ?? gap.preparation?.personal.occurrences ?? 0) > 0)) ?? [];
  const toPractise = candidates.filter(gap => gap.status === "needs_practice").length;
  const toFinish = candidates.filter(gap => gap.status === "idea_only").length;
  const toAdd = candidates.length - toPractise - toFinish;
  const tasks = showAll ? candidates : candidates.slice(0, 3);
  const responseTitles = new Map(lines.map(line => [line.id, line.title]));
  const matchesFilter = (branch: OpeningCoverageBranch) => filter === "all" || branch.status === filter
    || filter === "actionable" && !["prepared", "unprepared"].includes(branch.status);
  const visiblePositions = positions.filter(position => position.branches.some(matchesFilter) || filter === "all"
    || filter === "actionable" && (position.boundary || position.sampleStatus !== "fresh"));
  return <section className="opening-coverage-panel" aria-label="Repertoire coverage and gaps">
    <h3>What should I work on?</h3>
    <p>Practise answers you have saved, or add an answer to an opponent reply you have not prepared for.</p>
    <button className="secondary" disabled={locked} onClick={() => onLoad()}>{busy ? "Checking…" : coverage ? "Recheck coverage" : "Check coverage"}</button>
    <details className="opening-coverage-settings"><summary>Change line, move limit or rating</summary>
    <div className="opening-coverage-controls">
      <label>Line to check<select value={routeId} disabled={disabled} onChange={event => onScope(rating, throughMove, event.target.value)}>
        {lines.map(line => <option value={line.id} key={line.id}>{line.title}</option>)}
      </select></label>
      <label>Prepare through my move<input type="number" min={1} max={30} step={1} value={depthText} disabled={disabled}
        aria-invalid={!validDepth} aria-describedby={!validDepth ? depthHelpId : undefined}
        onChange={event => {
          setDepthText(event.target.value);
          const value = Number(event.target.value);
          if (event.target.value !== "" && Number.isInteger(value) && value >= 1 && value <= 30) onScope(rating, value, routeId);
        }} /></label>
      <label>Lichess rating<select value={rating} disabled={disabled} onChange={event => onScope(Number(event.target.value), throughMove, routeId)}>
        {[1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500].map(value => <option value={value} key={value}>{value} band</option>)}
      </select></label>
    </div>
    {!validDepth && <p className="error" id={depthHelpId}>Enter a whole move number from 1 to 30.</p>}
    <div className="answer-actions">
      {useExplorer && evidence && evidence.remainingPositions > 0 && <button disabled={locked}
        onClick={() => onLoad(evidence.nextOffset ?? 0, evidence.scanMode === "refresh")}>Continue scan · {evidence.remainingPositions} positions left</button>}
      {useExplorer && coverage && <button className="secondary" disabled={locked} onClick={() => onLoad(0, true)}>Refresh older / current samples</button>}
    </div>
    </details>
    {notice && <p className={notice.error ? "error" : "status"} role={notice.error ? "alert" : "status"}>{notice.message}</p>}
    {!useExplorer && <p className="opening-coverage-note">Common-move data is off. You can still find saved responses and practise them. Enable practical frequencies in Opening settings to estimate how often replies occur.</p>}
    {coverage && <>
      {coverage.personal && <section className="opening-personal-coverage" aria-label="Coverage from your games">
        <h4>What happened in your games</h4>
        <p>{coverage.personal.replyOccurrences ? <><strong>{coverage.personal.preparedPercent}%</strong> of opponent replies seen at your saved positions had an answer in your repertoire · {coverage.personal.preparedReplyOccurrences}/{coverage.personal.replyOccurrences} observations.</> : "No opponent replies from your recent games reached these saved positions yet."}</p>
        <details><summary>Which games does this use?</summary><p>Up to 100 recent imported games for this side, at positions already in your repertoire and within the selected move limit. Each position counts once per game. This does not mean the same percentage of entire games is prepared.</p></details>
      </section>}
      <h4>Start here</h4>
      <p>These are tasks, not a count of chess mistakes. You do not need to complete everything at once.</p>
      <ul className="opening-coverage-task-counts" aria-label="Types of next steps">
        {toPractise > 0 && <li><strong>{toPractise}</strong> saved {toPractise === 1 ? "response" : "responses"} to practise</li>}
        {toAdd > 0 && <li><strong>{toAdd}</strong> opponent {toAdd === 1 ? "reply" : "replies"} without a saved answer</li>}
        {toFinish > 0 && <li><strong>{toFinish}</strong> {toFinish === 1 ? "idea" : "ideas"} to review</li>}
      </ul>
      <div className="opening-coverage-tasks">{tasks.map(gap => <article key={`${gap.positionId}:${gap.moveUci}`}>
        <strong>{gap.status === "needs_practice" ? "Practise your response to" : gap.status === "idea_only" ? "Review your idea for" : "Consider a response to"} {gap.moveSan}</strong>
        <p>{gap.responseLineId && responseTitles.get(gap.responseLineId) || `${gap.chapterTitle} · ${gap.lineTitle}`}</p>
        <p>{gap.status === "needs_practice"
          ? (gap.recallAttempts ?? 0) === 0 ? "Your answer is already saved. It has not been tested in practice yet." : "Your answer is already saved. Practise recalling it without a hint."
          : gap.status === "idea_only" ? "You saved an idea, but no response move. Check whether you want to add one."
          : "This opponent reply has no saved answer. Open the position and choose what you would play."}</p>
        {(gap.personalFrequency?.games ?? gap.preparation?.personal.occurrences ?? 0) > 0 && <small>Seen {gap.personalFrequency?.games ?? gap.preparation?.personal.occurrences} times in your recent games.</small>}
        <div className="answer-actions"><button className="secondary" disabled={locked} onClick={() => onInspect(gap)}>Inspect position</button>
          {gap.status === "needs_practice" && <button disabled={locked || !gap.responseLineId}
            onClick={() => onPractice(gap.responseLineId!, gap.responseMoveId ?? undefined)}>Practise response</button>}</div>
      </article>)}</div>
      {!tasks.length && <p>No next step found in the checked games and positions. You can still practise a saved line or check another line.</p>}
      {candidates.length > 3 && <button className="text-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show just three tasks" : `See all ${candidates.length} practice and preparation tasks`}</button>}
<details className="opening-coverage-details" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}><summary>Detailed estimates and practice history</summary>
      {model && <>
        <h4>Can this line handle replies until your move {model.throughMove}?</h4>
        <p>This estimate follows your selected line against replies sampled from Lichess. It stops each possible sequence at the first reply without a saved answer, or at a stopping point you chose.</p>
        <p><strong>{model.preparedPercent}%</strong> of the estimated sequences reach that limit or a chosen stopping point. This is not the percentage of moves you know, your win chance, or your practice score.</p>
        <div className="opening-coverage-bar" aria-label={`Saved responses or stopping points ${model.preparedPercent}%, missing responses ${model.missingPercent}%, idea only ${model.ideaPercent}%, deliberately unprepared ${model.unpreparedPercent}%, unknown ${model.unknownPercent}%`}>
          {[["prepared", model.preparedPercent], ["missing_response", model.missingPercent], ["idea_only", model.ideaPercent],
            ["unprepared", model.unpreparedPercent], ["unknown", model.unknownPercent]].map(([status, percent]) =>
            <span key={status} className={`coverage-${status}`} style={{ flexGrow: Number(percent) }} />)}
        </div>
        <ul className="opening-coverage-legend">
          <li><span className="coverage-prepared" aria-hidden="true" />Saved responses / stopping points: {model.preparedPercent}%</li>
          <li><span className="coverage-missing_response" aria-hidden="true" />Missing response: {model.missingPercent}%</li>
          <li><span className="coverage-idea_only" aria-hidden="true" />Idea only: {model.ideaPercent}%</li>
          <li><span className="coverage-unprepared" aria-hidden="true" />Deliberately unprepared: {model.unpreparedPercent}%</li>
          <li><span className="coverage-unknown" aria-hidden="true" />Unknown: {model.unknownPercent}%</li>
        </ul>
        {model.unknownPercent > 0 && <p className="opening-coverage-note">Unknown means there is not enough reliable frequency data—not that {model.unknownPercent}% of your repertoire is missing.</p>}
        <details><summary>How this estimate works</summary><p>{model.assumptions}</p>
          <p>A path stops at its first missing response or your chosen stopping point. The estimate is not a win rate or a memory score. Changing your intended route changes your own-move policy, not saved moves. Percentages may differ from 100% slightly after rounding.</p></details>
      </>}
      <div className="opening-coverage-recall">
        <strong>Memory is separate from preparation</strong>
        <p>{tested.length}/{responses.size} distinct saved responses tested · {retained.length} with reliable first-try recall.</p>
        <details><summary>Recall and sample details</summary>
          <p>“Recall tested” requires at least 3 recent first-try encounters and 80% unaided recall. Hints, corrections and immediate repeats do not count as remembered answers. This is a practice indicator, not guaranteed retention.</p>
          {evidence && <p><strong>Sample evidence:</strong> {evidence.freshPositions} fresh, {evidence.stalePositions} old, {evidence.smallSamplePositions} small and {evidence.missingPositions} missing samples · {evidence.totalPositions} distinct saved positions within this depth. Some belong to other own-move routes or lie beyond stopping points.</p>}
          <p>{coverage.message}</p>
        </details>
      </div>
      {coverage.personal && <details><summary>Evidence from your games · {coverage.personal.gamesMatched} matching games</summary>
        <p>Checked {coverage.personal.gamesChecked} recent imported games for this colour, including pasted and synced games. {coverage.personal.gamesMatched} reached this repertoire.</p>
        <ul><li>You left a saved move: {coverage.personal.playerDeviations}</li><li>Opponent left a saved move: {coverage.personal.opponentDeviations}</li>
          <li>Saved preparation ended: {coverage.personal.repertoireEnded}</li><li>Stayed in preparation until the game ended: {coverage.personal.stayedIn}</li></ul>
        <p>These describe the first departure from this repertoire, not a chess mistake or win rate. They cover your saved lines, independently of the estimate's selected depth.</p>
      </details>}
      </details>
      <details className="opening-coverage-map"><summary>Explore branches and stopping points · {positions.length} positions</summary>
        <label>Show branches<select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="actionable">Needs attention</option><option value="all">All branches</option>
          {Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></label>
        <p>Each shared position appears once. Frequency is conditional on reaching that position; path exposure uses your chosen route. Open a position to inspect its replies.</p>
        {!visiblePositions.length && <p>No positions match this filter. Choose All branches to see the saved positions.</p>}
        {visiblePositions.map(position => {
          const branches = position.branches.filter(matchesFilter);
          const fields = position.fen.split(" ");
          return <details className="opening-coverage-node" key={position.positionId}>
            <summary>{position.chapterTitle} · {position.lineTitle} · before {fields[5]}{fields[1] === "b" ? "…" : "."}
              {position.boundary ? " · preparation stops here" : position.inScope === false ? " · outside chosen route / stopping point" : position.sampleStatus === "missing" ? " · frequency unknown" : ` · ${position.sampleStatus} sample`}</summary>
            <p className="opening-coverage-path">{position.pathSan || "Starting position"}</p>
            <p>{position.sampledGames.toLocaleString()} sampled games{position.fetchedAt ? ` · sampled ${new Date(position.fetchedAt).toLocaleDateString()}` : ""}</p>
            <button className="secondary" disabled={locked} onClick={() => onBoundary(position.positionId, !position.boundary)}>
              {position.boundary ? "Include this position again" : "Prepared enough — stop here"}</button>
            <p>Stops the coverage estimate here. It does not delete moves, stop practice or prove you remember them.</p>
            {branches.map(branch => <article className={`opening-coverage-branch coverage-${branch.status}`} key={branch.moveUci}>
              <strong>{branch.moveSan} · {labels[branch.status]}</strong>
              <p>{branch.games > 0 ? `${branch.frequencyPercent}% at this position${!branch.reliable ? " · uncertain sample" : ""}` : "Reply frequency unknown"}
                {branch.reachPercent != null ? ` · ${branch.reachPercent}% estimated exposure` : " · exposure unknown / outside route"}</p>
              {branch.responseSan && <p>Saved response: {branch.responseSan} · {branch.recallPercent == null ? "recall untested" : `${branch.recallPercent}% unaided (${branch.recallAttempts} first attempts)`}
                {!branch.practiceEnabled && " · paused for automatic practice"}</p>}
              <div className="answer-actions"><button className="secondary" disabled={locked || position.boundary} onClick={() => onInspect(branch)}>Inspect reply</button>
                {branch.responseLineId && <button disabled={locked} onClick={() => onPractice(branch.responseLineId!)}>Practise saved line</button>}</div>
            </article>)}
            {!branches.length && <p>No sampled replies match this filter. Unknown data does not mean there are no replies.</p>}
          </details>;
        })}
      </details>
    </>}
  </section>;
}
