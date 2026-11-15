import * as L from 'leaflet';
import { greatCircleDistanceM, makeCoordinate, type HazardCode, type MarsCoordinate } from '../shared';
import { CATEGORY_BY_CODE } from './categories';

/**
 * USGS SIM 3292 tectonic troughs (graben axes → F, pit crater chains → P), prepared by
 * scripts/prepare-hazard-structures.mjs. Coordinates are [longitude, latitude] in the map's
 * own frame (planetocentric, east −180…180°, Mars 2000 sphere): no transformation.
 *
 * Each feature is a mapped AXIS. It is drawn as a line only: no width or area is invented.
 */

export interface StructureFeature {
  id: string;
  category: Extract<HazardCode, 'F' | 'P'>;
  interpretation: string;
  preservation: string | null;
  dimension: string | null;
  lengthKm: number | null;
  /** Parts, each [lon, lat][] */
  lines: [number, number][][];
}

export interface StructureData {
  source: string;
  url: string;
  scale: string;
  frame: string;
  simplification: string;
  features: StructureFeature[];
}

export const STRUCTURES_URL = `${import.meta.env.BASE_URL}data/hazards/structures.json`;

let cache: Promise<StructureData> | null = null;
export function loadStructures(): Promise<StructureData> {
  if (!cache) {
    cache = fetch(STRUCTURES_URL).then((res) => {
      if (!res.ok) throw new Error(`USGS structure lines: HTTP ${res.status}`);
      return res.json() as Promise<StructureData>;
    });
    cache.catch(() => (cache = null));
  }
  return cache;
}

export const HAZARD_PANES = {
  area: { name: 'btHazardArea', zIndex: 380 },
  lines: { name: 'btHazardLines', zIndex: 390 },
  selection: { name: 'btHazardSelection', zIndex: 395 },
} as const;

export function ensureHazardPanes(map: L.Map) {
  for (const { name, zIndex } of Object.values(HAZARD_PANES)) {
    const pane = map.getPane(name) ?? map.createPane(name);
    pane.style.zIndex = String(zIndex);
    pane.style.pointerEvents = 'none';
  }
}

/** Default outline width (screen px) and the selected width: display settings only. */
export const LINE_WEIGHT = 2;
export const SELECTED_WEIGHT = 3.5;

function lineStyle(f: StructureFeature, hovered: boolean): L.PolylineOptions {
  const cat = CATEGORY_BY_CODE[f.category];
  return {
    color: cat.colour,
    weight: hovered ? LINE_WEIGHT + 1 : LINE_WEIGHT,
    opacity: hovered ? 1 : 0.9,
    // Pit chains are drawn broken, troughs solid, so the two read apart beyond colour
    dashArray: f.category === 'P' ? '7 4' : undefined,
    lineCap: 'round',
    interactive: false,
  };
}

/**
 * Draws the lines of the active categories, in three world copies so they follow the map
 * across ±180°. Hit testing is geographic (see hitTest); the paths themselves are inert.
 */
export class StructureLayer {
  private readonly renderer: L.Canvas;
  private readonly group: L.LayerGroup;
  private readonly paths = new Map<string, L.Polyline[]>();
  private hovered: string | null = null;

  constructor(
    map: L.Map,
    private readonly data: StructureData,
  ) {
    this.renderer = L.canvas({ pane: HAZARD_PANES.lines.name, padding: 0.3 });
    this.group = L.layerGroup().addTo(map);
  }

  setActive(active: HazardCode[]) {
    this.group.clearLayers();
    this.paths.clear();
    for (const f of this.data.features) {
      if (!active.includes(f.category)) continue;
      const list: L.Polyline[] = [];
      for (const offset of [-360, 0, 360]) {
        const latlngs = f.lines.map((part) => part.map(([lon, lat]) => L.latLng(lat, lon + offset)));
        const pl = L.polyline(latlngs, { ...lineStyle(f, f.id === this.hovered), renderer: this.renderer, pane: HAZARD_PANES.lines.name });
        pl.addTo(this.group);
        list.push(pl);
      }
      this.paths.set(f.id, list);
    }
  }

  setHovered(id: string | null) {
    if (id === this.hovered) return;
    const prev = this.hovered;
    this.hovered = id;
    for (const key of [prev, id]) {
      if (!key) continue;
      const f = this.data.features.find((x) => x.id === key);
      if (f) this.paths.get(key)?.forEach((p) => p.setStyle(lineStyle(f, key === id)));
    }
  }

  remove() {
    this.group.remove();
    this.renderer.remove();
  }
}

export interface LineHit {
  feature: StructureFeature;
  /** Screen distance from the tap (px) */
  distancePx: number;
  /** Nearest point on the line to the tap */
  nearest: MarsCoordinate;
}

/** Distance from p to segment ab, and the parameter of the nearest point. */
function segmentDistance(p: L.Point, a: L.Point, b: L.Point): { d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y), t };
}

/**
 * Lines within `tolerancePx` screen pixels of a tap. The tolerance widens the target for
 * fingers; it does not widen the feature, which stays a line.
 */
export function hitTestLines(map: L.Map, data: StructureData, active: HazardCode[], at: L.LatLng, tolerancePx: number): LineHit[] {
  const p = map.latLngToContainerPoint(at);
  const offset = 360 * Math.round(at.lng / 360);
  const tolDeg = (tolerancePx / Math.pow(2, map.getZoom())) * (360 / 512) * 1.5;
  const hits: LineHit[] = [];
  for (const f of data.features) {
    if (!active.includes(f.category)) continue;
    let best: LineHit | null = null;
    for (const part of f.lines) {
      for (let k = 0; k + 1 < part.length; k++) {
        const [lon1, lat1] = part[k];
        const [lon2, lat2] = part[k + 1];
        // Cheap reject in degrees before projecting
        const x = at.lng - offset;
        if (x < Math.min(lon1, lon2) - tolDeg || x > Math.max(lon1, lon2) + tolDeg) continue;
        if (at.lat < Math.min(lat1, lat2) - tolDeg || at.lat > Math.max(lat1, lat2) + tolDeg) continue;
        const a = map.latLngToContainerPoint([lat1, lon1 + offset]);
        const b = map.latLngToContainerPoint([lat2, lon2 + offset]);
        const { d, t } = segmentDistance(p, a, b);
        if (d <= tolerancePx && (!best || d < best.distancePx)) {
          best = {
            feature: f,
            distancePx: d,
            nearest: makeCoordinate(lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t),
          };
        }
      }
    }
    if (best) hits.push(best);
  }
  return hits.sort((a, b) => a.distancePx - b.distancePx);
}

/** Bounds of a feature in the world copy nearest a longitude. */
export function featureBounds(f: StructureFeature, nearLng: number): L.LatLngBounds {
  const pts = f.lines.flat();
  const mid = pts[Math.floor(pts.length / 2)][0];
  const offset = 360 * Math.round((nearLng - mid) / 360);
  return L.latLngBounds(pts.map(([lon, lat]) => L.latLng(lat, lon + offset)));
}

/** Highlight for a selected line: an ivory halo under a wider line in the category colour. */
export function selectedLineOverlay(f: StructureFeature, nearLng: number, reduced: boolean): L.LayerGroup {
  const cat = CATEGORY_BY_CODE[f.category];
  const pts = f.lines.flat();
  const mid = pts[Math.floor(pts.length / 2)][0];
  const offset = 360 * Math.round((nearLng - mid) / 360);
  const latlngs = f.lines.map((part) => part.map(([lon, lat]) => L.latLng(lat, lon + offset)));
  const pane = HAZARD_PANES.selection.name;
  return L.layerGroup([
    L.polyline(latlngs, { pane, color: '#F3E5DC', weight: SELECTED_WEIGHT + 4, opacity: 0.85, interactive: false, lineCap: 'round', className: reduced ? '' : 'hz-sel-halo' }),
    L.polyline(latlngs, { pane, color: cat.colour, weight: SELECTED_WEIGHT, opacity: 1, interactive: false, lineCap: 'round', dashArray: f.category === 'P' ? '8 5' : undefined }),
  ]);
}

/** Length of a line as drawn (km on the IAU sphere), for display beside the database value. */
export function drawnLengthKm(f: StructureFeature): number {
  let m = 0;
  for (const part of f.lines) {
    for (let k = 0; k + 1 < part.length; k++) {
      m += greatCircleDistanceM(makeCoordinate(part[k][1], part[k][0]), makeCoordinate(part[k + 1][1], part[k + 1][0]));
    }
  }
  return m / 1000;
}
