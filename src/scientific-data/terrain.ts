import type { MarsCoordinate, TerrainSample } from '../shared';
import { DemStore, demSupported, fetchGzipped, loadManifest, sampleBin, DEM_ROOT, normalizeLon } from '../science/molaDem';
import { GEOLOGIC_MAP, JEZERO_CTX_DTM, MOLA_MEGDR, MOLA_MEGDR_COUNTS } from './datasets';

/**
 * Terrain at a point, from numerical data only:
 *   - MOLA MEGDR (global, 3.7 km bins): elevation, slope, shot count, regional relief;
 *   - Jezero CTX DTM (20 m, western Jezero only): elevation, slope, local relief;
 *   - USGS Geologic Map of Mars (global, 1:20 M): mapped unit.
 * Every reading carries a status. A missing reading is never replaced by a value.
 *
 * Coordinates are MarsCoordinate (planetocentric, east-positive, −180…180°), the frame
 * of all three sources (each on the Mars 2000 sphere or the MOLA sphere).
 */

export type ReadingStatus = 'available' | 'unavailable' | 'not-mapped' | 'outside-coverage' | 'not-assessed';

export const STATUS_LABEL: Record<ReadingStatus, string> = {
  available: 'Data available',
  unavailable: 'Data unavailable',
  'not-mapped': 'Not mapped',
  'outside-coverage': 'Outside coverage',
  'not-assessed': 'Not assessed',
};

export interface Reading<T> {
  status: ReadingStatus;
  value?: T;
  /** Why it has this status, or how to read the value */
  note?: string;
}

export interface ElevationReading {
  metres: number;
  /** How the value was obtained, e.g. "median of 49 shots in a 3.7 km bin" */
  method: string;
}

export interface SlopeReading {
  degrees: number;
  /** Horizontal distance the gradient spans, north–south, metres */
  baselineM: number;
}

export interface ReliefReading {
  /** Highest minus lowest elevation in the window, metres */
  rangeM: number;
  /** Point elevation minus the window's mean, metres (negative: lower than its surroundings) */
  offsetFromMeanM: number;
  /** Side of the square window, metres */
  windowM: number;
}

export interface UnitReading {
  code: string;
  description: string;
}

export interface TerrainInspection {
  coordinate: MarsCoordinate;
  local: {
    elevation: Reading<ElevationReading>;
    slope: Reading<SlopeReading>;
    relief: Reading<ReliefReading>;
  };
  regional: {
    elevation: Reading<ElevationReading>;
    slope: Reading<SlopeReading>;
    relief: Reading<ReliefReading>;
    /** MOLA shots in the bin: measured or interpolated */
    shots: Reading<string>;
  };
  geology: Reading<UnitReading>;
  /** Rocks, boulders and obstacles below the data's resolution */
  smallObstacles: Reading<never>;
  /** The readings in the shared form, for other modules */
  samples: TerrainSample[];
}

/* ------------------------------------------------------------------ loaders */

let megdr: Promise<DemStore> | null = null;
function megdrStore(): Promise<DemStore> {
  if (!megdr) {
    megdr = loadManifest('meg016').then((level) => new DemStore(level));
    megdr.catch(() => (megdr = null));
  }
  return megdr;
}

/** Tiled uint8 lookups: MEGDR shot-count categories and geologic units. */
interface ByteGrid {
  ppd: number;
  tilePx: number;
  labels: string[];
  tile(row: number, col: number): Promise<Uint8Array>;
}

function byteGrid(root: string, manifestLabels: (m: Record<string, unknown>) => string[]): () => Promise<ByteGrid & { manifest: Record<string, unknown> }> {
  let p: Promise<ByteGrid & { manifest: Record<string, unknown> }> | null = null;
  return () => {
    if (!p) {
      const tiles = new Map<string, Promise<Uint8Array>>();
      p = fetch(`${root}/manifest.json`)
        .then((res) => {
          if (!res.ok) throw new Error(`${root}: HTTP ${res.status}`);
          return res.json() as Promise<Record<string, unknown>>;
        })
        .then((m) => ({
          manifest: m,
          ppd: m.pixelsPerDegree as number,
          tilePx: m.tilePixels as number,
          labels: manifestLabels(m),
          tile(row: number, col: number) {
            const key = `${row}_${col}`;
            let t = tiles.get(key);
            if (!t) {
              t = fetchGzipped(`${root}/${key}.u8.gz`).then((buf) => new Uint8Array(buf));
              tiles.set(key, t);
              t.catch(() => tiles.delete(key));
            }
            return t;
          },
        }));
      p.catch(() => (p = null));
    }
    return p;
  };
}

async function byteAt(grid: ByteGrid, c: MarsCoordinate): Promise<number> {
  const i = Math.min(180 * grid.ppd - 1, Math.floor((90 - c.latitude) * grid.ppd));
  const j = Math.min(360 * grid.ppd - 1, Math.floor((normalizeLon(c.longitudeEast) + 180) * grid.ppd));
  const t = await grid.tile(Math.floor(i / grid.tilePx), Math.floor(j / grid.tilePx));
  return t[(i % grid.tilePx) * grid.tilePx + (j % grid.tilePx)];
}

const countGrid = byteGrid(`${DEM_ROOT}/meg016-count`, (m) => m.categories as string[]);
const geologyGrid = byteGrid(`${import.meta.env.BASE_URL}data/geology`, (m) =>
  (m.units as UnitReading[]).map((u) => JSON.stringify(u))
);

/** The Jezero CTX DTM: one grid of elevations (m), decoded from 2 cm steps. */
export interface LocalDtm {
  width: number;
  height: number;
  pixelSizeM: number;
  originX: number;
  originY: number;
  radiusM: number;
  bounds: { west: number; east: number; north: number; south: number };
  /** Elevations, metres above the MOLA areoid, row-major */
  z: Float32Array;
}

let jezero: Promise<LocalDtm> | null = null;
export function jezeroDtm(): Promise<LocalDtm> {
  if (!jezero) {
    const root = `${import.meta.env.BASE_URL}data/jezero-ctx-dtm`;
    jezero = Promise.all([
      fetch(`${root}/manifest.json`).then((r) => {
        if (!r.ok) throw new Error(`Jezero DTM manifest: HTTP ${r.status}`);
        return r.json();
      }),
      fetchGzipped(`${root}/dtm.u16.gz`),
    ]).then(([m, buf]) => {
      const view = new DataView(buf);
      const z = new Float32Array(m.width * m.height);
      if (buf.byteLength !== z.length * 2) throw new Error('Jezero DTM: unexpected size');
      for (let y = 0; y < m.height; y++) {
        let q = 0;
        for (let x = 0; x < m.width; x++) {
          const k = y * m.width + x;
          const d = view.getUint16(k * 2, true);
          q = x === 0 ? d : (q + d) & 0xffff; // row deltas, modulo 2^16
          z[k] = m.base + q * m.step;
        }
      }
      return { ...m, z } as LocalDtm;
    });
    jezero.catch(() => (jezero = null));
  }
  return jezero;
}

/* ------------------------------------------------------------------ sampling */

const DEG = Math.PI / 180;

/** Fractional pixel position of a point in the local DTM (pixel centres at integer + 0.5). */
export function dtmPixel(d: LocalDtm, c: MarsCoordinate): { x: number; y: number } {
  // Equirectangular, standard parallel 0°, centre longitude 0°: x = R·λ, y = R·φ
  const px = (d.radiusM * normalizeLon(c.longitudeEast) * DEG - d.originX) / d.pixelSizeM;
  const py = (d.originY - d.radiusM * c.latitude * DEG) / d.pixelSizeM;
  return { x: px, y: py };
}

export function insideDtm(d: LocalDtm, c: MarsCoordinate): boolean {
  const lon = normalizeLon(c.longitudeEast);
  return c.latitude >= d.bounds.south && c.latitude <= d.bounds.north && lon >= d.bounds.west && lon <= d.bounds.east;
}

/** Elevation (m) by bilinear interpolation between the four nearest posts. */
export function dtmElevation(d: LocalDtm, c: MarsCoordinate): number {
  const { x, y } = dtmPixel(d, c);
  const gx = Math.min(d.width - 1, Math.max(0, x - 0.5));
  const gy = Math.min(d.height - 1, Math.max(0, y - 0.5));
  const x0 = Math.min(d.width - 2, Math.floor(gx));
  const y0 = Math.min(d.height - 2, Math.floor(gy));
  const fx = gx - x0;
  const fy = gy - y0;
  const v = (yy: number, xx: number) => d.z[yy * d.width + xx];
  const top = v(y0, x0) + (v(y0, x0 + 1) - v(y0, x0)) * fx;
  const bottom = v(y0 + 1, x0) + (v(y0 + 1, x0 + 1) - v(y0 + 1, x0)) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Slope (degrees) at the post containing the point: central differences with true ground
 * distances. In this projection one pixel is pixelSize metres north–south but only
 * pixelSize · cos(lat) metres east–west on the ground.
 *   slope = atan(√((dz/dx)² + (dz/dy)²)) · 180/π
 * Returns null on the outermost posts, which lack a neighbour.
 */
export function dtmSlope(d: LocalDtm, c: MarsCoordinate): number | null {
  const { x, y } = dtmPixel(d, c);
  const j = Math.floor(x);
  const i = Math.floor(y);
  if (i < 1 || j < 1 || i > d.height - 2 || j > d.width - 2) return null;
  const v = (yy: number, xx: number) => d.z[yy * d.width + xx];
  const lat = (d.originY - (i + 0.5) * d.pixelSizeM) / d.radiusM; // radians
  const dx = d.pixelSizeM * Math.cos(lat);
  const dy = d.pixelSizeM;
  const dzdx = (v(i, j + 1) - v(i, j - 1)) / (2 * dx);
  const dzdy = (v(i - 1, j) - v(i + 1, j)) / (2 * dy);
  return (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
}

/** Range and offset from the mean in a square window of ±half posts around the point. */
function dtmRelief(d: LocalDtm, c: MarsCoordinate, half: number): ReliefReading | null {
  const { x, y } = dtmPixel(d, c);
  const j = Math.floor(x);
  const i = Math.floor(y);
  if (i - half < 0 || j - half < 0 || i + half >= d.height || j + half >= d.width) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let yy = i - half; yy <= i + half; yy++) {
    for (let xx = j - half; xx <= j + half; xx++) {
      const v = d.z[yy * d.width + xx];
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
    }
  }
  const n = (2 * half + 1) ** 2;
  return { rangeM: max - min, offsetFromMeanM: d.z[i * d.width + j] - sum / n, windowM: (2 * half + 1) * d.pixelSizeM };
}

/** Range and offset in a window of ±half MEGDR bins (loads the tiles it needs). */
async function megdrRelief(store: DemStore, c: MarsCoordinate, half: number): Promise<ReliefReading | null> {
  const m = store.manifest;
  const { i, j } = store.cellAt(c.latitude, c.longitudeEast);
  if (i - half < 0 || i + half >= 180 * m.pixelsPerDegree) return null;
  const values: number[] = [];
  for (let di = -half; di <= half; di++) {
    for (let dj = -half; dj <= half; dj++) {
      const lat = 90 - (i + di + 0.5) / m.pixelsPerDegree;
      const lon = -180 + (j + dj + 0.5) / m.pixelsPerDegree;
      const { i: ti, j: tj } = store.cellAt(lat, lon);
      await store.getTile(Math.floor(ti / m.tilePixels), Math.floor(tj / m.tilePixels));
      values.push(sampleBin(store, lat, lon)!.elevation);
    }
  }
  const centre = sampleBin(store, c.latitude, c.longitudeEast)!.elevation;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    rangeM: Math.max(...values) - Math.min(...values),
    offsetFromMeanM: centre - mean,
    windowM: (2 * half + 1) * m.mapScaleKm * 1000,
  };
}

/* ------------------------------------------------------------------ inspection */

const SMALL_OBSTACLES_NOTE =
  'No rock-abundance or boulder dataset is loaded. Rocks, boulders and small obstacles are far below the 20 m CTX posts and 3.7 km MOLA bins; identifying them needs HiRISE images (25 cm/px) or HiRISE DTMs (about 1 m).';

export async function inspectTerrain(c: MarsCoordinate): Promise<TerrainInspection> {
  const out: TerrainInspection = {
    coordinate: c,
    local: {
      elevation: { status: 'outside-coverage' },
      slope: { status: 'outside-coverage' },
      relief: { status: 'outside-coverage' },
    },
    regional: {
      elevation: { status: 'unavailable' },
      slope: { status: 'unavailable' },
      relief: { status: 'unavailable' },
      shots: { status: 'unavailable' },
    },
    geology: { status: 'unavailable' },
    smallObstacles: { status: 'not-assessed', note: SMALL_OBSTACLES_NOTE },
    samples: [],
  };

  const regional = (async () => {
    if (!demSupported()) {
      out.regional.elevation.note = 'This browser cannot decompress the data (DecompressionStream).';
      return;
    }
    try {
      const store = await megdrStore();
      const m = store.manifest;
      const { i, j } = store.cellAt(c.latitude, c.longitudeEast);
      await store.getTile(Math.floor(i / m.tilePixels), Math.floor(j / m.tilePixels));
      const bin = sampleBin(store, c.latitude, c.longitudeEast);
      if (!bin) throw new Error('bin not loaded');
      let shotsLabel: string | null = null;
      try {
        const counts = await countGrid();
        shotsLabel = counts.labels[await byteAt(counts, c)];
        out.regional.shots = {
          status: 'available',
          value: shotsLabel,
          note: shotsLabel.startsWith('0') ? 'No MOLA shot fell in this bin: its elevation is interpolated from neighbouring bins.' : undefined,
        };
      } catch {
        out.regional.shots = { status: 'unavailable', note: 'Shot counts could not be loaded.' };
      }
      const interpolated = shotsLabel?.startsWith('0');
      out.regional.elevation = {
        status: 'available',
        value: {
          metres: bin.elevation,
          method: interpolated
            ? `interpolated value for a ${m.mapScaleKm.toFixed(1)} km bin with no MOLA shot`
            : `median of ${shotsLabel ?? 'the'} MOLA shots in a ${m.mapScaleKm.toFixed(1)} km bin`,
        },
      };
      out.regional.slope = Number.isNaN(bin.slope)
        ? { status: 'not-assessed', note: 'Pole row: no neighbouring bin on one side.' }
        : { status: 'available', value: { degrees: bin.slope, baselineM: 2 * m.mapScaleKm * 1000 } };
      const relief = await megdrRelief(store, c, 2);
      out.regional.relief = relief ? { status: 'available', value: relief } : { status: 'not-assessed', note: 'Too close to a pole for the window.' };
      out.samples.push({
        coordinate: c,
        elevation: { value: bin.elevation, unit: 'm' },
        slope: Number.isNaN(bin.slope) ? undefined : { value: bin.slope, unit: '°' },
        datasetId: MOLA_MEGDR.identifier,
        source: MOLA_MEGDR.source,
        uncertaintyNote: `${m.mapScaleKm.toFixed(1)} km bin; slope over ${(2 * m.mapScaleKm).toFixed(1)} km${interpolated ? '; interpolated (no shot in bin)' : ''}.`,
      });
    } catch (err) {
      out.regional.elevation = { status: 'unavailable', note: `MOLA data could not be loaded (${(err as Error).message}).` };
      out.regional.slope = { status: 'unavailable' };
      out.regional.relief = { status: 'unavailable' };
    }
  })();

  const local = (async () => {
    // Cheap bounds check first: only download the DTM for points inside it
    const b = JEZERO_CTX_DTM.coverage.kind === 'regional' ? JEZERO_CTX_DTM.coverage.bounds : null;
    const lon = normalizeLon(c.longitudeEast);
    if (!b || c.latitude < b.south || c.latitude > b.north || lon < b.west || lon > b.east) {
      const note = 'The 20 m DTM covers western Jezero only (18.21–18.72° N, 77.16–77.70° E).';
      out.local.elevation.note = out.local.slope.note = out.local.relief.note = note;
      return;
    }
    try {
      const d = await jezeroDtm();
      if (!insideDtm(d, c)) return;
      const z = dtmElevation(d, c);
      out.local.elevation = {
        status: 'available',
        value: { metres: z, method: `bilinear between the four nearest ${d.pixelSizeM} m posts` },
      };
      const s = dtmSlope(d, c);
      out.local.slope =
        s === null
          ? { status: 'not-assessed', note: 'Edge of the DTM: no neighbouring post on one side.' }
          : { status: 'available', value: { degrees: s, baselineM: 2 * d.pixelSizeM } };
      const r = dtmRelief(d, c, 25);
      out.local.relief = r ? { status: 'available', value: r } : { status: 'not-assessed', note: 'Too close to the DTM edge for the 1 km window.' };
      out.samples.unshift({
        coordinate: c,
        elevation: { value: z, unit: 'm' },
        slope: s === null ? undefined : { value: s, unit: '°' },
        datasetId: JEZERO_CTX_DTM.identifier,
        source: JEZERO_CTX_DTM.source,
        uncertaintyNote: `${d.pixelSizeM} m posts; slope over ${2 * d.pixelSizeM} m; features under about 60 m not resolved.`,
      });
    } catch (err) {
      const note = `The Jezero DTM could not be loaded (${(err as Error).message}).`;
      out.local.elevation = { status: 'unavailable', note };
      out.local.slope = { status: 'unavailable' };
      out.local.relief = { status: 'unavailable' };
    }
  })();

  const geology = (async () => {
    try {
      const g = await geologyGrid();
      const idx = await byteAt(g, c);
      if (idx === 0) {
        out.geology = { status: 'not-mapped', note: 'No geologic unit polygon covers this point.' };
        return;
      }
      out.geology = { status: 'available', value: JSON.parse(g.labels[idx]) as UnitReading, note: GEOLOGIC_MAP.limitations[0] };
    } catch (err) {
      out.geology = { status: 'unavailable', note: `The geologic map could not be loaded (${(err as Error).message}).` };
    }
  })();

  await Promise.all([regional, local, geology]);
  return out;
}

export const DATASET_LINKS = {
  megdr: 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/',
  jezeroDtm:
    'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif',
  geology: 'https://pubs.usgs.gov/sim/3292/',
};

export { MOLA_MEGDR, MOLA_MEGDR_COUNTS, JEZERO_CTX_DTM, GEOLOGIC_MAP };
