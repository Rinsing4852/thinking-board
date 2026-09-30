export interface LineCandidate {
  lineId: string;
  priority: number;
  practicalWeight: number;
  urgency: number;
  decisions: number;
}

/** Select a bounded line rehearsal, not an engine game. Recent runs get less
 * weight; average urgency prevents long lines starving shorter branches. */
export function selectPracticeLine(candidates: LineCandidate[], recentLineIds: string[], random = Math.random): LineCandidate | undefined {
  const alternatives = candidates.filter((candidate) => candidate.lineId !== recentLineIds[0]);
  const eligible = alternatives.length > 0 ? alternatives : candidates;
  const weighted = eligible.map((candidate) => {
    const recentCount = recentLineIds.filter((id) => id === candidate.lineId).length;
    const urgency = candidate.urgency / Math.max(1, candidate.decisions);
    const practical = 0.5 + Math.sqrt(candidate.practicalWeight);
    return { candidate, weight: Math.max(0.1, (1 + urgency) * practical / (1 + recentCount * 2)) };
  });
  let cursor = Math.max(0, Math.min(0.999999, random())) * weighted.reduce((sum, item) => sum + item.weight, 0);
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor < 0) return item.candidate;
  }
  return weighted.at(-1)?.candidate;
}
