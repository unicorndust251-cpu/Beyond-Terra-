/** The planned time input (yyyy-mm-ddThh:mm, read as UTC) as milliseconds, or null. */
export function parsePlannedUtc(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isFinite(ms) ? ms : null;
}
