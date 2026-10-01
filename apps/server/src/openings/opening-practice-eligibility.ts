/** Only automatic selection uses this predicate. All names are internal SQL aliases. */
export function practiceLineEligible(lineAlias: string, profileExpression: string): string {
  return `NOT EXISTS (SELECT 1 FROM opening_line_practice_preferences disabled
    WHERE disabled.line_id = ${lineAlias}.id AND disabled.profile_id = ${profileExpression} AND disabled.enabled = 0)`;
}
