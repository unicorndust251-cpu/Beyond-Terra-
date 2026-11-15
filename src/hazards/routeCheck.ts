import type { DemStore } from '../science/molaDem';
import {
  greatCircleDistanceM,
  makeCoordinate,
  type HazardCode,
  type PlannedRoute,
  type RouteHazardHit,
  type RouteCheckState,
  type RouteHazardReport,
} from '../shared';
import { CATEGORY_BY_CODE } from './categories';
import { OBSERVATIONS } from './observations';
import { SLOPE_LEVEL, slopeAt } from './slopeCells';
import type { StructureData, StructureFeature } from './structures';

/**
 * Tests the planner's route line against the mapped hazard geometry in this project.
 *
 * The route is tested exactly as the planner draws it: straight lines between consecutive
 * stops on the map's equirectangular grid, each leg taking the shorter way round in
 * longitude. Along-route distances are great-circle approximations (sphere R = 3,396.19 km,
 * the map's IAU 2000 sphere), as in the planner.
 *
 * - F, P: segment/segment intersection with the USGS SIM 3292 axes (lines only, no width).
 * - SL: every MOLA MEGDR 16 px/deg bin the line passes through (grid traversal, not sampling).
 * Nothing else has mapped geometry, so nothing else is tested; those are reported as such.
 */

export const NO_ALTERNATIVE = 'No assessed alternative available. Additional local terrain information is required.';
/** Catalogue observations closer than this to the line are listed as context. */
export const NEARBY_OBSERVATION_KM = 10;

type LonLat = [number, number];

interface Leg {
  index: number;
  label: string;
  a: LonLat;
  b: LonLat;
  km: number;
  startKm: number;
}

const km = (a: LonLat, b: LonLat) => greatCircleDistanceM(makeCoordinate(a[1], a[0]), makeCoordinate(b[1], b[0])) / 1000;
const lerp = (a: LonLat, b: LonLat, t: number): LonLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const coord = (p: LonLat) => makeCoordinate(p[1], p[0]);

/** Stops as drawn: each in the world copy nearest the previous one. */
export function routeLegs(route: PlannedRoute): Leg[] {
  const pts: LonLat[] = [];
  let near = route.stops[0]?.coordinate.longitudeEast ?? 0;
  for (const s of route.stops) {
    const lon = s.coordinate.longitudeEast + 360 * Math.round((near - s.coordinate.longitudeEast) / 360);
    near = lon;
    pts.push([lon, s.coordinate.latitude]);
  }
  const legs: Leg[] = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = km(pts[i], pts[i + 1]);
    legs.push({ index: i, label: `${route.stops[i].label} → ${route.stops[i + 1].label}`, a: pts[i], b: pts[i + 1], km: d, startKm: total });
    total += d;
  }
  return legs;
}

/* ------------------------------------------------------------ USGS lines */

interface Box {
  w: number;
  e: number;
  s: number;
  n: number;
}

const boxCache = new WeakMap<StructureFeature, Box>();
function featureBox(f: StructureFeature): Box {
  let b = boxCache.get(f);
  if (!b) {
    b = { w: Infinity, e: -Infinity, s: Infinity, n: -Infinity };
    for (const part of f.lines)
      for (const [lon, lat] of part) {
        b.w = Math.min(b.w, lon);
        b.e = Math.max(b.e, lon);
        b.s = Math.min(b.s, lat);
        b.n = Math.max(b.n, lat);
      }
    boxCache.set(f, b);
  }
  return b;
}

/** Parameter t on p→p2 where it crosses q→q2, or null. */
function crossing(p: LonLat, p2: LonLat, q: LonLat, q2: LonLat): number | null {
  const rx = p2[0] - p[0];
  const ry = p2[1] - p[1];
  const sx = q2[0] - q[0];
  const sy = q2[1] - q[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qpx = q[0] - p[0];
  const qpy = q[1] - p[1];
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

function lineHits(legs: Leg[], data: StructureData): RouteHazardHit[] {
  const hits: RouteHazardHit[] = [];
  for (const leg of legs) {
    const lw = Math.min(leg.a[0], leg.b[0]);
    const le = Math.max(leg.a[0], leg.b[0]);
    const ls = Math.min(leg.a[1], leg.b[1]);
    const ln = Math.max(leg.a[1], leg.b[1]);
    for (const f of data.features) {
      const fb = featureBox(f);
      if (fb.n < ls || fb.s > ln) continue;
      const ts: number[] = [];
      for (const offset of [-720, -360, 0, 360, 720]) {
        if (fb.e + offset < lw || fb.w + offset > le) continue;
        for (const part of f.lines) {
          for (let k = 0; k + 1 < part.length; k++) {
            const t = crossing(leg.a, leg.b, [part[k][0] + offset, part[k][1]], [part[k + 1][0] + offset, part[k + 1][1]]);
            if (t !== null) ts.push(t);
          }
        }
      }
      if (!ts.length) continue;
      ts.sort((x, y) => x - y);
      const cat = CATEGORY_BY_CODE[f.category];
      const at = lerp(leg.a, leg.b, ts[0]);
      const firstKm = leg.startKm + leg.km * ts[0];
      const lastKm = leg.startKm + leg.km * ts[ts.length - 1];
      hits.push({
        id: `${f.id}@${leg.index}`,
        code: f.category,
        colour: cat.colour,
        featureId: f.id,
        title: `${cat.name}: ${f.interpretation}`,
        detail:
          `${ts.length === 1 ? 'The route line crosses' : `The route line crosses ${ts.length} times`} the mapped axis of USGS feature ${f.id}` +
          ` (SIM 3292, 1:20,000,000). The axis is a line: the trough’s width, depth and wall slopes are not mapped, so this marks where to look, not the size of the obstacle.`,
        segmentIndex: leg.index,
        segmentLabel: leg.label,
        fromKm: firstKm,
        toKm: lastKm,
        at: coord(at),
        path: ts.map((t) => coord(lerp(leg.a, leg.b, t))),
      });
    }
  }
  return hits;
}

/* ---------------------------------------------------------- slope cells */

/** Every grid cell the straight line a→b passes through, with entry/exit parameters (Amanatides–Woo). */
function* gridCells(ax: number, ay: number, bx: number, by: number): Generator<{ cx: number; cy: number; t0: number; t1: number }> {
  let cx = Math.floor(ax);
  let cy = Math.floor(ay);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  const dx = bx - ax;
  const dy = by - ay;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tdx = stepX ? Math.abs(1 / dx) : Infinity;
  const tdy = stepY ? Math.abs(1 / dy) : Infinity;
  let tmx = stepX > 0 ? (cx + 1 - ax) / dx : stepX < 0 ? (ax - cx) / -dx : Infinity;
  let tmy = stepY > 0 ? (cy + 1 - ay) / dy : stepY < 0 ? (ay - cy) / -dy : Infinity;
  let t = 0;
  for (let guard = 0; guard < 100000; guard++) {
    const done = cx === ex && cy === ey;
    const next = done ? 1 : Math.min(tmx, tmy, 1);
    yield { cx, cy, t0: t, t1: next };
    if (done || next >= 1) return;
    t = next;
    if (tmx < tmy) {
      cx += stepX;
      tmx += tdx;
    } else {
      cy += stepY;
      tmy += tdy;
    }
  }
}

interface SlopeRun {
  leg: Leg;
  t0: number;
  t1: number;
  cells: number;
  maxSlope: number;
  maxAt: LonLat;
  maxId: string;
}

async function slopeHits(legs: Leg[], store: DemStore, threshold: number) {
  const m = store.manifest;
  const ppd = m.pixelsPerDegree;
  const n = m.tilePixels;
  const maxI = 180 * ppd;
  const maxJ = 360 * ppd;
  const toGrid = (p: LonLat): [number, number] => [(p[0] + 180) * ppd, (90 - p[1]) * ppd];
  const cellIJ = (cx: number, cy: number) => ({ i: Math.min(maxI - 1, Math.max(0, cy)), j: ((cx % maxJ) + maxJ) % maxJ });

  // Load every elevation tile the line passes over (only once each)
  const tiles = new Map<string, [number, number]>();
  for (const leg of legs) {
    const [ax, ay] = toGrid(leg.a);
    const [bx, by] = toGrid(leg.b);
    for (const c of gridCells(ax, ay, bx, by)) {
      const { i, j } = cellIJ(c.cx, c.cy);
      const key = `${Math.floor(i / n)}_${Math.floor(j / n)}`;
      if (!tiles.has(key)) tiles.set(key, [Math.floor(i / n), Math.floor(j / n)]);
    }
  }
  await Promise.allSettled([...tiles.values()].map(([r, c]) => store.getTile(r, c)));

  let steepKm = 0;
  let belowKm = 0;
  let unavailableKm = 0;
  const runs: SlopeRun[] = [];
  for (const leg of legs) {
    const [ax, ay] = toGrid(leg.a);
    const [bx, by] = toGrid(leg.b);
    let run: SlopeRun | null = null;
    for (const c of gridCells(ax, ay, bx, by)) {
      const { i, j } = cellIJ(c.cx, c.cy);
      const s = slopeAt(store, i, j);
      const pieceKm = km(lerp(leg.a, leg.b, c.t0), lerp(leg.a, leg.b, c.t1));
      if (s === undefined || Number.isNaN(s)) {
        unavailableKm += pieceKm;
        run = null;
        continue;
      }
      if (s < threshold) {
        belowKm += pieceKm;
        run = null;
        continue;
      }
      steepKm += pieceKm;
      const centre = lerp(leg.a, leg.b, (c.t0 + c.t1) / 2);
      if (!run) {
        run = { leg, t0: c.t0, t1: c.t1, cells: 0, maxSlope: -1, maxAt: centre, maxId: '' };
        runs.push(run);
      }
      run.t1 = c.t1;
      run.cells++;
      if (s > run.maxSlope) {
        run.maxSlope = s;
        run.maxAt = centre;
        run.maxId = `SL:${i}:${j}`;
      }
    }
  }

  const cat = CATEGORY_BY_CODE.SL;
  const hits: RouteHazardHit[] = runs.map((r, k) => {
    const a = lerp(r.leg.a, r.leg.b, r.t0);
    const b = lerp(r.leg.a, r.leg.b, r.t1);
    const len = km(a, b);
    return {
      id: `SL-run-${k}`,
      code: 'SL',
      colour: cat.colour,
      featureId: r.maxId,
      title: `${cat.name} (≥ ${threshold}°)`,
      detail:
        `${r.cells} MOLA bin${r.cells === 1 ? '' : 's'} at or above ${threshold}° along about ${len.toFixed(1)} km of the line; steepest ${r.maxSlope.toFixed(1)}°. ` +
        `Slopes are over the 3.7 km bin spacing of MOLA MEGDR ${SLOPE_LEVEL}: local slopes can be much steeper or gentler. The threshold is your planning setting, not a limit for walking or driving.`,
      segmentIndex: r.leg.index,
      segmentLabel: r.leg.label,
      fromKm: r.leg.startKm + r.leg.km * r.t0,
      toKm: r.leg.startKm + r.leg.km * r.t1,
      at: coord(r.maxAt),
      path: [coord(a), coord(b)],
    };
  });
  return { hits, steepKm, belowKm, unavailableKm };
}

/* ---------------------------------------------------------- observations */

/** Distance (km) from a point to a leg, using a local equirectangular projection for the nearest point. */
function distanceToLegKm(p: LonLat, leg: Leg): number {
  const mid = (leg.a[0] + leg.b[0]) / 2;
  const q: LonLat = [p[0] + 360 * Math.round((mid - p[0]) / 360), p[1]];
  const k = Math.cos((q[1] * Math.PI) / 180);
  const ax = leg.a[0] * k;
  const bx = leg.b[0] * k;
  const qx = q[0] * k;
  const dx = bx - ax;
  const dy = leg.b[1] - leg.a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((qx - ax) * dx + (q[1] - leg.a[1]) * dy) / len2)) : 0;
  return km(q, lerp(leg.a, leg.b, t));
}

function nearbyObservations(legs: Leg[]) {
  const out: RouteHazardReport['nearbyObservations'] = [];
  for (const o of OBSERVATIONS) {
    const p: LonLat = [o.observationCentre.longitudeEast, o.observationCentre.latitude];
    const d = Math.min(...legs.map((l) => distanceToLegKm(p, l)));
    if (d <= NEARBY_OBSERVATION_KM) out.push({ id: o.id, title: o.name, distanceKm: d });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

/* ---------------------------------------------------------------- report */

export type DataState<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

const CATALOGUE_ONLY: HazardCode[] = ['L', 'S', 'B', 'G', 'I', 'D'];
const NO_DATASET: HazardCode[] = ['V', 'T', 'R', 'C', 'N', 'E', 'M'];

export async function checkRoute(
  route: PlannedRoute,
  structures: DataState<StructureData>,
  slope: DataState<DemStore>,
  thresholdDeg: number,
): Promise<RouteHazardReport> {
  const legs = routeLegs(route);
  const hits: RouteHazardHit[] = [];
  const checks: RouteHazardReport['checks'] = [];
  const check = (code: HazardCode, state: RouteCheckState, note: string) =>
    checks.push({ code, name: CATEGORY_BY_CODE[code].name, colour: CATEGORY_BY_CODE[code].colour, state, note });

  const unavailable = (s: DataState<unknown>, name: string) =>
    s.state === 'loading' ? `${name} still loading.` : `Mapped dataset unavailable: ${s.state === 'error' ? s.message : name}.`;

  if (structures.state === 'ready') {
    hits.push(...lineHits(legs, structures.data));
    for (const code of ['F', 'P'] as const)
      check(code, 'checked', 'Tested against USGS SIM 3292 mapped axes (lines only; no width is mapped).');
  } else {
    for (const code of ['F', 'P'] as const) check(code, 'unavailable', unavailable(structures, 'USGS structure lines'));
  }

  let slopeSummary: RouteHazardReport['slope'] = null;
  if (slope.state === 'ready') {
    const r = await slopeHits(legs, slope.data, thresholdDeg);
    hits.push(...r.hits);
    slopeSummary = { thresholdDeg, steepKm: r.steepKm, belowKm: r.belowKm, unavailableKm: r.unavailableKm };
    check('SL', 'checked', `Every MOLA ${SLOPE_LEVEL} bin (3.7 km) under the line, classified at ${thresholdDeg}°.`);
  } else {
    check('SL', 'unavailable', unavailable(slope, 'MOLA elevations'));
  }

  for (const code of CATALOGUE_ONLY)
    check(code, 'no-geometry', 'Catalogue observation centres only: no mapped extent, so the route cannot be tested.');
  for (const code of NO_DATASET) check(code, 'no-geometry', 'Not assessed: no dataset in this project.');
  check(
    'U',
    'no-geometry',
    'The whole route is unassessed at walking scale: the finest data here are 3.7 km slope bins and 1:20,000,000 lines.',
  );

  hits.sort((a, b) => a.fromKm - b.fromKm);
  return {
    signature: `${route.signature}|${thresholdDeg}`,
    status: 'ready',
    hits,
    checks,
    slope: slopeSummary,
    nearbyObservations: nearbyObservations(legs),
    alternative: { available: false, message: NO_ALTERNATIVE },
  };
}
