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

/** Validates entered latitude and 0–360° east longitude; returns a coordinate or an error. */
export function parseCoordinate(
  latitudeText: string,
  longitudeText: string,
): { coordinate: MarsCoordinate } | { error: string } {
  const lat = Number(latitudeText.trim());
  const lon = Number(longitudeText.trim());
  if (latitudeText.trim() === '' || longitudeText.trim() === '') return { error: 'Enter both latitude and longitude.' };
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'Latitude must be between −90° and +90°.' };
  if (!Number.isFinite(lon) || lon < 0 || lon > 360) return { error: 'Longitude must be between 0° and 360° E.' };
  return { coordinate: fromEast360(lat, lon) };
}

export function formatLatitude(c: MarsCoordinate, digits = 3): string {
  const v = Math.abs(c.latitude).toFixed(digits);
  return `${v}° ${c.latitude >= 0 ? 'N' : 'S'}`;
}

export function formatLongitude(c: MarsCoordinate, digits = 3): string {
  return `${toEast360(c).toFixed(digits)}° E`;
}

export function formatCoordinate(c: MarsCoordinate, digits = 3): string {
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
