import type { OpeningNavigation } from "../opening-navigation";
import { currentPositionRoutes, openingMoveLabel, otherMoveOrders, savedContinuations } from "../opening-navigation";

interface Props {
  index: OpeningNavigation;
  lineId: string;
  ply: number;
  disabled: boolean;
  onNavigate: (lineId: string, ply: number) => void;
  previous: { lineId: string; ply: number } | null;
  onReturn: () => void;
}

export function OpeningBranchNavigation({ index, lineId, ply, disabled, onNavigate, previous, onReturn }: Props) {
  const line = index.lines.get(lineId)?.line;
  if (!line) return null;
  const branch = index.branches.get(lineId);
  const choices = savedContinuations(index, lineId, ply);
  const otherOrders = otherMoveOrders(index, lineId, ply);
  const lineCount = new Set(currentPositionRoutes(index, lineId, ply)
    .filter(route => !index.lines.get(route.lineId)?.line.archived).map(route => route.lineId)).size;
  return <section className="opening-branch-navigation" aria-label="Saved continuations">
    <div className="opening-branch-heading">
      <div><span className="eyebrow">{choices.length > 1 ? "Choose a saved continuation" : choices.length ? "Next saved move" : "End of this line"}</span>
        <strong>{branch?.title ?? line.title}</strong></div>
      {previous && <button className="text-button" disabled={disabled} onClick={onReturn}>Back to previous line</button>}
    </div>
    {lineCount > 1 && <p>This position is shared by {lineCount} active lines. Follow a saved move to explore its continuation.</p>}
    {choices.length > 0 && <div className="opening-branch-choices">
      {choices.map(choice => <button key={choice.moveUci} className={choice.selected ? "selected" : "secondary"}
        aria-label={`Follow ${choice.label}`} disabled={disabled} onClick={() => onNavigate(choice.target.lineId, choice.target.ply)}>
        <b>{choice.label}</b><small>{choice.selected ? "Selected line" : "Another saved reply"} · {choice.lineCount} {choice.lineCount === 1 ? "line" : "lines"}</small>
      </button>)}
    </div>}
    {branch?.parentLineId && branch.sharedPly > 0 && line.moves[branch.sharedPly - 1] && <button
      className="text-button opening-branch-origin" disabled={disabled || ply === branch.sharedPly}
      onClick={() => onNavigate(lineId, branch.sharedPly)}>
      Go to branching point · after {openingMoveLabel(line.moves[branch.sharedPly - 1]!)}
    </button>}
    {otherOrders.length > 0 && <details className="opening-equivalent-lines">
      <summary>Same position, another move order ({otherOrders.length})</summary>
      <p>These lines reach the same board through different moves. Switching keeps this position.</p>
      {otherOrders.map(route => <button className="text-button" key={route.lineId} disabled={disabled}
        onClick={() => onNavigate(route.lineId, route.ply)}>{index.lines.get(route.lineId)?.chapterTitle} · {index.branches.get(route.lineId)?.title ?? index.lines.get(route.lineId)?.line.title} — same position</button>)}
    </details>}
    {disabled && <p className="opening-navigation-lock">Save or cancel your edit before changing positions.</p>}
  </section>;
}
