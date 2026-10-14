import type { BuildGuidance } from "../opening-build-guidance";

export function OpeningBuildGuidance({ guidance, shown, onToggle }: { guidance: BuildGuidance; shown: boolean; onToggle: () => void }) {
  return <section className="opening-build-guidance" aria-label="Board move suggestions">
    <div><strong>{guidance.title}</strong><button className="text-button" aria-pressed={shown} onClick={onToggle}>{shown ? "Hide suggestion arrows" : "Show suggestion arrows"}</button></div>
    {guidance.moves.length > 0 && <ol>{guidance.moves.map(move => <li key={move.uci}>
      <strong>{move.san}</strong>{move.percent !== null && <> · {move.percent}% · {move.games?.toLocaleString()} games</>}
    </li>)}</ol>}
    <p>{guidance.message}</p>
  </section>;
}
