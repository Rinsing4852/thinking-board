import { useState } from "react";

interface Game {
  id: string; white: string; black: string; result: string; playerColor: string; playedAt: string | null;
}

/** Bound the rendered list, not the saved library; search still covers every game. */
export function GameLibrary({ games, selectedId, onChoose }: {
  games: Game[]; selectedId: string | null; onChoose: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(8);
  const matches = games.filter(game => `${game.white} ${game.black} ${game.result} ${game.playerColor} ${game.playedAt ?? ""} ${game.playedAt ? new Date(game.playedAt).toLocaleDateString() : ""}`
    .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = matches.find(game => game.id === selectedId);
  const visible = matches.slice(0, limit);
  if (selected && !visible.some(game => game.id === selected.id)) visible.unshift(selected);
  return <div className="game-library">
    {games.length > 1 && <label>Find a game
      <input type="search" value={query} placeholder="Player, opponent or date…" onChange={event => {
        setQuery(event.target.value); setLimit(8);
      }} />
    </label>}
    <div className="game-chips" aria-label="Imported games">
      {visible.map(game => <button key={game.id} className={`game-chip${selectedId === game.id ? " active" : ""}`}
        aria-pressed={selectedId === game.id} onClick={() => onChoose(game.id)}>
        <strong>{game.white} – {game.black}</strong>
        <small>{game.result} · you played {game.playerColor}{game.playedAt ? ` · ${new Date(game.playedAt).toLocaleDateString()}` : ""}</small>
      </button>)}
    </div>
    {matches.length === 0 && <p role="status">No games match this search. <button className="text-button" onClick={() => setQuery("")}>Clear game search</button></p>}
    {visible.length < matches.length && <button className="secondary" onClick={() => setLimit(value => value + 8)}>
      Show more games ({matches.length - visible.length} remaining)
    </button>}
  </div>;
}
