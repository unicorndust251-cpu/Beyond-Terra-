#!/usr/bin/env node
/**
 * Rasterizes the USGS Geologic Map of Mars (Tanaka et al., 2014, SIM 3292) geologic units
 * into lookup tiles the browser reads (public/data/geology/).
 *
 *   node scripts/prepare-geology.mjs <SIM3292_Global_Geology.shp>
 *
 * Source: https://pubs.usgs.gov/sim/3292/ (downloads/sim3292_database.zip →
 *         SIM3292_MarsGlobalGeologicGIS_20M/SIM3292_Shapefiles/SIM3292_Global_Geology.*)
 *
 * The shapefile is geographic (GCS_Mars_2000_Sphere, degrees, −180…180°), the same frame
 * as the map. Each cell of a 32 px/deg grid (1.85 km at the equator) takes the unit of the
 * polygon containing its centre (even-odd rule over all rings, so holes stay holes). The
 * map was compiled at 1:20,000,000, whose contacts are uncertain by kilometres, so the
 * grid adds no meaningful error. Cell value 0 = not mapped (no unit polygon).
 *
 * Output: 30° tiles of uint8 unit indices, gzip; units.json lists code and description.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [shpPath] = process.argv.slice(2);
if (!shpPath) {
  console.error('usage: prepare-geology.mjs <SIM3292_Global_Geology.shp>');
  process.exit(1);
}
const expect = (cond, what) => {
  if (!cond) throw new Error(`unexpected input: ${what}`);
};

const prj = readFileSync(shpPath.replace(/\.shp$/i, '.prj'), 'latin1');
expect(/GCS_Mars_2000_Sphere/.test(prj) && /UNIT\["Degree"/.test(prj), 'geographic degrees on the Mars 2000 sphere');

/* -------------------------------------------------------------- attributes */
const dbf = readFileSync(shpPath.replace(/\.shp$/i, '.dbf'));
const nRec = dbf.readUInt32LE(4);
const hlen = dbf.readUInt16LE(8);
const rlen = dbf.readUInt16LE(10);
const fields = [];
for (let o = 32; dbf[o] !== 0x0d; o += 32) fields.push({ name: dbf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: dbf[o + 16] });
const records = [];
for (let i = 0; i < nRec; i++) {
  let o = hlen + i * rlen + 1;
  const r = {};
  for (const f of fields) {
    r[f.name] = dbf.toString('latin1', o, o + f.len).trim();
    o += f.len;
  }
  records.push(r);
}
expect(fields.some((f) => f.name === 'Unit') && fields.some((f) => f.name === 'UnitDesc'), 'Unit and UnitDesc fields');

const units = [{ code: '', description: 'Not mapped' }];
const unitIndex = new Map();
for (const r of records) {
  if (!unitIndex.has(r.Unit)) {
    unitIndex.set(r.Unit, units.length);
    units.push({ code: r.Unit, description: r.UnitDesc });
  }
}
expect(units.length < 256, 'fewer than 255 units');

/* ---------------------------------------------------------------- geometry */
const PPD = 32;
const W = 360 * PPD;
const H = 180 * PPD;
const grid = new Uint8Array(W * H);
const shp = readFileSync(shpPath);
expect(shp.readInt32LE(32) === 5, 'polygon shapefile');

let o = 100;
let rec = 0;
let overwritten = 0;
while (o < shp.length) {
  const contentBytes = shp.readInt32BE(o + 4) * 2;
  const c = o + 8;
  o = c + contentBytes;
  if (shp.readInt32LE(c) !== 5) {
    rec++;
    continue;
  }
  const value = unitIndex.get(records[rec].Unit);
  rec++;
  const numParts = shp.readInt32LE(c + 36);
  const numPoints = shp.readInt32LE(c + 40);
  const parts = Array.from({ length: numParts }, (_, k) => shp.readInt32LE(c + 44 + k * 4));
  const pts = c + 44 + numParts * 4;
  const px = (k) => shp.readDoubleLE(pts + k * 16);
  const py = (k) => shp.readDoubleLE(pts + k * 16 + 8);

  // Edge-list scanline: each edge adds its crossing to the rows whose centre it spans
  const crossings = new Map();
  for (let p = 0; p < numParts; p++) {
    const start = parts[p];
    const end = p + 1 < numParts ? parts[p + 1] : numPoints;
    for (let k = start; k < end - 1; k++) {
      const x1 = px(k), y1 = py(k), x2 = px(k + 1), y2 = py(k + 1);
      if (y1 === y2) continue;
      // rows i whose centre latitude 90 − (i + 0.5)/PPD lies in [min(y), max(y))
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      const iFirst = Math.ceil((90 - hi) * PPD - 0.5 + 1e-12);
      const iLast = Math.floor((90 - lo) * PPD - 0.5);
      for (let i = Math.max(0, iFirst); i <= Math.min(H - 1, iLast); i++) {
        const yc = 90 - (i + 0.5) / PPD;
        if (yc < lo || yc >= hi) continue;
        const x = x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1);
        let list = crossings.get(i);
        if (!list) crossings.set(i, (list = []));
        list.push(x);
      }
    }
  }
  for (const [i, xs] of crossings) {
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // columns whose centre −180 + (j + 0.5)/PPD lies in [xa, xb)
      const jFirst = Math.max(0, Math.ceil((xs[k] + 180) * PPD - 0.5));
      const jLast = Math.min(W - 1, Math.ceil((xs[k + 1] + 180) * PPD - 0.5) - 1);
      for (let j = jFirst; j <= jLast; j++) {
        const idx = i * W + j;
        if (grid[idx] !== 0 && grid[idx] !== value) overwritten++;
        grid[idx] = value;
      }
    }
  }
}
expect(rec === nRec, `record count ${rec} vs ${nRec}`);

let unmapped = 0;
for (const v of grid) if (v === 0) unmapped++;

/* ------------------------------------------------------------------- tiles */
const TILE_DEG = 30;
const T = TILE_DEG * PPD;
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'geology');
mkdirSync(root, { recursive: true });
let bytes = 0;
for (let r = 0; r < 180 / TILE_DEG; r++) {
  for (let cc = 0; cc < 360 / TILE_DEG; cc++) {
    const tile = new Uint8Array(T * T);
    for (let y = 0; y < T; y++) tile.set(grid.subarray((r * T + y) * W + cc * T, (r * T + y) * W + cc * T + T), y * T);
    const gz = gzipSync(tile, { level: 9 });
    bytes += gz.length;
    writeFileSync(join(root, `${r}_${cc}.u8.gz`), gz);
  }
}
const manifest = {
  product: 'SIM3292_Global_Geology',
  title: 'Geologic Map of Mars (Tanaka, K.L., et al., 2014), USGS Scientific Investigations Map 3292',
  source: 'https://pubs.usgs.gov/sim/3292/',
  mapScale: '1:20,000,000',
  pixelsPerDegree: PPD,
  tileDegrees: TILE_DEG,
  tilePixels: T,
  rows: 180 / TILE_DEG,
  cols: 360 / TILE_DEG,
  latitude: 'planetocentric (Mars 2000 sphere)',
  longitude: 'east-positive, −180…180',
  encoding: 'uint8 unit index (0 = not mapped), gzip',
  units,
};
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `geology: ${units.length - 1} units from ${nRec} polygons; ${(bytes / 1e6).toFixed(2)} MB; ` +
    `not mapped ${((100 * unmapped) / grid.length).toFixed(3)} %; cells claimed by two units ${overwritten}`
);
