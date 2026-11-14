import { normalizeLongitudeEast, type MarsCoordinate } from '../../shared';
import { haversineKm } from '../geo';

/**
 * The route preview's path: exactly the line the map draws between the ordered stops
 * (straight in latitude/longitude, the short way across ±180°), measured in metres along
 * its length. Each segment is sampled finely so positions advance evenly by distance.
 */

export interface PathStop {
  key: string;
  label: string;
  name?: string;
  coordinate: MarsCoordinate;
}

interface Sample {
  lat: number;
  /** Unwrapped longitude (may pass ±180°, continuous along the path). */
  lon: number;
  /** Metres from the start. */
  at: number;
}

export interface RoutePath {
  stops: PathStop[];
  /** Metres from the start to each stop. */
  stopAt: number[];
  lengthM: number;
  samples: Sample[];
}

const SAMPLES_PER_SEGMENT = 48;

export function buildPath(stops: PathStop[]): RoutePath {
  const samples: Sample[] = [];
  const stopAt: number[] = [];
  let prevLon = stops[0]?.coordinate.longitudeEast ?? 0;
  let at = 0;
  stops.forEach((stop, i) => {
    const lat = stop.coordinate.latitude;
    // Unwrap like the map does: each stop in the world copy nearest the previous one
    const lon = stop.coordinate.longitudeEast + 360 * Math.round((prevLon - stop.coordinate.longitudeEast) / 360);
    if (i === 0) {
      samples.push({ lat, lon, at: 0 });
    } else {
      const from = samples[samples.length - 1];
      for (let k = 1; k <= SAMPLES_PER_SEGMENT; k++) {
        const t = k / SAMPLES_PER_SEGMENT;
        const s = { lat: from.lat + (lat - from.lat) * t, lon: from.lon + (lon - from.lon) * t, at: 0 };
        const prev = samples[samples.length - 1];
        at += haversineKm({ latitude: prev.lat, longitudeEast: prev.lon }, { latitude: s.lat, longitudeEast: s.lon }) * 1000;
        s.at = at;
        samples.push(s);
      }
    }
    stopAt.push(at);
    prevLon = lon;
  });
  return { stops, stopAt, lengthM: at, samples };
}

const toCoordinate = (lat: number, lon: number): MarsCoordinate => ({ latitude: lat, longitudeEast: normalizeLongitudeEast(lon) });

/** The point `metres` along the path (clamped to its ends). */
export function pointAt(path: RoutePath, metres: number): MarsCoordinate {
  const { samples } = path;
  if (samples.length === 1 || metres <= 0) return toCoordinate(samples[0].lat, samples[0].lon);
  if (metres >= path.lengthM) {
    const last = samples[samples.length - 1];
    return toCoordinate(last.lat, last.lon);
  }
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].at <= metres) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const t = b.at > a.at ? (metres - a.at) / (b.at - a.at) : 0;
  return toCoordinate(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t);
}

/** Index of the next stop strictly ahead of `metres` (the destination at the end). */
export function nextStopIndex(path: RoutePath, metres: number): number {
  const i = path.stopAt.findIndex((at, k) => k > 0 && at > metres + 1e-6);
  return i < 0 ? path.stops.length - 1 : i;
}

/**
 * How far along the path the point nearest `c` is. Uses a local flat approximation per
 * sample interval, which is ample for choosing where to continue on a revised route.
 */
export function nearestAlong(path: RoutePath, c: MarsCoordinate): number {
  const { samples } = path;
  if (samples.length === 1) return 0;
  let best = { d2: Infinity, at: 0 };
  const lonC = (ref: number) => c.longitudeEast + 360 * Math.round((ref - c.longitudeEast) / 360);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const k = Math.cos((a.lat * Math.PI) / 180);
    const px = (lonC(a.lon) - a.lon) * k;
    const py = c.latitude - a.lat;
    const vx = (b.lon - a.lon) * k;
    const vy = b.lat - a.lat;
    const vv = vx * vx + vy * vy;
    const t = vv > 0 ? Math.max(0, Math.min(1, (px * vx + py * vy) / vv)) : 0;
    const dx = px - vx * t;
    const dy = py - vy * t;
    const d2 = dx * dx + dy * dy;
    if (d2 < best.d2) best = { d2, at: a.at + (b.at - a.at) * t };
  }
  return best.at;
}

/** A stable description of the stops, to notice when the route changes. */
export function pathSignature(stops: PathStop[]): string {
  return JSON.stringify(stops.map((s) => [s.key, s.coordinate.latitude, s.coordinate.longitudeEast]));
}
