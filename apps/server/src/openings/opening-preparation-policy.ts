import type { OpeningPreparationAssessment, OpeningPreparationChoice } from "../../../../packages/contracts/src/api.js";

export const PREPARATION_MIN_SAMPLE = 200;
export const EXPLORER_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export const EXPLORER_SPEEDS = "blitz,rapid,classical";

export function assessPreparation(input: {
  frequency: OpeningPreparationAssessment["frequency"];
  personal?: OpeningPreparationAssessment["personal"];
  difficulty?: OpeningPreparationAssessment["difficulty"];
  decision?: { choice: OpeningPreparationChoice; note: string; updatedAt: string } | null;
}): OpeningPreparationAssessment {
  const personal = input.personal ?? { occurrences: 0, responsesAnalyzed: 0, responseMistakes: 0, opponentMistakes: 0 };
  const difficulty = input.difficulty ?? "unknown";
  const frequency = input.frequency;
  const reliable = frequency.status === "known" && !frequency.stale;
  const common = reliable && (frequency.percent ?? 0) >= 5;
  const rare = reliable && (frequency.percent ?? 100) < 1;
  const repeated = personal.occurrences >= 3;
  const struggled = personal.responseMistakes > 0;
  const handled = personal.responsesAnalyzed > 0 && !struggled;
  const reasons: string[] = [];
  if (frequency.status === "known" || frequency.status === "small_sample") {
    reasons.push(`${frequency.percent}% of sampled replies from this position; ${frequency.moveGames} games out of ${frequency.positionGames}. This is not the chance of facing it in any game.`);
  } else reasons.push(frequency.status === "off"
    ? "Practical frequencies are off. Enable them in Opening settings to use Lichess data."
    : "No reliable frequency estimate for this reply. Missing data does not mean the move is never played.");
  if (frequency.status === "small_sample") reasons.push("The sample is small; do not use it to rule out preparation.");
  if (frequency.stale) reasons.push("The cached sample is old; refresh before relying on its frequency.");
  if (personal.occurrences) reasons.push(`Seen in ${personal.occurrences} of your recent imported games.`);
  if (handled) reasons.push(`No meaningful mistake was found in your immediate response in ${personal.responsesAnalyzed} analysed game${personal.responsesAnalyzed === 1 ? "" : "s"}. This does not assess the rest of the game.`);
  if (struggled) reasons.push(`Your immediate response lost ground in ${personal.responseMistakes} analysed game${personal.responseMistakes === 1 ? "" : "s"}.`);
  if (personal.opponentMistakes) reasons.push("The opponent's reply was weak in the analysed game. Weak moves can still be common or tricky to answer.");
  if (difficulty === "precise_reply") reasons.push("Stockfish's leading reply is substantially stronger than the next candidates. Learn what makes that response work.");
  if (difficulty === "several_replies") reasons.push("Stockfish found several comparably strong replies. You may not need a long memorised line.");
  if (difficulty === "forcing") reasons.push("The engine found a mating line in this position. Review the concrete continuation even if the opponent's move is rare.");
  if (difficulty === "unknown") reasons.push("Reply difficulty has not been established; frequency alone cannot tell you whether a move is easy to answer.");

  let result: Pick<OpeningPreparationAssessment, "priority" | "recommendation" | "title" | "message">;
  if (repeated || personal.responseMistakes >= 2 || (common && struggled)) {
    result = { priority: "high", recommendation: "prepare_line", title: "Worth preparing a short line", message: "This reply is recurring or has caused difficulty. Save one practical response and its purpose; a deep variation is not required." };
  } else if (struggled || difficulty === "precise_reply" || difficulty === "forcing" || common) {
    result = { priority: "medium", recommendation: "learn_idea", title: "Understand the response first", message: "Learn the idea behind a good response. Add a short line if remembering a specific move would help." };
  } else if (rare && handled) {
    result = { priority: "low", recommendation: "optional", title: "No new line needed now", message: "This reply is rare in the available sample and you handled the immediate response well. Keeping a short idea or leaving it unprepared is reasonable." };
  } else if (rare || reliable) {
    result = { priority: "low", recommendation: "optional", title: "Optional preparation", message: "This is not a common reply in the sample. Inspect the response before deciding whether a short note or line is useful." };
  } else {
    result = { priority: "unknown", recommendation: "inspect", title: "Inspect before expanding", message: "Being outside your repertoire is not a mistake. There is not enough practical evidence yet to recommend adding another line." };
  }
  return { ...result, reasons, frequency, personal, difficulty, decision: input.decision ?? null };
}
