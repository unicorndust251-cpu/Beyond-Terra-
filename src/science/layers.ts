import * as L from 'leaflet';
import { MAP_LIMITS, TREK_TILE_ROOT } from '../map/marsTrek';
import { type DemStore } from './molaDem';
import { ELEVATION_SCALE, SLOPE_SCALE, lutIndex } from './colorScales';

export type DemMode = 'elevation' | 'slope';

/** Map panes, above the imagery pane (200) and below Leaflet's overlay pane (400). */
export const SCIENCE_PANES = {
  elevation: { name: 'btScienceElevation', zIndex: 250 },
  slope: { name: 'btScienceSlope', zIndex: 260 },
  relief: { name: 'btScienceRelief', zIndex: 270 },
} as const;

export function ensurePanes(map: L.Map): void {
  for (const { name, zIndex } of Object.values(SCIENCE_PANES)) {
    const pane = map.getPane(name) ?? map.createPane(name);
    pane.style.zIndex = String(zIndex);
  }
  // Relief shading darkens what lies below it instead of covering it
  map.getPane(SCIENCE_PANES.relief.name)!.style.mixBlendMode = 'multiply';
}

/**
 * Which MEGDR resolution draws a map tile at zoom z. At zoom z a map pixel spans
 * 360 / (512 · 2^z) degrees. The 4 px/deg product is used while it is magnified less than
 * 2× (z ≤ 2); beyond that the 16 px/deg product takes over.
 */
export function levelIndexForZoom(z: number): 0 | 1 {
  return Math.round(z) <= 2 ? 0 : 1;
}

/** Deepest zoom drawn per pixel; Leaflet scales tiles beyond it (the data is far coarser anyway). */
const DEM_MAX_NATIVE_ZOOM = 7;

/**
 * Draws MEGDR elevation (bilinear between bin centres) or slope (each native bin as is,
 * so the slope baseline stays visible) into canvas tiles, from the numeric data.
 */
export class DemLayer extends L.GridLayer {
  constructor(
    private readonly stores: [DemStore, DemStore],
    readonly mode: DemMode,
    options: L.GridLayerOptions = {}
  ) {
    super({
      tileSize: 256,
      maxNativeZoom: DEM_MAX_NATIVE_ZOOM,
      maxZoom: MAP_LIMITS.maxZoom,
      noWrap: false,
      keepBuffer: 2,
      updateWhenZooming: false,
      pane: SCIENCE_PANES[mode].name,
      className: `bt-sci-tile bt-sci-tile--${mode}`,
      ...options,
    });
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const store = this.stores[levelIndexForZoom(coords.z)];
    // Exact: the CRS is plate carrée, so latitude and longitude are linear across a tile
    const nw = this._map.unproject(coords.scaleBy(L.point(256, 256)), coords.z);
    const se = this._map.unproject(coords.add(L.point(1, 1)).scaleBy(L.point(256, 256)), coords.z);
    const north = nw.lat;
    const south = se.lat;
    const west = nw.lng;
    const east = se.lng;
    const needed = store.tilesFor(south, north, west, east);

    Promise.all(needed.map(([r, c]) => store.getTile(r, c)))
      .then(() => {
        this.draw(canvas, store, north, south, west, east);
        done(undefined, canvas);
      })
      .catch((err: Error) => done(err, canvas));
    return canvas;
  }

  private draw(canvas: HTMLCanvasElement, store: DemStore, north: number, south: number, west: number, east: number) {
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(256, 256);
    const px = img.data;
    const m = store.manifest;
    const ppd = m.pixelsPerDegree;
    const n = m.tilePixels;
    const w = n + 2;
    const maxI = 180 * ppd - 1;
    const maxJ = 360 * ppd - 1;
    const scale = this.mode === 'elevation' ? ELEVATION_SCALE : SLOPE_SCALE;
    const lut = scale.lut;

    for (let py = 0; py < 256; py++) {
      const lat = north - ((py + 0.5) / 256) * (north - south);
      const gy = (90 - lat) * ppd; // continuous grid row (0 at the north edge)
      for (let qx = 0; qx < 256; qx++) {
        const lon = west + ((qx + 0.5) / 256) * (east - west);
        const gx = (((lon + 180) % 360) + 360) % 360 * ppd;
        const i = Math.min(maxI, Math.floor(gy));
        const j = Math.min(maxJ, Math.floor(gx));
        const tile = store.peekTile(Math.floor(i / n), Math.floor(j / n));
        if (!tile) continue;
        const ly = i - tile.row * n;
        const lx = j - tile.col * n;
        let value: number;
        if (this.mode === 'slope') {
          value = tile.slope[ly * n + lx];
          if (Number.isNaN(value)) continue;
        } else {
          // Bilinear between bin centres; the halo supplies neighbours across tile edges
          const fy = gy - i - 0.5;
          const fx = gx - j - 0.5;
          const y0 = ly + 1 + (fy < 0 ? -1 : 0);
          const x0 = lx + 1 + (fx < 0 ? -1 : 0);
          const ty = fy < 0 ? fy + 1 : fy;
          const tx = fx < 0 ? fx + 1 : fx;
          const k = y0 * w + x0;
          const top = tile.z[k] + (tile.z[k + 1] - tile.z[k]) * tx;
          const bottom = tile.z[k + w] + (tile.z[k + w + 1] - tile.z[k + w]) * tx;
          value = top + (bottom - top) * ty;
        }
        const c = lutIndex(scale, value) * 3;
        const o = (py * 256 + qx) * 4;
        px[o] = lut[c];
        px[o + 1] = lut[c + 1];
        px[o + 2] = lut[c + 2];
        px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}

/* -------------------------------------------------------------- relief shading */

/**
 * Mars Trek hillshade of the MOLA–HRSC blended global DEM (200 m/px). Same tile matrix
 * set as the Viking mosaic (default028mm, 2 × 1 tiles at level 0, −180…180°), checked
 * against both GetCapabilities documents.
 */
export const RELIEF_PRODUCT = 'Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw';
export const RELIEF_MAX_NATIVE_ZOOM = 8;

export function createReliefLayer(): L.TileLayer {
  return L.tileLayer(`${TREK_TILE_ROOT}/${RELIEF_PRODUCT}/1.0.0/default/default028mm/{z}/{y}/{x}.jpg`, {
    tileSize: 256,
    maxNativeZoom: RELIEF_MAX_NATIVE_ZOOM,
    maxZoom: MAP_LIMITS.maxZoom,
    noWrap: false,
    keepBuffer: 2,
    pane: SCIENCE_PANES.relief.name,
    className: 'bt-sci-tile bt-sci-tile--relief',
    crossOrigin: 'anonymous',
  });
}
