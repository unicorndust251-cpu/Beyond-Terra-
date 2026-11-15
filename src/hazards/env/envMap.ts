import * as L from 'leaflet';
import { localSolar, marsTime } from '../../dashboard/science/marsTime';
import { normalizeLon, sampleBin, type DemStore } from '../../science/molaDem';
import { greatCircleDistanceM, makeCoordinate, type MarsCoordinate, type PlannedRoute, type RouteHazardHit } from '../../shared';
import { CATEGORY_BY_CODE } from '../categories';
import { patternTile } from '../patterns';
import { routeLegs } from '../routeCheck';
import { HAZARD_PANES } from '../structures';
import { MARS_MEAN_RADIUS_M, horizonAngle, profileClear } from './calc';
import type { CommNode } from './inputs';

/* ------------------------------------------------------------- radiation */

/**
 * The only radiation measurement loaded: Curiosity RAD, Gale crater, as stated on NASA's
 * "Radiation Measurements on Mars" page (PIA17600). Absorbed dose only; the page gives no
 * dose equivalent, so no sievert value is shown anywhere.
 */
export const RAD_REFERENCE = {
  quantity: 'Absorbed dose rate from galactic cosmic rays',
  ratePerDay: 210,
  unit: 'µGy/day',
  approx: 'about',
  period: 'August 2012 – June 2013 (first ~300 sols)',
  instrument: 'Radiation Assessment Detector (RAD), NASA Curiosity rover',
  /** Bradbury Landing, Gale crater (NASA/JPL); Curiosity stayed nearby through mid-2013 */
  at: makeCoordinate(-4.5895, 137.4417),
  place: 'Gale crater, near Curiosity’s Bradbury Landing site',
  source: 'https://science.nasa.gov/resource/radiation-measurements-on-mars/',
  credit: 'NASA/JPL-Caltech/SwRI (PIA17600)',
  notes: [
    'Day–night variation from changing atmospheric shielding; Forbush decreases on sols 50, 97, 208 and 259; a seasonal change peaking near sol 200.',
    'Only one, weak, solar particle event was observed in this period. Solar particle events are not in the average.',
  ],
  /** Route points must lie this close to the measurement site for the constant-rate estimate */
  compatibleKm: 25,
};

/* -------------------------------------------------------------- terrain */

async function ensureTiles(store: DemStore, pts: [number, number][]) {
  const need = new Map<string, [number, number]>();
  const m = store.manifest;
  for (const [lon, lat] of pts) {
    const { i, j } = store.cellAt(lat, lon);
    const r = Math.floor(i / m.tilePixels);
    const c = Math.floor(j / m.tilePixels);
    need.set(`${r}_${c}`, [r, c]);
  }
  await Promise.all([...need.values()].map(([r, c]) => store.getTile(r, c)));
}

function elevation(store: DemStore, lon: number, lat: number): number | null {
  const s = sampleBin(store, lat, normalizeLon(lon));
  return s ? s.elevation : null;
}

/** Destination point along a compass azimuth (spherical). */
function destination(lat: number, lon: number, azDeg: number, distM: number): [number, number] {
  const R = MARS_MEAN_RADIUS_M;
  const d = distM / R;
  const a = (azDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(a));
  const l2 = l1 + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [(l2 * 180) / Math.PI, (p2 * 180) / Math.PI];
}

export interface HorizonResult {
  horizonDeg: number;
  /** Distance checked along the azimuth, km */
  rangeKm: number;
  stepKm: number;
}

/** MOLA terrain horizon toward an azimuth, from a point on the ground, out to 150 km. */
export async function terrainHorizon(store: DemStore, at: MarsCoordinate, azimuth: number): Promise<HorizonResult | null> {
  const stepM = 1850;
  const n = 81;
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) pts.push(k === 0 ? [at.longitudeEast, at.latitude] : destination(at.latitude, at.longitudeEast, azimuth, k * stepM));
  await ensureTiles(store, pts);
  const profile: number[] = [];
  for (const [lon, lat] of pts) {
    const z = elevation(store, lon, lat);
    if (z == null) return null;
    profile.push(z);
  }
  return { horizonDeg: horizonAngle(profile, stepM), rangeKm: ((n - 1) * stepM) / 1000, stepKm: stepM / 1000 };
}

/* ---------------------------------------------------------- communication */

export interface CommSegment {
  fromKm: number;
  toKm: number;
  state: 'clear' | 'blocked' | 'no-data';
  path: MarsCoordinate[];
  segmentIndex: number;
  segmentLabel: string;
}

/**
 * Terrain line of sight from each configured node to points every ~1 km along the route
 * (MOLA 3.7 km bins, spherical bulge). A point is "clear" when at least one node sees it.
 * Not a radio-link assessment: no frequency, power, antenna pattern, Fresnel zone or
 * relay-orbiter geometry is modelled.
 */
export async function routeLineOfSight(store: DemStore, route: PlannedRoute, nodes: CommNode[], crewAntennaM: number): Promise<CommSegment[]> {
  const legs = routeLegs(route);
  const samples: { lon: number; lat: number; km: number; leg: (typeof legs)[number] }[] = [];
  for (const leg of legs) {
    const n = Math.max(1, Math.ceil(leg.km));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      samples.push({ lon: leg.a[0] + (leg.b[0] - leg.a[0]) * t, lat: leg.a[1] + (leg.b[1] - leg.a[1]) * t, km: leg.startKm + leg.km * t, leg });
    }
  }
  // Tiles for the box around all nodes and samples
  const all: [number, number][] = [...samples.map((s) => [s.lon, s.lat] as [number, number]), ...nodes.map((n) => [n.at.longitudeEast, n.at.latitude] as [number, number])];
  const lats = all.map((p) => p[1]);
  const lons = all.map((p) => normalizeLon(p[0]));
  const grid: [number, number][] = [];
  for (let la = Math.min(...lats); la <= Math.max(...lats) + 0.5; la += 0.5) for (let lo = Math.min(...lons); lo <= Math.max(...lons) + 0.5; lo += 0.5) grid.push([lo, la]);
  await ensureTiles(store, grid);

  const states: CommSegment['state'][] = samples.map((s) => {
    let anyData = false;
    for (const node of nodes) {
      const dist = greatCircleDistanceM(node.at, makeCoordinate(s.lat, s.lon));
      const steps = Math.max(2, Math.ceil(dist / 1000));
      const prof: number[] = [];
      let ok = true;
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        const lon = node.at.longitudeEast + (s.lon + 360 * Math.round((node.at.longitudeEast - s.lon) / 360) - node.at.longitudeEast) * f;
        const z = elevation(store, lon, node.at.latitude + (s.lat - node.at.latitude) * f);
        if (z == null) {
          ok = false;
          break;
        }
        prof.push(z);
      }
      if (!ok) continue;
      anyData = true;
      if (profileClear(prof, dist, node.antennaM ?? 0, crewAntennaM)) return 'clear';
    }
    return anyData ? 'blocked' : 'no-data';
  });

  const out: CommSegment[] = [];
  for (let i = 0; i + 1 < samples.length; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (a.leg !== b.leg) continue;
    const state = states[i] === states[i + 1] ? states[i] : states[i] === 'blocked' || states[i + 1] === 'blocked' ? 'blocked' : states[i];
    const last = out[out.length - 1];
    const pa = makeCoordinate(a.lat, a.lon);
    const pb = makeCoordinate(b.lat, b.lon);
    if (last && last.state === state && last.segmentIndex === a.leg.index) {
      last.toKm = b.km;
      last.path.push(pb);
    } else out.push({ fromKm: a.km, toKm: b.km, state, path: [pa, pb], segmentIndex: a.leg.index, segmentLabel: a.leg.label });
  }
  return out;
}

export function commHits(segments: CommSegment[]): RouteHazardHit[] {
  const cat = CATEGORY_BY_CODE.C;
  return segments
    .filter((s) => s.state === 'blocked')
    .map((s, k) => ({
      id: `C-${k}`,
      code: 'C' as const,
      colour: cat.colour,
      featureId: 'C',
      title: `${cat.name}: terrain blocks line of sight`,
      detail: `No configured habitat, rover or relay antenna has terrain line of sight to the crew for about ${(s.toKm - s.fromKm).toFixed(1)} km (MOLA 3.7 km terrain, spherical bulge). Line of sight alone is not a radio-link assessment.`,
      segmentIndex: s.segmentIndex,
      segmentLabel: s.segmentLabel,
      fromKm: s.fromKm,
      toKm: s.toKm,
      at: s.path[Math.floor(s.path.length / 2)],
      path: s.path,
    }));
}

/* ------------------------------------------------------------ sun layer */

/**
 * V: where the Sun is below the ideal (smooth) horizon at the planned time, from Mars24.
 * Shaded with the category's shadow stripes; the edge of the shading is the terminator.
 * Terrain shadows and atmospheric visibility are NOT in this layer.
 */
export class NightLayer extends L.GridLayer {
  private ms = 0;
  private fill = 0.2;

  constructor() {
    super({ tileSize: 256, pane: HAZARD_PANES.area.name, minZoom: 0, maxZoom: 18, updateWhenZooming: false, keepBuffer: 1, className: 'hz-tile' });
  }

  set(ms: number, fill: number) {
    if (ms === this.ms && fill === this.fill) return;
    this.ms = ms;
    this.fill = fill;
    this.redraw();
  }

  protected createTile(coords: L.Coords): HTMLElement {
    const ratio = window.devicePixelRatio > 1.5 ? 2 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256 * ratio;
    const nw = this._map.unproject(coords.scaleBy(L.point(256, 256)), coords.z);
    const se = this._map.unproject(coords.add(L.point(1, 1)).scaleBy(L.point(256, 256)), coords.z);
    const t = marsTime(this.ms);
    const N = 32;
    const cell = canvas.width / N;
    const night: boolean[] = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const lat = nw.lat + ((se.lat - nw.lat) * (y + 0.5)) / N;
        const lon = nw.lng + ((se.lng - nw.lng) * (x + 0.5)) / N;
        night.push(Math.abs(lat) <= 90 && localSolar(t, lat, normalizeLon(lon)).elevation < 0);
      }
    const ctx = canvas.getContext('2d')!;
    const path = new Path2D();
    const edges = new Path2D();
    const isN = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && night[y * N + x];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (!night[y * N + x]) continue;
        path.rect(x * cell, y * cell, cell + 0.5, cell + 0.5);
        // outline only where night meets day inside the tile (tile edges are not boundaries)
        if (y > 0 && !isN(x, y - 1)) (edges.moveTo(x * cell, y * cell), edges.lineTo((x + 1) * cell, y * cell));
        if (y < N - 1 && !isN(x, y + 1)) (edges.moveTo(x * cell, (y + 1) * cell), edges.lineTo((x + 1) * cell, (y + 1) * cell));
        if (x > 0 && !isN(x - 1, y)) (edges.moveTo(x * cell, y * cell), edges.lineTo(x * cell, (y + 1) * cell));
        if (x < N - 1 && !isN(x + 1, y)) (edges.moveTo((x + 1) * cell, y * cell), edges.lineTo((x + 1) * cell, (y + 1) * cell));
      }
    const cat = CATEGORY_BY_CODE.V;
    if (this.fill > 0) {
      ctx.globalAlpha = this.fill;
      ctx.fillStyle = '#171413';
      ctx.fill(path);
      ctx.globalAlpha = Math.min(1, this.fill * 2 + 0.25);
      ctx.fillStyle = ctx.createPattern(patternTile('V', ratio), 'repeat')!;
      ctx.fill(path);
    }
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = cat.colour;
    ctx.lineWidth = 2 * ratio;
    ctx.stroke(edges);
    return canvas;
  }
}

/** The subsolar point (planetographic declination used as latitude: within ~0.4°). */
export function subsolarPoint(ms: number): MarsCoordinate {
  const t = marsTime(ms);
  return makeCoordinate(t.declination, normalizeLon(-t.subsolarLonWest));
}

/* -------------------------------------------------------------- markers */

export function noteIcon(colour: string, lines: string[], cls = ''): L.DivIcon {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return L.divIcon({
    className: `hz-note-pin ${cls}`,
    html: `<span class="hz-note-pin__dot" style="--c:${colour}"></span><span class="hz-note-pin__text">${lines.map(esc).join('<br>')}</span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/** A ring of a stated radius (m) around a point, as a polygon (spherical, map frame). */
export function ringLatLngs(at: MarsCoordinate, radiusM: number, nearLng: number): L.LatLng[] {
  const out: L.LatLng[] = [];
  const shift = 360 * Math.round((nearLng - at.longitudeEast) / 360);
  for (let k = 0; k <= 64; k++) {
    const [lon, lat] = destination(at.latitude, at.longitudeEast, (k * 360) / 64, radiusM);
    out.push(L.latLng(lat, lon + 360 * Math.round((at.longitudeEast - lon) / 360) + shift));
  }
  return out;
}
