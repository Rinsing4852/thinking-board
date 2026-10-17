export interface OpeningLocation { repertoireId: string; lineId: string | null; ply: number; study?: boolean }
export function parseOpeningLocation(hash: string): OpeningLocation | null {
  if (!hash.startsWith("#openings?")) return null;
  const params = new URLSearchParams(hash.slice(hash.indexOf("?") + 1));
  const repertoireId = params.get("repertoire");
  if (!repertoireId || repertoireId.length > 128) return null;
  const ply = Number(params.get("ply") ?? 0);
  const lineId = params.get("line");
  return { repertoireId, lineId: lineId && lineId.length <= 128 ? lineId : null,
    ply: Number.isSafeInteger(ply) && ply >= 0 ? ply : 0, ...(params.get("study")==="1"?{study:true}:{}) };
}
export function openingLocationHash(location: OpeningLocation): string {
  const params = new URLSearchParams({ repertoire: location.repertoireId, ply: String(location.ply) });
  if (location.lineId) params.set("line", location.lineId);
  if (location.study) params.set("study", "1");
  return `#openings?${params}`;
}
