/** Hide old import/storage boilerplate without rewriting the user's stored notes. */
export function meaningfulOpeningText(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  if (/^(Your imported note is attached to |The (?:imported )?repertoire continues with |Use your note as the starting point|Return to your source and add the reason|This response is included in the imported line|Add the plan for this move in your own words|Add what this reply is trying to achieve)/.test(value)) return null;
  return value;
}
export function hasOpeningReason(summary: string | undefined): boolean {
  return Boolean(summary) && !/^No explanation has been added for | is an opponent response from the imported PGN\.$/.test(summary!);
}
