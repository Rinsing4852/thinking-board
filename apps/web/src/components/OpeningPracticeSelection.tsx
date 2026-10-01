import { useEffect, useMemo, useRef, useState } from "react";
import type { OpeningLineFrequencyBand, OpeningPracticeSelectionResponse, OpeningRepertoireDetailResponse } from "../../../../packages/contracts/src/api";
import { get, patch, post } from "../api";
import { buildOpeningNavigation } from "../opening-navigation";

interface Props {
  detail: OpeningRepertoireDetailResponse;
  disabled: boolean;
  onOpenLine: (lineId: string) => void;
  onChanged: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}

export function OpeningPracticeSelection({ detail, disabled, onOpenLine, onChanged, onBusyChange }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<OpeningPracticeSelectionResponse | null>(null);
  const [filter, setFilter] = useState<OpeningLineFrequencyBand | "all">("all");
  const [sort, setSort] = useState("chapter");
  const [busy, setBusy] = useState(false);
  const [frequencyBusy, setFrequencyBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const mutation = useRef<AbortController | null>(null);
  const navigation = useMemo(() => buildOpeningNavigation(detail.chapters), [detail.chapters]);
  const path = `/api/v1/openings/repertoires/${detail.repertoire.id}/practice-selection`;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setLoading(true); setError("");
    void get<OpeningPracticeSelectionResponse>(path, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(problem => { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : "Could not load practice selection"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, path, detail, reload]);
  useEffect(() => () => mutation.current?.abort(), []);
  const lines = (data?.lines ?? []).filter(evidence => !navigation.lines.get(evidence.lineId)?.line.archived
    && (filter === "all" || evidence.frequency.band === filter));
  if (sort === "frequency") lines.sort((a, b) => Number(a.frequency.band === "unknown") - Number(b.frequency.band === "unknown")
    || (b.frequency.percent ?? -1) - (a.frequency.percent ?? -1));
  if (sort === "recall") lines.sort((a, b) => (a.recall?.accuracyPercent ?? -1) - (b.recall?.accuracyPercent ?? -1));
  if (sort === "due") lines.sort((a, b) => (b.recall?.due ?? 0) - (a.recall?.due ?? 0));
  const activeCount = detail.chapters.flatMap(chapter => chapter.lines).filter(line => !line.archived).length;
  const enabledCount = detail.chapters.flatMap(chapter => chapter.lines).filter(line => !line.archived && line.practiceEnabled !== false).length;
  const locked = disabled || busy || loading;
  const run = async (ids?: string[], enabled?: boolean): Promise<void> => {
    if (locked) return;
    const controller = new AbortController(); mutation.current = controller;
    setBusy(true); setFrequencyBusy(!ids); onBusyChange(true); setError("");
    const previousData = data;
    if (ids && data) {
      const selected = new Set(ids);
      const updated = data.lines.map(line => selected.has(line.lineId) ? { ...line, enabled: Boolean(enabled) } : line);
      setData({ ...data, lines: updated, enabledCount: updated.filter(line => line.enabled).length });
    }
    try {
      let result = ids ? await patch<OpeningPracticeSelectionResponse>(path, { lineIds: ids, enabled }, controller.signal)
        : await post<OpeningPracticeSelectionResponse>(`${path}/frequencies`, {}, controller.signal);
      if (controller.signal.aborted) return;
      setData(result);
      if (!ids) {
        let previousRemaining = data?.remainingPositions ?? Number.MAX_SAFE_INTEGER;
        // Continue explicit loading in bounded batches; stop on no progress/rate limits.
        while (result.remainingPositions > 0 && result.remainingPositions < previousRemaining) {
          previousRemaining = result.remainingPositions;
          result = await post<OpeningPracticeSelectionResponse>(`${path}/frequencies`, {}, controller.signal);
          if (controller.signal.aborted) return;
          setData(result);
        }
      }
      if (ids) await onChanged();
    } catch (problem) {
      if (!controller.signal.aborted) {
        if (ids) setData(previousData);
        setError(problem instanceof Error ? `${problem.message} Reload selection to confirm the saved state.` : "Could not save practice selection. Reload and try again.");
      }
    } finally { if (!controller.signal.aborted) { setBusy(false); setFrequencyBusy(false); onBusyChange(false); } }
  };
  return <details className="panel opening-practice-selection" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Practice selection and recall · {enabledCount}/{activeCount} lines on</summary>
    <p>Switch lines off to skip them in automatic practice. They stay in your library and game analysis; shared moves still practise when another enabled line needs them. You can deliberately practise any line once.</p>
    <p>Changes end any paused session for this repertoire, keeping recorded answers. Choices apply only to the current player.</p>
    {loading && <p role="status">Loading line evidence…</p>}
    {error && <div role="alert"><p className="error">{error}</p><button className="secondary" disabled={busy} onClick={() => setReload(value => value + 1)}>Reload selection</button></div>}
    {data && <>
      <div className="opening-selection-filters">
        <label>Opponent-reply frequency<select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
          <option value="all">All lines</option><option value="common">Common · 5% or more</option>
          <option value="uncommon">Uncommon · 1–5%</option><option value="rare">Rare · below 1%</option><option value="unknown">Unknown</option>
        </select></label>
        <label>Sort lines<select value={sort} onChange={event => setSort(event.target.value)}>
          <option value="chapter">Chapter order</option><option value="frequency">Most common first</option>
          <option value="recall">Weakest recall first</option><option value="due">Most reviews due</option>
        </select></label>
      </div>
      <details className="opening-frequency-help"><summary>What do frequency and recall mean?</summary>
        <p>Frequency uses the least-common opponent reply in each saved line, at its own position in the {data.ratingGroup} Lichess band. It is not the chance of reaching the entire line. All opponent replies need a fresh sample of at least 200 games and 5 observations of the reply; otherwise the line is Unknown. Filters only change this list, not practice participation.</p>
        <p>Move recall is unaided accuracy from up to 20 recent answers per saved move; shared moves contribute to multiple lines. Full-line recall counts up to 20 completed exact-line runs matching the current moves. Partial, unfinished and guided study sessions do not count. Hints, shown answers and corrected mistakes are not unaided recall.</p>
      </details>
      <div className="opening-selection-actions">
        <button className="secondary" disabled={locked || !lines.some(line => line.enabled)} onClick={() => void run(lines.map(line => line.lineId), false)}>Pause filtered lines ({lines.length})</button>
        <button className="secondary" disabled={locked || !lines.some(line => !line.enabled)} onClick={() => void run(lines.map(line => line.lineId), true)}>Include filtered lines ({lines.length})</button>
        {data.useExplorer && <button className="secondary" disabled={locked || data.remainingPositions === 0} onClick={() => void run()}>
          {busy ? `Loading / saving · ${data.remainingPositions} positions left` : `Load reply frequencies${data.remainingPositions ? ` · ${data.remainingPositions} positions left` : ""}`}</button>}
        {frequencyBusy && <button className="secondary" onClick={() => { mutation.current?.abort(); setBusy(false); setFrequencyBusy(false); onBusyChange(false); setReload(value => value + 1); }}>Stop loading frequencies</button>}
      </div>
      {!data.useExplorer && <p>Enable practical frequencies in Opening settings to load Lichess samples. Practice switches and recall work offline.</p>}
      {data.message && <p role="status">{data.message}</p>}
      {enabledCount === 0 && <p className="opening-navigation-lock">No lines are turned on. Include a line to resume automatic practice, or open a line and practise it once.</p>}
      <p>{lines.length} of {activeCount} active lines shown.</p>
      <div className="opening-selection-lines">{lines.map(evidence => {
        const reference = navigation.lines.get(evidence.lineId);
        if (!reference) return null;
        const title = navigation.branches.get(evidence.lineId)?.title ?? reference.line.title;
        const recall = evidence.recall;
        return <article className="opening-selection-line" key={evidence.lineId}>
          <div className="opening-selection-heading"><button className="text-button" disabled={locked} onClick={() => onOpenLine(evidence.lineId)}>{reference.chapterTitle} · {title}</button>
            <label><input type="checkbox" checked={evidence.enabled} disabled={locked} onChange={event => void run([evidence.lineId], event.target.checked)} aria-label={`Practise ${reference.chapterTitle} · ${title}`} />Practise</label></div>
          <small>{evidence.frequency.band === "unknown" ? `Frequency unknown · ${evidence.frequency.knownReplies}/${evidence.frequency.totalReplies} replies sampled`
            : `${evidence.frequency.band} · ${evidence.frequency.moveLabel}: ${evidence.frequency.percent}% at that position · ${evidence.frequency.sampleGames} sampled games`}</small>
          <p>{recall?.accuracyPercent === null || !recall ? "Move recall: not tested yet" : `Move recall: ${recall.accuracyPercent}% unaided · ${recall.recallAttempts ?? 0} recent answers`}</p>
          <small>{recall?.testedDecisions ?? 0}/{recall?.decisions ?? reference.line.learnerDecisionCount} moves tested · shared moves included</small><br />
          <small>{recall?.mastered ?? 0}/{recall?.decisions ?? reference.line.learnerDecisionCount} moves secure · {recall?.due ?? 0} due
            {recall?.averageResponseMs != null ? ` · ${(recall.averageResponseMs / 1000).toFixed(1)}s average` : ""}</small>
          <p>{evidence.fullRuns.completed ? `Full-line recall: ${evidence.fullRuns.accuracyPercent}% unaided · ${evidence.fullRuns.unaided}/${evidence.fullRuns.completed} completed runs`
            : "Full-line recall: no completed full runs yet"}</p>
        </article>;
      })}</div>
      {!lines.length && <p>No lines match this filter. Try All lines or Unknown.</p>}
    </>}
  </details>;
}
