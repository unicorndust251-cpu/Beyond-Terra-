import * as L from 'leaflet';
import { IMAGERY_PANE, MAP_LIMITS, TREK_TILE_ROOT } from '../map/marsTrek';
import { HIGH_DENSITY, SCREEN_TILE, screenTileOptions, sharpTileZoom, sharpenTileZoom } from '../map/sharpTiles';
import { type DemStore } from './molaDem';
import { ELEVATION_SCALE, SLOPE_SCALE, lutIndex } from './colorScales';

export type DemMode = 'elevation' | 'slope';

/** Map panes, above the imagery pane (200) and below Leaflet's overlay pane (400). */
export const SCIENCE_PANES = {
  elevation: { name: 'btScienceElevation', zIndex: 250 },
  geology: { name: 'btScienceGeology', zIndex: 255 },
  slope: { name: 'btScienceSlope', zIndex: 260 },
  relief: { name: 'btScienceRelief', zIndex: 270 },
} as const;

export function ensurePanes(map: L.Map): void {
  for (const { name, zIndex } of Object.values(SCIENCE_PANES)) {
    const pane = map.getPane(name) ?? map.createPane(name);
    pane.style.zIndex = String(zIndex);
  }
  // Hard light with neutral grey: flat ground leaves the colours below unchanged, shadows
  // darken them and sunlit slopes lighten them (see ReliefLayer)
  map.getPane(SCIENCE_PANES.relief.name)!.style.mixBlendMode = 'hard-light';
}

/** Canvas pixels per CSS pixel for drawn tiles (1, or 2 on high-density screens). */
const CANVAS_RATIO = HIGH_DENSITY ? 2 : 1;

/** Metres per CSS pixel (north–south) at a map zoom: the equator's 2πR over 512·2^z pixels. */
export function metresPerPixel(zoom: number, radiusM = 3_396_190): number {
  return (2 * Math.PI * radiusM) / (512 * Math.pow(2, zoom));
}

/* --------------------------------------------------------------- elevation / slope */

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
 * so the slope baseline stays visible) into canvas tiles, from the numeric data. Canvases
 * match the screen's pixel density, so colour edges are not blurred by upscaling.
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
    sharpenTileZoom(this);
    closeSeams(this, 256);
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256 * CANVAS_RATIO;
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
    const size = canvas.width;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const px = img.data;
    const m = store.manifest;
    const ppd = m.pixelsPerDegree;
    const n = m.tilePixels;
    const w = n + 2;
    const maxI = 180 * ppd - 1;
    const maxJ = 360 * ppd - 1;
    const scale = this.mode === 'elevation' ? ELEVATION_SCALE : SLOPE_SCALE;
    const lut = scale.lut;

    for (let py = 0; py < size; py++) {
      const lat = north - ((py + 0.5) / size) * (north - south);
      const gy = (90 - lat) * ppd; // continuous grid row (0 at the north edge)
      for (let qx = 0; qx < size; qx++) {
        const lon = west + ((qx + 0.5) / size) * (east - west);
        const gx = ((((lon + 180) % 360) + 360) % 360) * ppd;
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
        const o = (py * size + qx) * 4;
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

/**
 * The shade value of flat ground in that product: the median (and mode) over 214,117
 * pixels where the MEGDR slope is below 0.3° (Amazonis, Utopia, Isidis, Arcadia and
 * Acidalia; 10th–90th percentile 175–187). It equals 255 · sin 45°, a sun 45° high.
 */
export const RELIEF_FLAT_VALUE = 181;

/** Intensity 1 = the product's own shading; the slider exaggerates or softens it. */
export const RELIEF_INTENSITY = { min: 0.25, max: 3, default: 1 };

/**
 * Leaflet places tiles at fractional pixel offsets at fractional zoom, which can leave
 * hairline gaps between them; under a blend mode a gap shows as a light seam. Drawing each
 * tile half a pixel larger closes them (a 0.2 % stretch, far below one data sample).
 */
function closeSeams(layer: L.GridLayer, cssSize: number): void {
  layer.on('tileloadstart', (e: L.TileEvent) => {
    e.tile.style.width = e.tile.style.height = `${cssSize + 0.5}px`;
  });
}

interface ReliefTile {
  canvas: HTMLCanvasElement;
  shade: Uint8Array;
}

/**
 * Relief from Trek's hillshade tiles, remapped so it can be blended over the elevation
 * colours (and imagery) with hard light:
 *
 *   t = 0.5 + 0.5 · intensity · (shade − flat) / flat,   clamped to 0…1
 *
 * Flat ground (shade = flat) becomes t = 0.5, which hard light leaves unchanged, so
 * the elevation colours keep their legend values there. At intensity 1, a shadowed slope
 * multiplies the colour below by shade/flat, its true brightness relative to flat
 * ground; higher intensities exaggerate this for visibility. It only redraws Trek's own
 * shading: no detail is added, and it is not a measure of steepness (that is the Slope layer).
 */
export class ReliefLayer extends L.GridLayer {
  private intensity = RELIEF_INTENSITY.default;
  private live = new Map<string, ReliefTile>();
  /** Image requests still in flight, by tile canvas */
  private pending = new Map<HTMLElement, HTMLImageElement>();

  constructor() {
    super({
      ...screenTileOptions(RELIEF_MAX_NATIVE_ZOOM),
      maxZoom: MAP_LIMITS.maxZoom,
      noWrap: false,
      keepBuffer: 2,
      // Not at every step of a flight: those tiles would be thrown away
      updateWhenZooming: false,
      pane: SCIENCE_PANES.relief.name,
      className: 'bt-sci-tile bt-sci-tile--relief',
    });
    sharpenTileZoom(this);
    closeSeams(this, SCREEN_TILE.size);
    this.on('tileunload', (e: L.TileEvent) => {
      this.live.delete(this.keyOf(e.coords));
      this.cancel(e.tile);
    });
  }

  /** Stops a tile's download, so abandoned tiles do not queue ahead of wanted ones. */
  private cancel(tile: HTMLElement): void {
    const img = this.pending.get(tile);
    if (!img) return;
    img.onload = img.onerror = null;
    img.src = L.Util.emptyImageUrl;
    this.pending.delete(tile);
  }

  /**
   * Called by GridLayer when the tile level changes. As in Leaflet's TileLayer: tiles of
   * other levels still downloading are cancelled and dropped. Without this, the tiles of a
   * long flight keep all of the browser's connections to Trek busy.
   */
  protected _abortLoading(): void {
    for (const key of Object.keys(this._tiles)) {
      const t = this._tiles[key];
      if (t.coords.z === this._tileZoom || !this.pending.has(t.el)) continue;
      this.cancel(t.el);
      L.DomUtil.remove(t.el);
      delete this._tiles[key];
      this.fire('tileabort', { tile: t.el, coords: t.coords });
    }
  }

  setIntensity(intensity: number): void {
    this.intensity = intensity;
    this.live.forEach((t) => this.paint(t));
  }

  private keyOf(c: L.Coords): string {
    return `${c.x}:${c.y}:${c.z}`;
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256; // one canvas pixel per source pixel
    const z = coords.z + SCREEN_TILE.levelOffset;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    this.pending.set(canvas, img);
    img.onload = () => {
      this.pending.delete(canvas);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, 256, 256);
      const rgba = ctx.getImageData(0, 0, 256, 256).data;
      const shade = new Uint8Array(256 * 256);
      for (let k = 0; k < shade.length; k++) shade[k] = rgba[k * 4];
      const tile = { canvas, shade };
      this.live.set(this.keyOf(coords), tile);
      this.paint(tile);
      done(undefined, canvas);
    };
    img.onerror = () => {
      this.pending.delete(canvas);
      done(new Error(`relief tile ${z}/${coords.y}/${coords.x}`), canvas);
    };
    img.src = `${TREK_TILE_ROOT}/${RELIEF_PRODUCT}/1.0.0/default/default028mm/${z}/${coords.y}/${coords.x}.jpg`;
    return canvas;
  }

  private paint({ canvas, shade }: ReliefTile): void {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const out = ctx.createImageData(256, 256);
    const d = out.data;
    const gain = (0.5 * this.intensity) / RELIEF_FLAT_VALUE;
    for (let k = 0; k < shade.length; k++) {
      const t = 0.5 + gain * (shade[k] - RELIEF_FLAT_VALUE);
      const v = t <= 0 ? 0 : t >= 1 ? 255 : Math.round(t * 255);
      const o = k * 4;
      d[o] = d[o + 1] = d[o + 2] = v;
      d[o + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }
}

/**
 * Warms the browser cache with the relief tiles of one view, as the map does for its
 * imagery (prefetchView). Used for the opening view while the globe is still on screen,
 * so the shading is there when the descent lands instead of queueing behind the imagery
 * tiles of the flight. Same CORS mode as the layer's own requests, so the cache matches.
 */
export function prefetchRelief(map: L.Map, center: L.LatLngExpression, zoom: number, maxTiles = 48): HTMLImageElement[] {
  const level = Math.min(sharpTileZoom(zoom) + SCREEN_TILE.levelOffset, RELIEF_MAX_NATIVE_ZOOM);
  // Only the tiles the view itself needs: every extra one delays the rest
  const size = map.getSize().divideBy(2 * Math.pow(2, zoom - level));
  const c = map.project(center, level);
  const min = c.subtract(size).divideBy(256).floor();
  const max = c.add(size).divideBy(256).floor();
  const cols = 2 * Math.pow(2, level);
  const images: HTMLImageElement[] = [];
  for (let y = Math.max(0, min.y); y <= Math.min(cols / 2 - 1, max.y); y++) {
    for (let x = min.x; x <= max.x && images.length < maxTiles; x++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `${TREK_TILE_ROOT}/${RELIEF_PRODUCT}/1.0.0/default/default028mm/${level}/${y}/${((x % cols) + cols) % cols}.jpg`;
      images.push(img);
    }
  }
  return images;
}

/* -------------------------------------------------------------------- geology */

/**
 * The USGS Geologic Map of Mars (Tanaka et al., 2014, SIM 3292) in its published unit
 * colours, as rendered by NASA Mars Trek (catalogue item SIM3292_Global_Geology). Served
 * through Trek's ArcGIS WMTS: same tile matrix set as the Viking mosaic (default028mm,
 * 256-px tiles from −180°, 90°, 2 × 1 at level 0), levels 0–11, CORS open. Checked
 * against its GetCapabilities document.
 */
export const GEOLOGY_TILES = {
  url: 'https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/WMTS/tile/1.0.0/SIM3292_Global_Geology/default/default028mm/{z}/{y}/{x}.png',
  maxNativeZoom: 11,
  credit: 'Geology: USGS SIM 3292 (Tanaka et al., 2014) via NASA Mars Trek',
};

export function createGeologyLayer(): L.TileLayer {
  const layer = L.tileLayer(GEOLOGY_TILES.url, {
    ...screenTileOptions(GEOLOGY_TILES.maxNativeZoom),
    maxZoom: MAP_LIMITS.maxZoom,
    noWrap: false,
    keepBuffer: 2,
    pane: SCIENCE_PANES.geology.name,
    className: 'bt-sci-tile bt-sci-tile--geology',
    crossOrigin: 'anonymous',
  });
  return sharpenTileZoom(layer);
}

/* ------------------------------------------------------------ global CTX imagery */

/**
 * The global MRO Context Camera mosaic (Caltech Murray Lab, beta01, uncontrolled, 5 m/px),
 * listed by Mars Trek as CTX_beta01_uncontrolled_5m_Caltech and served by Esri's
 * OnMars/CTX MapServer: 512-px tiles on the Mars 2000 sphere, origin (−180°, 90°), level 0 =
 * 2 × 1 tiles. Its level L is therefore the map's 256-px level L + 1. Level 12 (5.1 m/px)
 * is the deepest with data (checked at Jezero, Olympus Mons and Valles Marineris).
 *
 * Optical, greyscale, near-global; missing tiles are gaps in the mosaic and show the
 * Viking colour mosaic below. Uncontrolled: individual CTX frames can be offset from
 * their true positions; its registration has not been measured here.
 */
export const CTX_GLOBAL = {
  key: 'ctx-global',
  url: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{y}/{x}',
  /** Deepest map level (256-px grid) with data */
  maxNativeZoom: 13,
  /** Fades in over Viking, whose deepest Trek level (7) is 326 m/px */
  fadeIn: [6.5, 7.5] as [number, number],
  credit: 'CTX global mosaic: NASA/JPL/MSSS/Caltech Murray Lab/Esri',
  metresPerPixel: 5.1,
};

export function createCtxGlobalLayer(): L.TileLayer {
  const layer = L.tileLayer(CTX_GLOBAL.url, {
    // 512-px source tiles: 512 CSS px from level z−1, or 256 CSS px on dense screens
    tileSize: 512 / (1 + SCREEN_TILE.levelOffset),
    zoomOffset: -1 + SCREEN_TILE.levelOffset,
    maxNativeZoom: CTX_GLOBAL.maxNativeZoom - SCREEN_TILE.levelOffset,
    minNativeZoom: 1 - SCREEN_TILE.levelOffset,
    minZoom: Math.floor(CTX_GLOBAL.fadeIn[0]),
    maxZoom: MAP_LIMITS.maxZoom,
    noWrap: false,
    keepBuffer: 2,
    pane: IMAGERY_PANE,
    // Same z-index as Viking, added after it: above Viking, below the Jezero mosaics (2, 3)
    zIndex: 1,
    opacity: 0,
    crossOrigin: 'anonymous',
    className: 'bt-trek-layer bt-trek-layer--ctx-global',
  });
  return sharpenTileZoom(layer);
}

export function ctxGlobalOpacityAt(zoom: number): number {
  const [a, b] = CTX_GLOBAL.fadeIn;
  const t = Math.min(1, Math.max(0, (zoom - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
