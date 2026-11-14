#!/usr/bin/env node
/**
 * Converts the USGS Mars 2020 Jezero CTX DTM (20 m/px) into one tile the browser reads
 * (public/data/jezero-ctx-dtm/). The source sits on a server without CORS headers.
 *
 *   node scripts/prepare-jezero-dtm.mjs <dtm.tif>
 *
 * Source: https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/
 *         JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif
 * (Mars 2020 Terrain Relative Navigation CTX DTM, Fergason et al., USGS Astrogeology).
 *
 * Reads only what this product is: an uncompressed, single-band float32 GeoTIFF in
 * equirectangular projection on the Mars 2000 sphere (R = 3,396,190 m, standard parallel 0°,
 * centre longitude 0°), with pixel-is-area georeferencing. Anything else is refused.
 *
 * Elevations are metres relative to the MOLA areoid (the "MOLAtopography_DeltaGeoid" in the
 * name), the same datum as the MOLA MEGDR. They are stored as uint16 2 cm steps above the
 * minimum (rows delta-encoded, gzip); the DTM's own vertical precision is metres.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const [tifPath] = process.argv.slice(2);
if (!tifPath) {
  console.error('usage: prepare-jezero-dtm.mjs <dtm.tif>');
  process.exit(1);
}
const b = readFileSync(tifPath);
const expect = (cond, what) => {
  if (!cond) throw new Error(`unexpected GeoTIFF: ${what}`);
};
expect(b.toString('latin1', 0, 2) === 'II' && b.readUInt16LE(2) === 42, 'little-endian classic TIFF');

/* ------------------------------------------------------------------ tags */
const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8 };
const ifd = b.readUInt32LE(4);
const tags = {};
for (let i = 0, n = b.readUInt16LE(ifd); i < n; i++) {
  const e = ifd + 2 + i * 12;
  const tag = b.readUInt16LE(e);
  const type = b.readUInt16LE(e + 2);
  const count = b.readUInt32LE(e + 4);
  const off = SIZE[type] * count <= 4 ? e + 8 : b.readUInt32LE(e + 8);
  const read = (j) =>
    type === 3 ? b.readUInt16LE(off + j * 2) : type === 4 ? b.readUInt32LE(off + j * 4) : type === 12 ? b.readDoubleLE(off + j * 8) : b[off + j];
  tags[tag] = type === 2 ? b.toString('latin1', off, off + count - 1) : Array.from({ length: count }, (_, j) => read(j));
}
const W = tags[256][0];
const H = tags[257][0];
expect(tags[258][0] === 32 && tags[339]?.[0] === 3, 'float32 samples');
expect(tags[259][0] === 1, 'uncompressed');
expect((tags[277]?.[0] ?? 1) === 1, 'single band');
expect(!tags[322], 'stripped, not tiled');
const strips = tags[273];
const rowsPerStrip = tags[278][0];

// GeoKeys: key → value (inline) or [tag, count, offset]
const gk = tags[34735];
const keys = {};
for (let k = 4; k < gk.length; k += 4) keys[gk[k]] = gk[k + 1] === 0 ? gk[k + 3] : [gk[k + 1], gk[k + 2], gk[k + 3]];
const geoDouble = (key) => tags[34736][keys[key][2]];
expect(keys[1024] === 1, 'projected model');
expect(keys[1025] === 1, 'pixel-is-area');
expect(keys[3075] === 17, 'equirectangular projection');
expect(geoDouble(3088) === 0 && geoDouble(3089) === 0, 'centre longitude 0°, standard parallel 0°');
const radius = tags[34736][5];
expect(radius === 3396190 && tags[34736][6] === 3396190, 'Mars 2000 sphere');
const [scaleX, scaleY] = tags[33550];
const [, , , x0, y0] = tags[33922];
expect(scaleX === scaleY, 'square pixels');
const nodata = tags[42113] ? Number(tags[42113]) : null;

/* ---------------------------------------------------------------- pixels */
const value = (i, j) => b.readFloatLE(strips[Math.floor(i / rowsPerStrip)] + ((i % rowsPerStrip) * W + j) * 4);
let min = Infinity;
let max = -Infinity;
for (let i = 0; i < H; i++) {
  for (let j = 0; j < W; j++) {
    const v = value(i, j);
    expect(nodata === null || v > nodata / 2, `no-data cell at ${i},${j} (not handled)`);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
}
// Unsigned 2 cm steps above a base: z = base + q · step. Rounding error ≤ 1 cm, which moves
// a 40 m-baseline slope by at most about 0.015°.
const STEP = 0.02;
const base = Math.floor(min);
expect((max - base) / STEP < 65535, 'elevation range fits 16-bit 2 cm steps');
const out = new Uint16Array(W * H);
for (let i = 0; i < H; i++) {
  let prev = 0;
  for (let j = 0; j < W; j++) {
    const q = Math.round((value(i, j) - base) / STEP);
    out[i * W + j] = j === 0 ? q : (q - prev) & 0xffff; // differences wrap modulo 2^16
    prev = q;
  }
}

const deg = 180 / Math.PI;
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'jezero-ctx-dtm');
mkdirSync(root, { recursive: true });
const gz = gzipSync(Buffer.from(out.buffer), { level: 9 });
writeFileSync(join(root, 'dtm.u16.gz'), gz);

const manifest = {
  product: basename(tifPath).replace(/\.tif$/i, ''),
  source: 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif',
  producer: 'USGS Astrogeology Science Center, Mars 2020 Terrain Relative Navigation CTX DTM (Fergason et al.)',
  width: W,
  height: H,
  pixelSizeM: scaleX,
  /** Projection metres of the top-left corner of the top-left pixel */
  originX: x0,
  originY: y0,
  radiusM: radius,
  projection: 'equirectangular, Mars 2000 sphere, standard parallel 0°, centre longitude 0° (x = R·λ, y = R·φ)',
  latitude: 'planetocentric',
  bounds: {
    west: (x0 / radius) * deg,
    east: ((x0 + W * scaleX) / radius) * deg,
    north: (y0 / radius) * deg,
    south: ((y0 - H * scaleY) / radius) * deg,
  },
  unit: 'm',
  verticalDatum: 'MOLA areoid (product is tied to MOLA topography: "MOLAtopography_DeltaGeoid")',
  encoding: 'uint16 little-endian steps above base, row delta modulo 2^16, gzip',
  base,
  step: STEP,
  min: Math.round(min * 10) / 10,
  max: Math.round(max * 10) / 10,
};
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Jezero CTX DTM: ${W} × ${H} at ${scaleX} m, ${(gz.length / 1e6).toFixed(2)} MB, ${manifest.min}…${manifest.max} m`);
console.log('bounds', JSON.stringify(manifest.bounds));
