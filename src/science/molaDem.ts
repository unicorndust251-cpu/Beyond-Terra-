/**
 * MOLA MEGDR topography in the browser: loading, decoding, sampling and slope.
 *
 * The files under public/data/mola/ are made by scripts/prepare-mola.mjs from the PDS
 * products, with values unchanged. The grid convention inside this module:
 *
 *   - latitude: planetocentric. Grid row i (0-based, north → south) is centred on
 *       lat = 90 − (i + 0.5) / ppd
 *   - longitude: planetocentric, east-positive, −180…180 (the Mars Trek and map
 *     convention). Grid column j (0-based, west → east) is centred on
 *       lon = −180 + (j + 0.5) / ppd
 *     The PDS products run 0…360° E; the preparation script rotates the columns,
 *     using the label's SAMPLE_PROJECTION_OFFSET and CENTER_LONGITUDE.
 *   - Leaflet longitudes can leave −180…180 when the map wraps; they are normalised
 *     with normalizeLon() before any lookup.
 *
 * Because the MEGDR and Mars Trek use the same planetocentric, east-positive
 * latitude and longitude, both draw in the same equirectangular CRS (MarsCRS) with no
 * offset. No alignment is adjusted by eye.
 */

export interface DemManifest {
  product: string;
  dataSetId: string;
  productVersion: string;
  pixelsPerDegree: number;
  mapScaleKm: number;
  /** Sphere radius of the product's map projection (label A_AXIS_RADIUS), metres */
  radiusM: number;
  unit: 'm';
  verticalDatum: string;
  tileDegrees: number;
  tilePixels: number;
  halo: number;
  rows: number;
  cols: number;
  min: number;
  max: number;
  source: string;
}

/** One decoded tile: elevations with a 1-sample halo, and slope without one. */
export interface DemTile {
  row: number;
  col: number;
  /** (n + 2)² elevations in metres, row-major, including the halo */
  z: Int16Array;
  /** n² slopes in degrees, row-major; NaN where the stencil leaves the grid (pole rows) */
  slope: Float32Array;
}

export interface DemLevel {
  id: string;
  manifest: DemManifest;
}

export const DEM_ROOT = `${import.meta.env.BASE_URL}data/mola`;

/** The two MEGDR resolutions bundled with the site, coarse first. */
export const DEM_LEVEL_IDS = ['meg004', 'meg016'] as const;

export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function demSupported(): boolean {
  return typeof DecompressionStream !== 'undefined';
}

export async function loadManifest(id: string, signal?: AbortSignal): Promise<DemLevel> {
  const res = await fetch(`${DEM_ROOT}/${id}/manifest.json`, { signal });
  if (!res.ok) throw new Error(`${id} manifest: HTTP ${res.status}`);
  const manifest = (await res.json()) as DemManifest;
  if (manifest.halo !== 1 || manifest.unit !== 'm') throw new Error(`${id}: unexpected manifest`);
  return { id, manifest };
}

/* ----------------------------------------------------------------- decoding */

/** Downloads a gzipped data file and returns its bytes, decompressed. */
export async function fetchGzipped(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return gunzipIfNeeded(await res.arrayBuffer());
}

async function gunzipIfNeeded(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buf, 0, 2);
  // Some hosts serve .gz with Content-Encoding: gzip and the browser has already inflated it
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

function decodeRows(buf: ArrayBuffer, width: number): Int16Array {
  // Stored little-endian; DataView keeps this independent of the host's byte order
  const view = new DataView(buf);
  const out = new Int16Array(buf.byteLength / 2);
  for (let y = 0; y < out.length / width; y++) {
    let acc = 0;
    for (let x = 0; x < width; x++) {
      const k = y * width + x;
      const d = view.getInt16(k * 2, true);
      acc = x === 0 ? d : (acc + d) << 16 >> 16; // int16 wrap, as encoded
      out[k] = acc;
    }
  }
  return out;
}

/**
 * Slope in degrees on the native grid, using true horizontal distances on the sphere:
 *   dx = R · cos(lat) · Δλ,  dy = R · Δφ  (Δλ = Δφ = 1/ppd degrees, in radians)
 *   slope = atan(√((dz/dx)² + (dz/dy)²)) · 180/π, with central differences.
 * Pole rows, where the north/south neighbour is the repeated halo row, are left NaN.
 */
export function computeSlope(z: Int16Array, row: number, m: DemManifest): Float32Array {
  const n = m.tilePixels;
  const w = n + 2;
  const step = ((1 / m.pixelsPerDegree) * Math.PI) / 180;
  const dy = m.radiusM * step;
  const totalRows = 180 * m.pixelsPerDegree;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const gi = row * n + y;
    if (gi === 0 || gi === totalRows - 1) {
      out.fill(NaN, y * n, (y + 1) * n);
      continue;
    }
    const lat = 90 - (gi + 0.5) / m.pixelsPerDegree;
    const dx = m.radiusM * Math.cos((lat * Math.PI) / 180) * step;
    const c = (y + 1) * w + 1; // halo offset
    for (let x = 0; x < n; x++) {
      const k = c + x;
      const dzdx = (z[k + 1] - z[k - 1]) / (2 * dx);
      const dzdy = (z[k - w] - z[k + w]) / (2 * dy);
      out[y * n + x] = (Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180) / Math.PI;
    }
  }
  return out;
}

/* -------------------------------------------------------------------- store */

/** Loads tiles on demand and keeps them. Failed loads are forgotten so they can be retried. */
export class DemStore {
  private tiles = new Map<string, Promise<DemTile>>();
  private ready = new Map<string, DemTile>();

  constructor(readonly level: DemLevel) {}

  get manifest(): DemManifest {
    return this.level.manifest;
  }

  getTile(row: number, col: number): Promise<DemTile> {
    const key = `${row}_${col}`;
    let p = this.tiles.get(key);
    if (!p) {
      p = this.fetchTile(row, col);
      this.tiles.set(key, p);
      p.then(
        (t) => this.ready.set(key, t),
        () => this.tiles.delete(key)
      );
    }
    return p;
  }

  /** A tile that is already decoded, or null. Never starts a download. */
  peekTile(row: number, col: number): DemTile | null {
    return this.ready.get(`${row}_${col}`) ?? null;
  }

  private async fetchTile(row: number, col: number): Promise<DemTile> {
    const m = this.manifest;
    const res = await fetch(`${DEM_ROOT}/${this.level.id}/${row}_${col}.i16.gz`);
    if (!res.ok) throw new Error(`${this.level.id} ${row}_${col}: HTTP ${res.status}`);
    const buf = await gunzipIfNeeded(await res.arrayBuffer());
    const w = m.tilePixels + 2;
    if (buf.byteLength !== w * w * 2) throw new Error(`${this.level.id} ${row}_${col}: bad size`);
    const z = decodeRows(buf, w);
    return { row, col, z, slope: computeSlope(z, row, m) };
  }

  /** Grid cell (row-major global indices) containing a point. */
  cellAt(lat: number, lon: number): { i: number; j: number } {
    const ppd = this.manifest.pixelsPerDegree;
    const i = Math.min(180 * ppd - 1, Math.max(0, Math.floor((90 - lat) * ppd)));
    const j = Math.min(360 * ppd - 1, Math.max(0, Math.floor((normalizeLon(lon) + 180) * ppd)));
    return { i, j };
  }

  /** Data tiles covering a lat/lon box (lon in −180…180, west ≤ east). */
  tilesFor(south: number, north: number, west: number, east: number): Array<[number, number]> {
    const d = this.manifest.tileDegrees;
    const { rows, cols } = this.manifest;
    const r0 = Math.max(0, Math.floor((90 - north) / d));
    const r1 = Math.min(rows - 1, Math.floor((90 - south - 1e-9) / d));
    const c0 = Math.max(0, Math.floor((west + 180) / d));
    const c1 = Math.min(cols - 1, Math.floor((east + 180 - 1e-9) / d));
    const out: Array<[number, number]> = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push([r, c]);
    return out;
  }
}

export interface PointSample {
  /** MEGDR bin value (median MOLA topography), metres above the areoid */
  elevation: number;
  /** Slope of that bin, degrees; NaN if not computed */
  slope: number;
  /** Centre of the bin */
  lat: number;
  lon: number;
}

/** The native bin containing a point, from a tile that is already loaded. */
export function sampleBin(store: DemStore, lat: number, lon: number): PointSample | null {
  const m = store.manifest;
  const n = m.tilePixels;
  const { i, j } = store.cellAt(lat, lon);
  const tile = store.peekTile(Math.floor(i / n), Math.floor(j / n));
  if (!tile) return null;
  const y = i - tile.row * n;
  const x = j - tile.col * n;
  return {
    elevation: tile.z[(y + 1) * (n + 2) + x + 1],
    slope: tile.slope[y * n + x],
    lat: 90 - (i + 0.5) / m.pixelsPerDegree,
    lon: -180 + (j + 0.5) / m.pixelsPerDegree,
  };
}
