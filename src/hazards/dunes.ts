import * as L from 'leaflet';
import { normalizeLon } from '../science/molaDem';
import { greatCircleDistanceM, makeCoordinate, type MarsCoordinate } from '../shared';
import { CATEGORY_BY_CODE } from './categories';
import { patternTile } from './patterns';
import { HAZARD_PANES } from './structures';

/**
 * USGS Mars Global Digital Dune Database (MGD³) dune-field outlines, category S, prepared by
 * scripts/prepare-hazard-dunes.mjs. Rings are [longitude, latitude] in the map's own frame
 * (planetocentric, east −180…180°): no transformation. Drawn exactly as mapped; nothing is
 * drawn around an observation centre.
 */

export interface DuneFeature {
  id: string;
  duneId: string;
  /** [lon, lat] of the field centroid, as in the database */
  centre: [number, number];
  types: string[];
  typeCode: string;
  confidence: number | null;
  confidenceText: string | null;
  environment: string[];
  areaKm2: number | null;
  craterDiameterKm: number | null;
  images: { themisIR: string | null; themisVIS: string | null; moc: string | null };
  rings: [number, number][][];
  /** Computed on load */
  box: { w: number; e: number; s: number; n: number };
}

export interface DuneData {
  source: string;
  url: string;
  frame: string;
  coverage: string;
  method: string;
  completeness: string;
  simplification: string;
  count: number;
  features: DuneFeature[];
}

export const DUNES_URL = `${import.meta.env.BASE_URL}data/hazards/dunes.json`;

let cache: Promise<DuneData> | null = null;
export function loadDunes(): Promise<DuneData> {
  if (!cache) {
    cache = fetch(DUNES_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`USGS dune fields: HTTP ${res.status}`);
        return res.json() as Promise<DuneData>;
      })
      .then((d) => {
        for (const f of d.features) {
          const b = { w: Infinity, e: -Infinity, s: Infinity, n: -Infinity };
          for (const r of f.rings)
            for (const [x, y] of r) {
              if (x < b.w) b.w = x;
              if (x > b.e) b.e = x;
              if (y < b.s) b.s = y;
              if (y > b.n) b.n = y;
            }
          f.box = b;
        }
        return d;
      });
    cache.catch(() => (cache = null));
  }
  return cache;
}

/* --------------------------------------------------------------- geometry */

function inRing(x: number, y: number, r: [number, number][]) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Even–odd containment over all rings (holes included). lon in any world copy. */
export function featureContains(f: DuneFeature, lon: number, lat: number): boolean {
  const x = lon + 360 * Math.round(((f.box.w + f.box.e) / 2 - lon) / 360);
  if (x < f.box.w || x > f.box.e || lat < f.box.s || lat > f.box.n) return false;
  return f.rings.reduce((c, r) => (inRing(x, lat, r) ? !c : c), false);
}

/** Smallest distance in degrees (equirectangular, as drawn) from a point to the outline. */
function edgeDistanceDeg(f: DuneFeature, lon: number, lat: number): number {
  const x = lon + 360 * Math.round(((f.box.w + f.box.e) / 2 - lon) / 360);
  let best = Infinity;
  for (const r of f.rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j];
      const [bx, by] = r[i];
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (lat - ay) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(x - (ax + t * dx), lat - (ay + t * dy)));
    }
  return best;
}

/** Great-circle distance (km) from a point to the outline; 0 inside. */
export function distanceToFieldKm(f: DuneFeature, at: MarsCoordinate): number {
  if (featureContains(f, at.longitudeEast, at.latitude)) return 0;
  const x = at.longitudeEast + 360 * Math.round(((f.box.w + f.box.e) / 2 - at.longitudeEast) / 360);
  let best = Infinity;
  let bp: [number, number] = f.rings[0][0];
  for (const r of f.rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j];
      const [bx, by] = r[i];
      const k = Math.cos((at.latitude * Math.PI) / 180);
      const dx = (bx - ax) * k;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * k * dx + (at.latitude - ay) * dy) / l2)) : 0;
      const px = ax + t * (bx - ax);
      const py = ay + t * dy;
      const d = Math.hypot((x - px) * k, at.latitude - py);
      if (d < best) {
        best = d;
        bp = [px, py];
      }
    }
  return greatCircleDistanceM(at, makeCoordinate(bp[1], bp[0])) / 1000;
}

/** Fields under a tap: containing it, or within `tolPx` screen pixels of the outline. */
export function hitTestDunes(map: L.Map, data: DuneData, latlng: L.LatLng, tolPx: number): DuneFeature[] {
  const degPerPx = Math.abs(map.containerPointToLatLng([1, 0]).lng - map.containerPointToLatLng([0, 0]).lng);
  const tol = tolPx * degPerPx;
  const lon = latlng.lng;
  const lat = latlng.lat;
  const out: DuneFeature[] = [];
  for (const f of data.features) {
    const x = lon + 360 * Math.round(((f.box.w + f.box.e) / 2 - lon) / 360);
    if (x < f.box.w - tol || x > f.box.e + tol || lat < f.box.s - tol || lat > f.box.n + tol) continue;
    if (featureContains(f, lon, lat) || edgeDistanceDeg(f, lon, lat) <= tol) out.push(f);
  }
  return out;
}

export interface DuneAssociation {
  kind: 'inside' | 'near' | 'none';
  field: DuneFeature | null;
  distanceKm: number;
}

/** How far an observation centre lies from the nearest mapped field. Never a boundary for the record itself. */
export const NEAR_FIELD_KM = 15;
export function associateDunes(data: DuneData, at: MarsCoordinate): DuneAssociation {
  let best: DuneAssociation = { kind: 'none', field: null, distanceKm: Infinity };
  for (const f of data.features) {
    // Quick reject with a true lower bound: the latitude gap alone (1° of latitude ≈ 59.27 km)
    const latGap = Math.max(0, f.box.s - at.latitude, at.latitude - f.box.n);
    if (latGap * 59.27 > best.distanceKm) continue;
    const d = distanceToFieldKm(f, at);
    if (d < best.distanceKm) best = { kind: d === 0 ? 'inside' : d <= NEAR_FIELD_KM ? 'near' : 'none', field: f, distanceKm: d };
  }
  return best;
}

/* ------------------------------------------------------------------ layer */

/**
 * Canvas tiles: every mapped field in the tile, filled in the category colour at the
 * chosen shading, with the wavy-line pattern clipped to the outline, and a solid outline.
 */
export class DuneLayer extends L.GridLayer {
  private fillOpacity = 0.2;

  constructor(private readonly data: DuneData) {
    super({ tileSize: 256, pane: HAZARD_PANES.area.name, minZoom: 0, maxZoom: 18, updateWhenZooming: false, keepBuffer: 1, className: 'hz-tile' });
  }

  setFill(fillOpacity: number) {
    if (fillOpacity === this.fillOpacity) return;
    this.fillOpacity = fillOpacity;
    this.redraw();
  }

  /** Features overlapping the current view (any world copy), for the data check. */
  countInView(map: L.Map): number {
    const b = map.getBounds();
    const w = b.getWest();
    const e = b.getEast();
    let n = 0;
    for (const f of this.data.features) {
      if (f.box.n < b.getSouth() || f.box.s > b.getNorth()) continue;
      for (const k of [-360, 0, 360]) {
        if (f.box.e + k >= w && f.box.w + k <= e) {
          n++;
          break;
        }
      }
    }
    return n;
  }

  protected createTile(coords: L.Coords): HTMLElement {
    const ratio = window.devicePixelRatio > 1.5 ? 2 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256 * ratio;
    const nw = this._map.unproject(coords.scaleBy(L.point(256, 256)), coords.z);
    const se = this._map.unproject(coords.add(L.point(1, 1)).scaleBy(L.point(256, 256)), coords.z);
    const west = normalizeLon(nw.lng);
    const east = west + (se.lng - nw.lng);
    this.draw(canvas, ratio, nw.lat, se.lat, west, east);
    return canvas;
  }

  private draw(canvas: HTMLCanvasElement, ratio: number, north: number, south: number, west: number, east: number) {
    const ctx = canvas.getContext('2d')!;
    const size = canvas.width;
    const sx = size / (east - west);
    const sy = size / (north - south);
    const cat = CATEGORY_BY_CODE.S;
    const path = new Path2D();
    let any = false;
    for (const f of this.data.features) {
      if (f.box.n < south || f.box.s > north) continue;
      for (const k of [-360, 0, 360]) {
        if (f.box.e + k < west || f.box.w + k > east) continue;
        any = true;
        for (const r of f.rings) {
          r.forEach(([x, y], i) => {
            const px = (x + k - west) * sx;
            const py = (north - y) * sy;
            if (i === 0) path.moveTo(px, py);
            else path.lineTo(px, py);
          });
          path.closePath();
        }
      }
    }
    if (!any) return;
    if (this.fillOpacity > 0) {
      ctx.globalAlpha = this.fillOpacity;
      ctx.fillStyle = cat.colour;
      ctx.fill(path, 'evenodd');
      ctx.globalAlpha = Math.min(1, this.fillOpacity * 2 + 0.3);
      ctx.fillStyle = ctx.createPattern(patternTile('S', ratio), 'repeat')!;
      ctx.fill(path, 'evenodd');
    }
    // Dark casing under a solid outline, so the edge reads on bright and dark terrain alike
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#171413';
    ctx.lineWidth = 3.2 * ratio;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cat.colour;
    ctx.lineWidth = 1.6 * ratio;
    ctx.stroke(path);
  }
}

/** Outline overlay for the selected field (in the selection pane, above the area layer). */
export function selectedDuneOverlay(f: DuneFeature, nearLng: number): L.Layer {
  const k = 360 * Math.round((nearLng - (f.box.w + f.box.e) / 2) / 360);
  const latlngs = f.rings.map((r) => r.map(([x, y]) => L.latLng(y, x + k)));
  return L.layerGroup([
    L.polygon(latlngs, { pane: HAZARD_PANES.selection.name, color: '#F3E5DC', weight: 6, opacity: 0.85, fill: false, interactive: false }),
    L.polygon(latlngs, { pane: HAZARD_PANES.selection.name, color: CATEGORY_BY_CODE.S.colour, weight: 3, fillOpacity: 0.1, interactive: false }),
  ]);
}

export function duneBounds(f: DuneFeature, nearLng: number): L.LatLngBounds {
  const k = 360 * Math.round((nearLng - (f.box.w + f.box.e) / 2) / 360);
  return L.latLngBounds([f.box.s, f.box.w + k], [f.box.n, f.box.e + k]);
}
