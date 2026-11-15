import { fromEast360, type MarsCoordinate } from '../shared';

/**
 * Coordinate entry for the Hazards view.
 *
 * Latitude: −90…+90, decimal, optional N/S. Longitude: signed east, or a value with E/W.
 *   west → east:        east = (360 − west) % 360
 *   signed east → 0–360: ((longitude % 360) + 360) % 360   (so 360° E is 0° E)
 * A minus sign together with a hemisphere letter (e.g. "−8.6 S") is rejected as
 * conflicting rather than guessed. The input's own decimals are kept for display:
 * no extra precision is claimed.
 */

export type ParsedCoordinate =
  | { ok: true; coordinate: MarsCoordinate; latDecimals: number; lonDecimals: number; east360: number }
  | { ok: false; error: string };

interface Angle {
  value: number;
  letter: string | null;
  decimals: number;
}

function readAngle(text: string, letters: string): Angle | string {
  const t = text.trim().replace(/[−–]/g, '-').replace(/°/g, '').replace(/\s+/g, '');
  const m = t.match(new RegExp(`^([+-])?(\\d+(?:\\.\\d+)?|\\.\\d+)([${letters}])?$`, 'i'));
  if (!m) return `“${text.trim()}” is not a decimal angle`;
  const letter = m[3] ? m[3].toUpperCase() : null;
  if (m[1] === '-' && letter) return `“${text.trim()}” has both a minus sign and a hemisphere letter; use one or the other`;
  const decimals = (m[2].split('.')[1] ?? '').length;
  return { value: (m[1] === '-' ? -1 : 1) * Number(m[2]), letter, decimals };
}

/** Recognises "lat, lon", "lat lon", "8.6S 315.7E", "−8.6, −44.3", "12.6 S, 63.1 W". */
export function looksLikeCoordinate(text: string): boolean {
  return /^\s*[+\-−–]?[\d.]+\s*°?\s*[NSns]?\s*[,;\s]\s*[+\-−–]?[\d.]+\s*°?\s*[EWew]?\s*$/.test(text);
}

export function parseCoordinateText(text: string): ParsedCoordinate {
  const m = text.trim().match(/^([+\-−–]?[\d.]+\s*°?\s*[NSns]?)\s*[,;\s]\s*([+\-−–]?[\d.]+\s*°?\s*[EWew]?)$/);
  if (!m) return { ok: false, error: 'Enter latitude then longitude, e.g. “8.6 S, 315.7 E” or “-8.6, 315.7”.' };

  const lat = readAngle(m[1], 'NS');
  if (typeof lat === 'string') return { ok: false, error: `Latitude: ${lat}.` };
  const latitude = lat.letter === 'S' ? -lat.value : lat.value;
  if (latitude < -90 || latitude > 90) return { ok: false, error: 'Latitude must be between −90° and +90°.' };

  const lon = readAngle(m[2], 'EW');
  if (typeof lon === 'string') return { ok: false, error: `Longitude: ${lon}.` };
  let east360: number;
  if (lon.letter === 'W') {
    if (lon.value > 360) return { ok: false, error: 'West longitude must be between 0° and 360° W.' };
    east360 = (360 - lon.value) % 360;
  } else {
    if (Math.abs(lon.value) > 360) return { ok: false, error: 'Longitude must be between −360° and +360°.' };
    east360 = ((lon.value % 360) + 360) % 360;
  }
  return { ok: true, coordinate: fromEast360(latitude, east360), latDecimals: lat.decimals, lonDecimals: lon.decimals, east360 };
}

export function formatLat(lat: number, decimals = 3): string {
  return `${Math.abs(lat).toFixed(decimals)}° ${lat >= 0 ? 'N' : 'S'}`;
}

export function formatLonEast(lonEast: number, decimals = 3): string {
  return `${(((lonEast % 360) + 360) % 360).toFixed(decimals)}° E`;
}

export function formatCoord(c: MarsCoordinate, decimals = 3): string {
  return `${formatLat(c.latitude, decimals)}, ${formatLonEast(c.longitudeEast, decimals)}`;
}
