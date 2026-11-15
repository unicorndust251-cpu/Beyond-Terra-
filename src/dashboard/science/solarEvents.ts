import { EARTH_HOURS_PER_MARS_HOUR, localSolar, marsTime, SOL_SECONDS, wrap24 } from './marsTime';

/**
 * Sunrise, sunset, solar noon and day length for the sol (local midnight to midnight, in
 * local true solar time) containing a given instant.
 *
 * Method: the Sun's elevation (Mars24 D-5, recomputed at every sample, so declination and
 * the equation of time vary as they should) is sampled every 2 Mars minutes across the sol;
 * each sign change is refined by bisection to under 1 s. Threshold: the centre of the Sun at
 * 0° on a flat, unobstructed horizon. Atmospheric refraction, the Sun's angular radius and
 * local terrain are NOT included (Earth's −0.833° convention does not apply to Mars).
 */

export const HORIZON_THRESHOLD_DEG = 0;

export type SolStatus = 'normal' | 'polar-day' | 'polar-night';

export interface SolarEvents {
  status: SolStatus;
  /** UTC of the sol's local midnight (start) and next midnight (end). */
  solStartMs: number;
  solEndMs: number;
  sunriseMs: number | null;
  sunsetMs: number | null;
  /** LTST of the events (h). */
  sunriseLTST: number | null;
  sunsetLTST: number | null;
  /** Highest elevation in the sol, and when. */
  noonMs: number;
  noonLTST: number;
  maxElevation: number;
  minElevation: number;
  /** Daylight and darkness in Mars clock hours (a sol = 24 Mars hours). */
  dayMarsHours: number;
  nightMarsHours: number;
  /** The Sun through the sol, for drawing: [hours since local midnight, elevation°, azimuth° or null]. */
  curve: Array<[number, number, number | null]>;
}

const STEP_MARS_MIN = 2;

function elevationAt(ms: number, lat: number, lonE: number): { elevation: number; LTST: number; azimuth: number | null } {
  const s = localSolar(marsTime(ms), lat, lonE);
  return { elevation: s.elevation, LTST: s.LTST, azimuth: s.azimuth };
}

function bisect(a: number, b: number, lat: number, lonE: number): number {
  let ea = elevationAt(a, lat, lonE).elevation - HORIZON_THRESHOLD_DEG;
  for (let i = 0; i < 40 && b - a > 500; i++) {
    const m = (a + b) / 2;
    const em = elevationAt(m, lat, lonE).elevation - HORIZON_THRESHOLD_DEG;
    if (Math.sign(em) === Math.sign(ea)) {
      a = m;
      ea = em;
    } else b = m;
  }
  return (a + b) / 2;
}

export function solarEvents(utcMs: number, lat: number, lonE: number): SolarEvents {
  // Local midnight before the instant: step back by the LTST elapsed, converted to Earth time
  const ltstNow = elevationAt(utcMs, lat, lonE).LTST;
  let solStartMs = utcMs - (ltstNow / 24) * SOL_SECONDS * 1000;
  // Refine: LTST runs slightly unevenly (equation of time); nudge onto 00:00 LTST
  for (let i = 0; i < 3; i++) {
    const l = elevationAt(solStartMs, lat, lonE).LTST;
    const off = l > 12 ? l - 24 : l;
    solStartMs -= (off / 24) * SOL_SECONDS * 1000;
  }
  const solEndMs = solStartMs + SOL_SECONDS * 1000;
  const step = ((STEP_MARS_MIN / 60) / 24) * SOL_SECONDS * 1000;

  const curve: Array<[number, number, number | null]> = [];
  let prev: { ms: number; e: number } | null = null;
  let sunriseMs: number | null = null;
  let sunsetMs: number | null = null;
  let max = { ms: solStartMs, e: -Infinity };
  let min = Infinity;
  for (let ms = solStartMs; ms <= solEndMs + 1; ms += step) {
    const { elevation, azimuth } = elevationAt(ms, lat, lonE);
    curve.push([((ms - solStartMs) / (SOL_SECONDS * 1000)) * 24, elevation, azimuth]);
    if (elevation > max.e) max = { ms, e: elevation };
    min = Math.min(min, elevation);
    if (prev) {
      const a = prev.e - HORIZON_THRESHOLD_DEG;
      const b = elevation - HORIZON_THRESHOLD_DEG;
      if (a < 0 && b >= 0 && sunriseMs === null) sunriseMs = bisect(prev.ms, ms, lat, lonE);
      if (a >= 0 && b < 0 && sunsetMs === null) sunsetMs = bisect(prev.ms, ms, lat, lonE);
    }
    prev = { ms, e: elevation };
  }

  // Refine solar noon around the highest sample (golden-section search)
  let lo = max.ms - step;
  let hi = max.ms + step;
  for (let i = 0; i < 30; i++) {
    const m1 = lo + (hi - lo) * 0.382;
    const m2 = lo + (hi - lo) * 0.618;
    if (elevationAt(m1, lat, lonE).elevation < elevationAt(m2, lat, lonE).elevation) lo = m1;
    else hi = m2;
  }
  const noonMs = (lo + hi) / 2;
  const noon = elevationAt(noonMs, lat, lonE);

  const solMs = SOL_SECONDS * 1000;
  let status: SolStatus = 'normal';
  let dayMs: number;
  if (sunriseMs === null && sunsetMs === null) {
    status = max.e >= HORIZON_THRESHOLD_DEG ? 'polar-day' : 'polar-night';
    dayMs = status === 'polar-day' ? solMs : 0;
  } else if (sunriseMs !== null && sunsetMs !== null && sunsetMs > sunriseMs) {
    dayMs = sunsetMs - sunriseMs;
  } else {
    // Only one crossing in this sol (near the edge of polar day or night), or the Sun sets
    // before it rises: count the sampled daylight directly
    dayMs = (curve.filter(([, e]) => e >= HORIZON_THRESHOLD_DEG).length / curve.length) * solMs;
  }
  const dayMarsHours = (dayMs / solMs) * 24;
  return {
    status,
    solStartMs,
    solEndMs,
    sunriseMs,
    sunsetMs,
    sunriseLTST: sunriseMs === null ? null : elevationAt(sunriseMs, lat, lonE).LTST,
    sunsetLTST: sunsetMs === null ? null : elevationAt(sunsetMs, lat, lonE).LTST,
    noonMs,
    noonLTST: wrap24(noon.LTST),
    maxElevation: noon.elevation,
    minElevation: min,
    dayMarsHours,
    nightMarsHours: 24 - dayMarsHours,
    curve,
  };
}

/** Mars clock hours → Earth hours (a Mars hour is 1/24 of a mean sol). */
export function marsHoursToEarthHours(marsHours: number): number {
  return marsHours * EARTH_HOURS_PER_MARS_HOUR;
}

/** "11 h 42 min" from decimal hours. */
export function formatDurationHours(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`;
}

export interface NextEvent {
  kind: 'sunrise' | 'sunset';
  utcMs: number;
  /** Local true solar time of the event (h). */
  ltst: number;
  /** Sols after the current one (0 = this sol). */
  solsAhead: number;
}

/**
 * The next actual sunrise or sunset after an instant, looking up to `maxSols` sols ahead
 * (polar day or night can last many sols). Null when none occurs in that window.
 */
export function nextSolarEvent(utcMs: number, lat: number, lonE: number, maxSols = 3): NextEvent | null {
  for (let k = 0; k <= maxSols; k++) {
    const ev = solarEvents(utcMs + k * SOL_SECONDS * 1000, lat, lonE);
    const candidates: NextEvent[] = [];
    if (ev.sunriseMs !== null && ev.sunriseMs > utcMs) candidates.push({ kind: 'sunrise', utcMs: ev.sunriseMs, ltst: ev.sunriseLTST!, solsAhead: k });
    if (ev.sunsetMs !== null && ev.sunsetMs > utcMs) candidates.push({ kind: 'sunset', utcMs: ev.sunsetMs, ltst: ev.sunsetLTST!, solsAhead: k });
    if (candidates.length) return candidates.sort((a, b) => a.utcMs - b.utcMs)[0];
  }
  return null;
}

/** "2 h 05 min" or "14 min 09 s" for an Earth-time interval in milliseconds. */
export function formatEarthCountdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s % 60).padStart(2, '0')} s`;
}
