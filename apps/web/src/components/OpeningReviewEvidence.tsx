import type { OpeningReviewFeedback } from "../../../../packages/contracts/src/api";

export function OpeningReviewEvidence({ feedback, onOpenGame }: { feedback: OpeningReviewFeedback;
  onOpenGame?: ((gameId: string) => void) | undefined }) {
  const evidence = feedback.sourceGames;
  return <section className="opening-review-evidence" aria-label="Why this exercise">
    <strong>Why you are practising this</strong>
    <p>{feedback.exercise.practiceReason.label}.</p>
    {Boolean(evidence?.occurrences) && <>
      <p>You left this repertoire move in {evidence!.occurrences} game{evidence!.occurrences === 1 ? "" : "s"}. This is a memory gap, not necessarily a chess blunder.</p>
      <ul>{evidence!.games.map(game => <li key={game.gameId}>
        <strong>{game.white} vs {game.black}</strong>
        <small>{game.playedAt ? new Date(game.playedAt).toLocaleDateString() : "Date not recorded"}</small>
        <p>Move {game.moveNumber}: you played {game.playedMove}; your preparation was {game.repertoireMove}.</p>
        {onOpenGame && <button className="secondary" onClick={() => onOpenGame(game.gameId)}>Review this game</button>}
      </li>)}</ul>
      <p>Review the game to practise, edit a line or prepare a response.</p>
    </>}
  </section>;
}
