import type { OpeningCoverageGap } from "./api.js";

export function openingTask(gap: OpeningCoverageGap) {
  const practice = gap.status === "needs_practice";
  const seen = gap.personalFrequency?.games ?? gap.preparation?.personal.occurrences ?? 0;
  const mistakes = gap.preparation?.personal.responseMistakes ?? 0;
  const attempts = gap.recallAttempts ?? 0;
  const kind = practice ? "practise" : gap.status === "idea_only" ? "idea" : "prepare";
  // Demonstrated difficulty first; never treat an untested response as a failure.
  const priority = mistakes > 0 ? 600 + Math.min(20, mistakes) : !practice && seen > 0 ? 500 + Math.min(50, seen)
    : practice && attempts > 0 ? 400 + (100 - (gap.recallPercent ?? 0)) / 100
    : !practice && gap.reachPercent != null ? 300 + gap.reachPercent
    : practice ? 100 : 50;
  const reason = mistakes > 0 ? `Your response caused difficulty in ${mistakes} analysed game${mistakes === 1 ? "" : "s"}.`
    : !practice && seen > 0 ? `Seen in ${seen} of your recent games; ${kind === "idea" ? "an idea is saved but no answer move" : "no answer is saved"}.`
    : practice ? attempts === 0 ? "Your answer is saved but has not been tested in practice." : "Your saved answer is ready for more unaided practice."
    : gap.reachPercent != null ? `This reply is estimated in ${gap.reachPercent}% of games following this route.`
    : "Check this reply before deciding whether to add an answer; frequency is uncertain.";
  return { id: practice && gap.responseMoveId ? `practice:${gap.responseMoveId}` : `${kind}:${gap.positionId}:${gap.moveUci}`, kind, priority, reason };
}

export function rankedOpeningTasks(gaps: OpeningCoverageGap[]): OpeningCoverageGap[] {
  const unique = new Map<string, OpeningCoverageGap>();
  for (const gap of gaps) {
    if (gap.status === "prepared" || gap.status === "unprepared" || gap.taskChoice) continue;
    if (gap.status === "unknown" && !(gap.personalFrequency?.games ?? gap.preparation?.personal.occurrences)) continue;
    const candidate = { ...gap, task: openingTask(gap) };
    const old = unique.get(candidate.task.id);
    if (!old || candidate.task.priority > openingTask(old).priority) unique.set(candidate.task.id, candidate);
  }
  return [...unique.values()].sort((a, b) => openingTask(b).priority - openingTask(a).priority
    || openingTask(a).id.localeCompare(openingTask(b).id));
}

export function firstPreparationTask(gaps: OpeningCoverageGap[]): OpeningCoverageGap | null {
  return rankedOpeningTasks(gaps).find(gap => gap.status !== "needs_practice") ?? null;
}
