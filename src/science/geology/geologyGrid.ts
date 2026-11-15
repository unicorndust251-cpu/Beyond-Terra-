import * as L from 'leaflet';
import type { MarsCoordinate } from '../../shared';
import { MAP_LIMITS } from '../../map/marsTrek';
import { fetchGzipped, normalizeLon } from '../molaDem';
import { UNIT_BY_CODE } from './geologyUnits';

/**
 * Point identification on the USGS SIM 3292 geologic map, from the unit polygons themselves.
 *
 * public/data/geology holds the polygons rasterised by scripts/prepare-geology.mjs: the
 * shapefile's `Unit` field becomes an index per 32 px/deg cell (1.85 km at the equator;
 * 0 = no polygon), and manifest.units[index].code is that `Unit` value. The grid shares the
 * map's frame (planetocentric, east-positive −180…180° on the Mars 2000 sphere), so a
 * selected coordinate only needs its longitude wrapped into −180…180° before lookup.
 * Codes are matched to the legend exactly, case included.
 */

interface Grid {
  ppd: number;
  tilePx: number;
  /** Index → `Unit` code ('' for index 0) */
  codes: string[];
  tile(row: number, col: number): Promise<Uint8Array>;
  peek(row: number, col: number): Uint8Array | undefined;
}

const ROOT = `${import.meta.env.BASE_URL}data/geology`;

let grid: Promise<Grid> | null = null;
function loadGrid(): Promise<Grid> {
  if (!grid) {
    const tiles = new Map<string, Promise<Uint8Array>>();
    const ready = new Map<string, Uint8Array>();
    grid = fetch(`${ROOT}/manifest.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`geology manifest: HTTP ${res.status}`);
        return res.json() as Promise<{ pixelsPerDegree: number; tilePixels: number; units: { code: string }[] }>;
      })
      .then((m) => ({
        ppd: m.pixelsPerDegree,
        tilePx: m.tilePixels,
        codes: m.units.map((x) => x.code),
        tile(row, col) {
          const key = `${row}_${col}`;
          let t = tiles.get(key);
          if (!t) {
            t = fetchGzipped(`${ROOT}/${key}.u8.gz`).then((buf) => {
              const a = new Uint8Array(buf);
              ready.set(key, a);
              return a;
            });
            tiles.set(key, t);
            t.catch(() => tiles.delete(key));
          }
          return t;
        },
        peek: (row, col) => ready.get(`${row}_${col}`),
      }));
    grid.catch(() => (grid = null));
  }
  return grid;
}

/** Grid cell of a coordinate; null beyond the poles. */
function cell(g: Grid, lat: number, lonEast: number): { i: number; j: number } | null {
  const rows = 180 * g.ppd;
  const cols = 360 * g.ppd;
  const i = Math.floor((90 - lat) * g.ppd);
  if (i < 0 || i >= rows) return null;
  const j = (((Math.floor((normalizeLon(lonEast) + 180) * g.ppd)) % cols) + cols) % cols;
  return { i: Math.min(rows - 1, i), j };
}

async function indexAt(g: Grid, i: number, j: number): Promise<number> {
  const t = await g.tile(Math.floor(i / g.tilePx), Math.floor(j / g.tilePx));
  return t[(i % g.tilePx) * g.tilePx + (j % g.tilePx)];
}

export type Identification =
  | { status: 'unit'; code: string; known: boolean; adjacent: string[] }
  | { status: 'not-mapped'; adjacent: string[] }
  | { status: 'error'; message: string };

/**
 * The mapped unit at a point, and any different units in the eight neighbouring cells
 * (within about 2 km), which means the point lies on or near a mapped contact.
 */
export async function identifyUnit(c: MarsCoordinate): Promise<Identification> {
  try {
    const g = await loadGrid();
    const centre = cell(g, c.latitude, c.longitudeEast);
    if (!centre) return { status: 'not-mapped', adjacent: [] };
    const cols = 360 * g.ppd;
    const here = await indexAt(g, centre.i, centre.j);
    const around = new Set<number>();
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const i = centre.i + di;
        if ((di === 0 && dj === 0) || i < 0 || i >= 180 * g.ppd) continue;
        const v = await indexAt(g, i, (centre.j + dj + cols) % cols);
        if (v !== 0 && v !== here) around.add(v);
      }
    }
    const adjacent = [...around].map((v) => g.codes[v]);
    if (here === 0) return { status: 'not-mapped', adjacent };
    const code = g.codes[here];
    return { status: 'unit', code, known: UNIT_BY_CODE.has(code), adjacent };
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }
}

/** Codes present in the dataset that the legend does not list (expected: none). */
export async function unlistedCodes(): Promise<string[]> {
  const g = await loadGrid();
  return g.codes.filter((code) => code && !UNIT_BY_CODE.has(code));
}

/* ----------------------------------------------------------- highlight layer */

const HIGHLIGHT_PANE = 'btGeologyHighlight';

/**
 * Dims everything except one unit's mapped cells, drawn from the same grid. Sits just
 * above the geology tiles and below Leaflet's overlay pane, so routes, markers and
 * controls stay on top.
 */
export class GeologyHighlightLayer extends L.GridLayer {
  private index = -1;

  constructor(private readonly code: string) {
    super({ tileSize: 256, maxNativeZoom: 8, maxZoom: MAP_LIMITS.maxZoom, noWrap: false, keepBuffer: 2, pane: HIGHLIGHT_PANE, className: 'bt-geo-hl' });
  }

  onAdd(map: L.Map): this {
    const pane = map.getPane(HIGHLIGHT_PANE) ?? map.createPane(HIGHLIGHT_PANE);
    pane.style.zIndex = '258';
    pane.style.pointerEvents = 'none';
    return super.onAdd(map);
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    // Plate carrée: latitude and longitude are linear across a tile
    const nw = this._map.unproject(coords.scaleBy(L.point(256, 256)), coords.z);
    const se = this._map.unproject(coords.add(L.point(1, 1)).scaleBy(L.point(256, 256)), coords.z);
    loadGrid()
      .then(async (g) => {
        this.index = g.codes.indexOf(this.code);
        const need = new Set<string>();
        for (const lat of [nw.lat, se.lat, (nw.lat + se.lat) / 2]) {
          for (const lon of [nw.lng, se.lng, (nw.lng + se.lng) / 2]) {
            const c = cell(g, Math.max(-89.999, Math.min(89.999, lat)), lon);
            if (c) need.add(`${Math.floor(c.i / g.tilePx)}_${Math.floor(c.j / g.tilePx)}`);
          }
        }
        await Promise.all([...need].map((k) => g.tile(Number(k.split('_')[0]), Number(k.split('_')[1]))));
        this.draw(canvas, g, nw.lat, se.lat, nw.lng, se.lng);
        done(undefined, canvas);
      })
      .catch((err: Error) => done(err, canvas));
    return canvas;
  }

  private draw(canvas: HTMLCanvasElement, g: Grid, north: number, south: number, west: number, east: number) {
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(256, 256);
    const px = img.data;
    for (let py = 0; py < 256; py++) {
      const lat = north - ((py + 0.5) / 256) * (north - south);
      for (let qx = 0; qx < 256; qx++) {
        const lon = west + ((qx + 0.5) / 256) * (east - west);
        const c = cell(g, lat, lon);
        if (!c) continue;
        const t = g.peek(Math.floor(c.i / g.tilePx), Math.floor(c.j / g.tilePx));
        if (!t || t[(c.i % g.tilePx) * g.tilePx + (c.j % g.tilePx)] === this.index) continue;
        const k = (py * 256 + qx) * 4;
        px[k] = 23;
        px[k + 1] = 20;
        px[k + 2] = 19;
        px[k + 3] = 165;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
