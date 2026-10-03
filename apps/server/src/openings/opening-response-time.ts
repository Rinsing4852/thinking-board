/** Client active time is advisory, validated and bounded by server wall time.
 * Legacy/API clients without a clock retain the existing wall-time behaviour. */
export function openingResponseMs(startedAt: string, answeredAt: string, activeResponseMs?: number): number {
  const wallMs = Math.max(0, Date.parse(answeredAt) - Date.parse(startedAt));
  if (activeResponseMs === undefined) return wallMs;
  if (!Number.isSafeInteger(activeResponseMs) || activeResponseMs < 0) throw new Error("Active response time must be a non-negative integer");
  return Math.min(wallMs, activeResponseMs);
}
