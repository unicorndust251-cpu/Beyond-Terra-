#!/usr/bin/env node
/**
 * Converts a PDS MOLA MEGDR topography product (MEGT*.IMG + .LBL) into the tiles the
 * browser reads (public/data/mola/<id>/). PDS does not send CORS headers, so the data
 * cannot be fetched from the browser directly.
 *
 *   node scripts/prepare-mola.mjs <label.lbl> <image.img> <outputId> <tileDegrees>
 *
 *   e.g. node scripts/prepare-mola.mjs megt90n000cb.lbl megt90n000cb.img meg004 360
 *        node scripts/prepare-mola.mjs megt90n000eb.lbl megt90n000eb.img meg016 30
 *
 * Source: https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/
 *
 * What changes and what does not:
 *   - Values are untouched: signed 16-bit metres above the MOLA areoid, exactly as in PDS.
 *   - Longitude is re-ordered from the product's 0…360° E to −180…180° E (the Mars Trek
 *     convention). Both are planetocentric and east-positive, so this is a pure column
 *     rotation, computed from the label's projection keywords (not assumed).
 *   - The grid is cut into tiles, each with a 1-sample halo copied from its neighbours
 *     (wrapping across ±180°; repeating the edge row at the poles), so slope can use
 *     central differences at tile edges.
 *   - Storage: little-endian int16, each row delta-encoded (first sample absolute, then
 *     differences), then gzip. Lossless; decoding restores the PDS values exactly.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { endianness } from 'node:os';
import { fileURLToPath } from 'node:url';

const [lblPath, imgPath, outId, tileDegArg] = process.argv.slice(2);
if (!lblPath || !imgPath || !outId || !tileDegArg) {
  console.error('usage: prepare-mola.mjs <label.lbl> <image.img> <outputId> <tileDegrees>');
  process.exit(1);
}

/* ------------------------------------------------------------- the label */
const label = readFileSync(lblPath, 'latin1');
const kw = (name) => {
  const m = label.match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\r\\n]*?)"?\\s*(<[^>]*>)?\\s*$`, 'm'));
  if (!m) throw new Error(`label keyword missing: ${name}`);
  return m[1].trim();
};
const num = (name) => Number(kw(name));

const lines = num('LINES');
const samples = num('LINE_SAMPLES');
const ppd = num('MAP_RESOLUTION');
const lineOffset = num('LINE_PROJECTION_OFFSET');
const sampleOffset = num('SAMPLE_PROJECTION_OFFSET');
const centerLon = num('CENTER_LONGITUDE');
const radiusKm = num('A_AXIS_RADIUS');
const expect = (cond, what) => {
  if (!cond) throw new Error(`unexpected product: ${what}`);
};
expect(kw('DATA_SET_ID') === 'MGS-M-MOLA-5-MEGDR-L3-V1.0', 'DATA_SET_ID');
expect(kw('NAME') === 'MEDIAN_TOPOGRAPHY', 'not a topography (MEGT) product');
expect(kw('SAMPLE_TYPE') === 'MSB_INTEGER' && num('SAMPLE_BITS') === 16, 'sample type');
expect(kw('UNIT') === 'METER', 'unit');
expect(kw('MAP_PROJECTION_TYPE') === 'SIMPLE CYLINDRICAL', 'projection');
expect(kw('POSITIVE_LONGITUDE_DIRECTION') === 'EAST', 'longitude direction');
expect(kw('COORDINATE_SYSTEM_NAME') === 'PLANETOCENTRIC', 'latitude system');
expect(samples === 360 * ppd && lines === 180 * ppd, 'global coverage');

/*
 * PDS simple cylindrical (1-based line/sample, integer = pixel centre):
 *   line   = LINE_PROJECTION_OFFSET   − lat · MAP_RESOLUTION
 *   sample = SAMPLE_PROJECTION_OFFSET + (lon − CENTER_LONGITUDE) · MAP_RESOLUTION
 */
const latOfLine = (line) => (lineOffset - line) / ppd;
const lonOfSample = (sample) => centerLon + (sample - sampleOffset) / ppd;
const north = latOfLine(1) + 0.5 / ppd;
const west = lonOfSample(1) - 0.5 / ppd;
expect(Math.abs(north - 90) < 1e-9, `north edge ${north}`);
expect(Math.abs(west - 0) < 1e-9, `west edge ${west}`);

/* ----------------------------------------------------------- the samples */
expect(endianness() === 'LE', 'this script writes host-order int16 and needs a little-endian host');
const raw = readFileSync(imgPath);
expect(raw.length === lines * samples * 2, `file size ${raw.length}`);

// Output column j (0-based) is centred on lon = −180 + (j + 0.5)/ppd.
// Its source sample (1-based) comes from the label's formula, wrapped into 0…360°.
const sourceColumn = new Int32Array(samples);
for (let j = 0; j < samples; j++) {
  let lon = -180 + (j + 0.5) / ppd;
  if (lon < 0) lon += 360;
  const sample = Math.round(sampleOffset + (lon - centerLon) * ppd); // 1-based
  sourceColumn[j] = sample - 1;
}
const grid = new Int16Array(lines * samples); // rows north→south, columns west→east from −180°
let min = Infinity;
let max = -Infinity;
for (let i = 0; i < lines; i++) {
  for (let j = 0; j < samples; j++) {
    const v = raw.readInt16BE((i * samples + sourceColumn[j]) * 2);
    grid[i * samples + j] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
}

/* ----------------------------------------------------------------- tiles */
const tileDeg = Number(tileDegArg);
expect(360 % tileDeg === 0 && 180 % tileDeg === 0, 'tile size must divide 180');
const tilePx = tileDeg * ppd;
const cols = 360 / tileDeg;
const rows = 180 / tileDeg;
const halo = 1;
const w = tilePx + 2 * halo;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'mola', outId);
mkdirSync(root, { recursive: true });

let bytes = 0;
const at = (i, j) => {
  const ii = Math.min(lines - 1, Math.max(0, i)); // poles: repeat the edge row
  const jj = ((j % samples) + samples) % samples; // ±180°: wrap
  return grid[ii * samples + jj];
};
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const out = new Int16Array(w * w);
    for (let y = 0; y < w; y++) {
      let prev = 0;
      for (let x = 0; x < w; x++) {
        const v = at(r * tilePx + y - halo, c * tilePx + x - halo);
        out[y * w + x] = x === 0 ? v : v - prev; // fits int16: |Δ| ≤ 29348
        prev = v;
      }
    }
    const buf = Buffer.from(out.buffer); // Int16Array is host order; checked little-endian above
    const gz = gzipSync(buf, { level: 9 });
    bytes += gz.length;
    writeFileSync(join(root, `${r}_${c}.i16.gz`), gz);
  }
}

const manifest = {
  product: kw('PRODUCT_ID'),
  dataSetId: kw('DATA_SET_ID'),
  productVersion: kw('PRODUCT_VERSION_ID'),
  pixelsPerDegree: ppd,
  mapScaleKm: num('MAP_SCALE'),
  radiusM: radiusKm * 1000,
  unit: 'm',
  verticalDatum: 'MOLA areoid (GMM3 / mgm1025, degree and order 50); topography = planetary radius − areoid radius',
  latitude: 'planetocentric',
  longitude: 'east-positive, −180…180 (re-ordered from the product’s 0…360)',
  tileDegrees: tileDeg,
  tilePixels: tilePx,
  halo,
  rows,
  cols,
  encoding: 'int16 little-endian, row delta, gzip',
  min,
  max,
  source: `https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg${String(ppd).padStart(3, '0')}/`,
};
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${outId}: ${rows * cols} tiles, ${(bytes / 1e6).toFixed(2)} MB, elevation ${min}…${max} m`);
