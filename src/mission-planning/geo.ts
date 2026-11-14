import { fromEast360, toEast360, type MarsCoordinate } from '../shared';

/**
 * Route geometry for mission planning.
 *
 * Distances use the Haversine great-circle formula on a sphere of Mars's mean radius,
 * R = 3389.5 km. (The map's own frame is the IAU 2000 sphere, 3396.19 km; the 0.2 %
 * difference is far below the uncertainty of a straight-line route estimate.)
 * These are geographic distances, not terrain-following walking distances.
 *
 * Longitudes are shown and entered east-positive, 0–360°; internally they are the shared
 * MarsCoordinate (−180…180). Conversions go through src/shared/coordinates.
 */

export const MARS_MEAN_RADIUS_KM = 3389.5;

const DEG = Math.PI / 180;

export function haversineKm(a: MarsCoordinate, b: MarsCoordinate): number {
  const φ1 = a.latitude * DEG;
  const φ2 = b.latitude * DEG;
  const dφ = φ2 - φ1;
  const dλ = (b.longitudeEast - a.longitudeEast) * DEG;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * MARS_MEAN_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Reads a typed angle: any decimal, with a decimal point or comma, an optional ° and an
 * optional hemisphere letter (e.g. "18.88", "18,88°", "5.37 S", "137.81E", "−4.5").
 * A letter in `negative` flips the sign (S for latitude, W for longitude).
 */
function readAngle(text: string, letters: string, negative: string): number | null {
  const m = text
    .trim()
    .replace(/[−–]/g, '-')
    .replace(',', '.')
    .match(new RegExp(`^([+-]?\\d+(?:\\.\\d+)?|[+-]?\\.\\d+)\\s*°?\\s*([${letters}])?$`, 'i'));
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  return m[2] && m[2].toUpperCase() === negative ? -value : value;
}

export type FieldResult = { value: number } | { error: string } | { empty: true };

/** Latitude, −90 to +90 (planetocentric). */
export function parseLatitude(text: string): FieldResult {
  if (text.trim() === '') return { empty: true };
  const v = readAngle(text, 'NSns', 'S');
  if (v === null) return { error: 'Latitude must be a number, e.g. 18.88 or 5.37 S.' };
  if (v < -90 || v > 90) return { error: 'Latitude must be between −90° and +90°.' };
  return { value: v };
}

/**
 * Longitude, east-positive. 0–360° E is the planner's convention; −180…180 values (as on
 * the map) and "W" are accepted too and converted, so 315 and −45 are the same place.
 */
export function parseLongitudeEast(text: string): FieldResult {
  if (text.trim() === '') return { empty: true };
  const v = readAngle(text, 'EWew', 'W');
  if (v === null) return { error: 'Longitude must be a number, e.g. 77.69 or 137.81 E.' };
  if (v < -180 || v > 360) return { error: 'Longitude must be between 0° and 360° E (or −180° to 180°).' };
  return { value: v };
}

/** Both fields at once; each error is reported for its own field. */
export function parseCoordinate(
  latitudeText: string,
  longitudeText: string,
): { coordinate: MarsCoordinate } | { latError?: string; lonError?: string } {
  const lat = parseLatitude(latitudeText);
  const lon = parseLongitudeEast(longitudeText);
  const latError = 'error' in lat ? lat.error : 'empty' in lat ? 'Enter a latitude.' : undefined;
  const lonError = 'error' in lon ? lon.error : 'empty' in lon ? 'Enter a longitude.' : undefined;
  if (latError || lonError) return { latError, lonError };
  return { coordinate: fromEast360((lat as { value: number }).value, (lon as { value: number }).value) };
}

/** A stop's display name: its landmark name, or "Custom Mars Location". */
export function locationName(name: string | undefined): string {
  return name ?? 'Custom Mars Location';
}

export function formatLatitude(c: MarsCoordinate, digits = 4): string {
  const v = Math.abs(c.latitude).toFixed(digits);
  return `${v}° ${c.latitude >= 0 ? 'N' : 'S'}`;
}

export function formatLongitude(c: MarsCoordinate, digits = 4): string {
  return `${toEast360(c).toFixed(digits)}° E`;
}

export function formatCoordinate(c: MarsCoordinate, digits = 4): string {
  return `${formatLatitude(c, digits)}, ${formatLongitude(c, digits)}`;
}

export function formatKm(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km < 100) return `${km.toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h >= 48) return `${(hours / 24).toFixed(1)} days`;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
