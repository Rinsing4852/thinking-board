import { useRef, useState } from "react";
import type { GamePracticeFilter, GameReplayAction, GameReplayResponse } from "../../../../packages/contracts/src/api";
import { selectGamePractice } from "../../../../packages/contracts/src/game-practice";

const labels: Record<GamePracticeFilter, string> = {
  recommended: "Recommended", mistakes: "Analysed mistakes", opening: "Opening recall", attacking:"Attacking", defending:"Defending", mates:"Missed mates",
};

export function GamePracticeControls({ data, blocked, onAction }: {
  data: GameReplayResponse; blocked: boolean;
  onAction: (action: GameReplayAction["action"], details?: Pick<GameReplayAction, "filters" | "maxMateIn">) => void;
}) {
  const [filters, setFilters] = useState<GamePracticeFilter[]>(data.practice?.filters ?? ["recommended"]);
  const [maxMateIn,setMaxMateIn]=useState(data.practice?.maxMateIn??data.maxMateIn??2);
  const options = useRef<HTMLDetailsElement>(null);
  const round = data.practice, active = round?.status === "active";
  const selected = selectGamePractice(data.checkpoints, filters,maxMateIn);
  const start = () => {
    if (options.current) options.current.open = false;
    onAction("practice_start", { filters, maxMateIn });
  };
  const toggle = (filter: GamePracticeFilter, checked: boolean) => {
    setFilters(current => checked ? filter === "recommended" ? [filter]
      : [...current.filter(value => value !== "recommended" && value !== filter), filter]
      : current.filter(value => value !== filter));
  };
  return <section className="game-practice-controls" aria-label="Practise from this game">
    <details ref={options} className="game-practice-options">
    <summary>Choose practice · {filters.length ? filters.map(filter => labels[filter]).join(" + ") : "Choose a category"}</summary>
    <fieldset disabled={blocked || active}>
      <legend>Practice categories</legend>
      <div className="game-practice-filters">
        {(Object.keys(labels) as GamePracticeFilter[]).map(filter => {
          const count = selectGamePractice(data.checkpoints, [filter],maxMateIn).length;
          return <label key={filter}><input type="checkbox" disabled={["attacking","defending","mates"].includes(filter)&&!data.tacticalEvidenceAvailable} checked={filters.includes(filter)}
            onChange={event => toggle(filter, event.target.checked)} />{labels[filter]} <span>({count})</span></label>;
        })}
      </div>
      <label>Maximum mating length<select value={maxMateIn} onChange={event=>setMaxMateIn(Number(event.target.value))}>{[1,2,3,4].map(value=><option key={value} value={value}>Mate in {value}</option>)}</select></label>
      <small>Counts your moves to deliver mate, with the opponent defending. Longer or unverified mates stay in analysis.</small>
      {!data.tacticalEvidenceAvailable&&!data.analysisPending&&<small>Refresh saved feedback to enable verified tactical filters.</small>}
    </fieldset>
    </details>
    {!active && round?.status !== "completed" && <>
      <p>{selected.length} {selected.length === 1 ? "position" : "positions"} · {filters.length ? filters.map(filter => labels[filter]).join(" + ") : "Choose a category"}</p>
      {!selected.length && <p>No saved answers match this selection.</p>}
      <button disabled={blocked || !selected.length} onClick={start}>Start practice</button>
    </>}
    {active && <div className="game-practice-progress" role="status">
      <strong>Position {round.checkpointIds.indexOf(data.activeCheckpointId ?? "") + 1} of {round.checkpointIds.length}</strong>
      <span>{round.reviewedIds.length} reviewed · {round.skippedIds.length} skipped</span>
      <button className="secondary" disabled={blocked} onClick={() => onAction("practice_exit")}>Exit practice</button>
    </div>}
    {round?.status === "completed" && <div className="game-practice-progress" role="status">
      <strong>Practice finished</strong><span>{round.reviewedIds.length} reviewed · {round.skippedIds.length} skipped</span>
      <button disabled={blocked || !selected.length} onClick={start}>Start another practice</button>
      <button className="secondary" disabled={blocked} onClick={() => onAction("practice_exit")}>Back to full replay</button>
      <small>Reviewed means you tried or saw the answer. It does not prove mastery.</small>
    </div>}
    {data.analysisPending ? <small>Engine analysis is not included in this saved review. Opening recall is available where taught; analyse and refresh saved feedback to include mistakes.</small>
      : filters.includes("opening") && filters.includes("mistakes") ? <small>Shared positions appear once, using the engine answer. Opening recall on its own uses your repertoire.</small>
      : filters.includes("recommended") ? <small>A short selection of saved decisions. Try first, then request help if needed.</small> : null}
  </section>;
}
