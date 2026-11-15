import * as L from 'leaflet';
import { DemStore, loadManifest, normalizeLon } from '../science/molaDem';
import { makeCoordinate, type MarsCoordinate } from '../shared';
import { CATEGORY_BY_CODE } from './categories';
import { patternTile } from './patterns';
import { HAZARD_PANES } from './structures';

/**
 * SL: derived steep-slope cells. Each MOLA MEGDR 16 px/deg bin (3.7 km at the equator) is
 * classified by its own slope (central differences over neighbouring bins, computed in
 * science/molaDem.ts) against a user-set threshold. Classified bins are shaded with the
 * SL pattern and outlined where they border unclassified bins, so the drawn boundary is
 * exactly the cell edges of the classification; nothing is smoothed or interpolated.
 *
 * Only one resolution is used, so the classification does not change with zoom. It is
 * drawn from zoom 4, where cells are at least a pixel or two across.
 */

export const SLOPE_LEVEL = 'meg016';
export const SLOPE_MIN_ZOOM = 4;
export const SLOPE_CELL_KM = 3.705;

let storePromise: Promise<DemStore> | null = null;
export function loadSlopeStore(): Promise<DemStore> {
  if (!storePromise) {
    storePromise = loadManifest(SLOPE_LEVEL).then((level) => new DemStore(level));
    storePromise.catch(() => (storePromise = null));
  }
  return storePromise;
}

/** Slope (degrees) of the global bin (i, j), or undefined if its tile is not loaded, NaN if not computed. */
export function slopeAt(store: DemStore, i: number, j: number): number | undefined {
  const m = store.manifest;
  const n = m.tilePixels;
  const maxI = 180 * m.pixelsPerDegree;
  const maxJ = 360 * m.pixelsPerDegree;
  if (i < 0 || i >= maxI) return NaN;
  const jj = ((j % maxJ) + maxJ) % maxJ;
  const tile = store.peekTile(Math.floor(i / n), Math.floor(jj / n));
  if (!tile) return undefined;
  return tile.slope[(i - tile.row * n) * n + (jj - tile.col * n)];
}

export interface SlopeCell {
  i: number;
  j: number;
  slopeDeg: number;
  centre: MarsCoordinate;
  bounds: { south: number; north: number; west: number; east: number };
}

export type SlopeSample =
  | { state: 'classified'; cell: SlopeCell }
  | { state: 'below'; cell: SlopeCell }
  | { state: 'unavailable'; reason: string };

/** Classifies the bin containing a point; loads its tile if needed. */
export async function sampleSlope(store: DemStore, at: MarsCoordinate, thresholdDeg: number): Promise<SlopeSample> {
  const m = store.manifest;
  const ppd = m.pixelsPerDegree;
  const { i, j } = store.cellAt(at.latitude, at.longitudeEast);
  try {
    await store.getTile(Math.floor(i / m.tilePixels), Math.floor(j / m.tilePixels));
  } catch {
    return { state: 'unavailable', reason: 'The MOLA elevation tile for this point could not be loaded.' };
  }
  const s = slopeAt(store, i, j);
  if (s === undefined || Number.isNaN(s)) return { state: 'unavailable', reason: 'No slope is computed for this MOLA bin (polar edge rows).' };
  const north = 90 - i / ppd;
  const west = -180 + j / ppd;
  const cell: SlopeCell = {
    i,
    j,
    slopeDeg: s,
    centre: makeCoordinate(north - 0.5 / ppd, west + 0.5 / ppd),
    bounds: { north, south: north - 1 / ppd, west, east: west + 1 / ppd },
  };
  return { state: s >= thresholdDeg ? 'classified' : 'below', cell };
}

export class SlopeCellLayer extends L.GridLayer {
  private threshold = 8;
  private fillOpacity = 0.2;

  constructor(private readonly store: DemStore) {
    super({ tileSize: 256, pane: HAZARD_PANES.area.name, minZoom: 0, maxZoom: 18, updateWhenZooming: false, keepBuffer: 1, className: 'hz-tile' });
  }

  setParams(thresholdDeg: number, fillOpacity: number) {
    if (thresholdDeg === this.threshold && fillOpacity === this.fillOpacity) return;
    this.threshold = thresholdDeg;
    this.fillOpacity = fillOpacity;
    this.redraw();
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const ratio = window.devicePixelRatio > 1.5 ? 2 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256 * ratio;
    if (coords.z < SLOPE_MIN_ZOOM) {
      queueMicrotask(() => done(undefined, canvas));
      return canvas;
    }
    const nw = this._map.unproject(coords.scaleBy(L.point(256, 256)), coords.z);
    const se = this._map.unproject(coords.add(L.point(1, 1)).scaleBy(L.point(256, 256)), coords.z);
    const west = normalizeLon(nw.lng);
    const east = west + (se.lng - nw.lng);
    const needed = this.store.tilesFor(Math.max(-90, se.lat), Math.min(90, nw.lat), Math.max(-180, west), Math.min(180, east));
    Promise.all(needed.map(([r, c]) => this.store.getTile(r, c)))
      .then(() => {
        this.draw(canvas, ratio, nw.lat, se.lat, west, east);
        done(undefined, canvas);
      })
      .catch((err: Error) => done(err, canvas));
    return canvas;
  }

  private draw(canvas: HTMLCanvasElement, ratio: number, north: number, south: number, west: number, east: number) {
    const ctx = canvas.getContext('2d')!;
    const size = canvas.width;
    const ppd = this.store.manifest.pixelsPerDegree;
    const sx = size / (east - west);
    const sy = size / (north - south);
    const i0 = Math.max(0, Math.floor((90 - north) * ppd));
    const i1 = Math.min(180 * ppd - 1, Math.floor((90 - south) * ppd));
    const j0 = Math.floor((west + 180) * ppd);
    const j1 = Math.floor((east + 180) * ppd);
    const cat = CATEGORY_BY_CODE.SL;
    const is = (i: number, j: number) => {
      const s = slopeAt(this.store, i, j);
      return s !== undefined && !Number.isNaN(s) && s >= this.threshold;
    };
    const cellPx = sx / ppd;
    const x = (j: number) => (j / ppd - 180 - west) * sx;
    const y = (i: number) => (90 - i / ppd - north) * -sy;

    // Fill
    const fill = new Path2D();
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        if (is(i, j)) fill.rect(x(j), y(i), cellPx + 0.01, sy / ppd + 0.01);
      }
    }
    // At 0% shading (or "Outlines only") no fill or pattern is drawn; the outline below stays
    ctx.globalAlpha = this.fillOpacity;
    ctx.fillStyle = cat.colour;
    if (this.fillOpacity > 0) ctx.fill(fill);
    if (this.fillOpacity > 0 && cellPx * ratio >= 6) {
      ctx.globalAlpha = Math.min(1, this.fillOpacity * 2 + 0.25);
      ctx.fillStyle = ctx.createPattern(patternTile('SL', ratio), 'repeat')!;
      ctx.fill(fill);
    }

    // Outline along edges between classified and unclassified cells
    if (cellPx * ratio >= 2) {
      const edges = new Path2D();
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          if (!is(i, j)) continue;
          const x0 = x(j);
          const y0 = y(i);
          const x1 = x(j + 1);
          const y1 = y(i + 1);
          if (!is(i - 1, j)) (edges.moveTo(x0, y0), edges.lineTo(x1, y0));
          if (!is(i + 1, j)) (edges.moveTo(x0, y1), edges.lineTo(x1, y1));
          if (!is(i, j - 1)) (edges.moveTo(x0, y0), edges.lineTo(x0, y1));
          if (!is(i, j + 1)) (edges.moveTo(x1, y0), edges.lineTo(x1, y1));
        }
      }
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = cat.colour;
      ctx.lineWidth = 1.75 * ratio;
      ctx.stroke(edges);
    }
    ctx.globalAlpha = 1;
  }
}

/** U: grey crosshatch over all terrain, when switched on. */
export class CoverageLayer extends L.GridLayer {
  constructor() {
    super({ tileSize: 256, pane: HAZARD_PANES.area.name, className: 'hz-tile hz-tile--coverage' });
  }

  protected createTile(): HTMLElement {
    const ratio = window.devicePixelRatio > 1.5 ? 2 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256 * ratio;
    const ctx = canvas.getContext('2d')!;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ctx.createPattern(patternTile('U', ratio), 'repeat')!;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }
}
