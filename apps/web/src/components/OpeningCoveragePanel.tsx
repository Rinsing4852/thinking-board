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
  const [depthText, setDepthText] = useState(String(throughMove));
  const depthHelpId = useId();
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
    && (gap.status !== "unknown" || (gap.preparation?.personal.occurrences ?? 0) > 0)) ?? [];
  const tasks = showAll ? candidates : candidates.slice(0, 5);
  const responseTitles = new Map(lines.map(line => [line.id, line.title]));
  const matchesFilter = (branch: OpeningCoverageBranch) => filter === "all" || branch.status === filter
    || filter === "actionable" && !["prepared", "unprepared"].includes(branch.status);
  const visiblePositions = positions.filter(position => position.branches.some(matchesFilter) || filter === "all"
    || filter === "actionable" && (position.boundary || position.sampleStatus !== "fresh"));
  return <section className="opening-coverage-panel" aria-label="Repertoire coverage and gaps">
    <h3>Preparation and recall</h3>
    <p>Find missing responses—or practise moves you already saved. You do not need a line for every legal move.</p>
    <div className="opening-coverage-controls">
      <label>My intended route<select value={routeId} disabled={disabled} onChange={event => onScope(rating, throughMove, event.target.value)}>
        {lines.map(line => <option value={line.id} key={line.id}>{line.title}</option>)}
      </select></label>
      <label>Prepare through my move<input type="number" min={1} max={30} step={1} value={depthText} disabled={disabled}
        aria-invalid={!validDepth} aria-describedby={!validDepth ? depthHelpId : undefined}
        onChange={event => {
          setDepthText(event.target.value);
          const value = Number(event.target.value);
          if (event.target.value !== "" && Number.isInteger(value) && value >= 1 && value <= 30) onScope(rating, value, routeId);
        }} /></label>
      <label>Explorer rating<select value={rating} disabled={disabled} onChange={event => onScope(Number(event.target.value), throughMove, routeId)}>
        {[1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500].map(value => <option value={value} key={value}>{value} band</option>)}
      </select></label>
    </div>
    {!validDepth && <p className="error" id={depthHelpId}>Enter a whole move number from 1 to 30.</p>}
    <div className="answer-actions">
      <button className="secondary" disabled={locked} onClick={() => onLoad()}>{busy ? "Checking…" : coverage ? "Recheck coverage" : "Check coverage"}</button>
      {useExplorer && evidence && evidence.remainingPositions > 0 && <button disabled={locked}
        onClick={() => onLoad(evidence.nextOffset ?? 0, evidence.scanMode === "refresh")}>Continue scan · {evidence.remainingPositions} positions left</button>}
      {useExplorer && coverage && <button className="secondary" disabled={locked} onClick={() => onLoad(0, true)}>Refresh older / current samples</button>}
    </div>
    {notice && <p className={notice.error ? "error" : "status"} role={notice.error ? "alert" : "status"}>{notice.message}</p>}
    {!useExplorer && <p className="opening-coverage-note">Common-move data is off. You can still find saved responses and practise them. Enable practical frequencies in Opening settings to estimate how often replies occur.</p>}
    {coverage && <>
      {model && <>
        <h4>Estimated prepared paths through your move {model.throughMove}</h4>
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
      <h4>Best next improvements</h4>
      <p>Start with these replies. Priority comes from your games, how often a reply occurs and how well you remember your response.</p>
      <div className="opening-coverage-tasks">{tasks.map(gap => <article key={`${gap.positionId}:${gap.moveUci}`}>
        <strong>{gap.status === "needs_practice" ? "Practise your response to" : gap.status === "idea_only" ? "Review your idea for" : "Consider a response to"} {gap.moveSan}</strong>
        <p>{gap.responseLineId && responseTitles.get(gap.responseLineId) || `${gap.chapterTitle} · ${gap.lineTitle}`}</p>
        <p>{gap.reachPercent == null ? "Likelihood not measured for this route" : `Estimated chance of reaching this reply: ${gap.reachPercent}%`}
          {gap.preparation?.personal.occurrences ? ` · seen in ${gap.preparation.personal.occurrences} of your recent games` : ""}
          {gap.preparation?.personal.responseMistakes ? ` · ${gap.preparation.personal.responseMistakes} response mistakes` : ""}</p>
        {gap.status === "needs_practice" && <p>{gap.recallPercent == null ? "Response saved; recall not tested yet" : `${gap.recallPercent}% unaided recall · ${gap.recallAttempts} first attempts`}</p>}
        <div className="answer-actions"><button className="secondary" disabled={locked} onClick={() => onInspect(gap)}>Inspect position</button>
          {gap.status === "needs_practice" && <button disabled={locked || !gap.responseLineId}
            onClick={() => onPractice(gap.responseLineId!, gap.responseMoveId ?? undefined)}>Practise response</button>}</div>
      </article>)}</div>
      {!tasks.length && <p>No evidenced preparation or memory gaps found in this scope. Check unknown samples before assuming you are fully prepared.</p>}
      {candidates.length > 5 && <button className="text-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show top five" : `Show all ${candidates.length} improvements`}</button>}
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
