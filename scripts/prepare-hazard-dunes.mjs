#!/usr/bin/env node
/**
 * Extracts mapped dune-field outlines from the USGS Mars Global Digital Dune Database
 * (MGD³; Hayward et al., 2007, USGS Open-File Report 2007-1158), for the Hazards map
 * (category S, Sand & Dunes).
 *
 *   node scripts/prepare-hazard-dunes.mjs <Shapefiles/Geocentric/Dune_Field.shp>
 *
 * Source: https://pubs.usgs.gov/of/2007/1158/ (Shapefiles.zip → Shapefiles/Geocentric/Dune_Field.*)
 *
 * Coverage 65° N–65° S. Fields were outlined on 100 m/px THEMIS IR images (verified with
 * THEMIS VIS / MOC NA), at about 1:75,000; the smallest are ~1 km². The database states that
 * it excludes all small dune fields and some moderate-to-large ones, so the absence of a
 * mapped field does not mean that no dunes exist there.
 *
 * The Geocentric shapefile is geographic degrees (GCS_Mars_2000, planetocentric latitude,
 * −180…180° longitude), the map's own frame, so coordinates are copied unchanged. Display
 * copies are simplified (Douglas–Peucker, 0.003°, ≈ 180 m), well below the mapping scale.
 * Attribute values are copied exactly; codes are decoded from the database metadata.
 *
 * Output: public/data/hazards/dunes.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [shpPath] = process.argv.slice(2);
if (!shpPath) {
  console.error('usage: prepare-hazard-dunes.mjs <Dune_Field.shp>');
  process.exit(1);
}

const prj = readFileSync(shpPath.replace(/\.shp$/i, '.prj'), 'latin1');
if (!/GCS_Mars_2000/.test(prj) || !/UNIT\["Degree"/.test(prj)) throw new Error('expected geographic degrees on Mars 2000');

/* -------------------------------------------------------------- attributes */
const dbf = readFileSync(shpPath.replace(/\.shp$/i, '.dbf'));
const nRec = dbf.readUInt32LE(4);
const hlen = dbf.readUInt16LE(8);
const rlen = dbf.readUInt16LE(10);
const fields = [];
for (let o = 32; dbf[o] !== 0x0d; o += 32) fields.push({ name: dbf.toString('latin1', o, o + 11).replace(/\0.*/, ''), len: dbf[o + 16] });
function record(i) {
  let o = hlen + i * rlen + 1;
  const r = {};
  for (const f of fields) {
    r[f.name] = dbf.toString('latin1', o, o + f.len).trim();
    o += f.len;
  }
  return r;
}

/* -------------------------------------------------------------- geometry */
const shp = readFileSync(shpPath);
if (shp.readInt32LE(32) !== 5) throw new Error('expected a polygon shapefile');
const shapes = [];
for (let o = 100; o < shp.length; ) {
  const len = shp.readInt32BE(o + 4) * 2;
  const c = o + 8;
  const type = shp.readInt32LE(c);
  if (type === 5) {
    const np = shp.readInt32LE(c + 36);
    const n = shp.readInt32LE(c + 40);
    const starts = [];
    for (let k = 0; k < np; k++) starts.push(shp.readInt32LE(c + 44 + 4 * k));
    const base = c + 44 + 4 * np;
    const pts = [];
    for (let k = 0; k < n; k++) pts.push([shp.readDoubleLE(base + 16 * k), shp.readDoubleLE(base + 16 * k + 8)]);
    shapes.push(starts.map((s, k) => pts.slice(s, starts[k + 1] ?? n)));
  } else shapes.push(null);
  o = c + len;
}
if (shapes.length !== nRec) throw new Error(`geometry/attribute count mismatch: ${shapes.length} vs ${nRec}`);

function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let best = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > best) {
        best = d;
        idx = i;
      }
    }
    if (best > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : pts;
}

const TYPES = { B_1: 'Barchan', Bd_1: 'Barchanoid', D_1: 'Dome', L_1: 'Linear', S_1: 'Star', SS_1: 'Sand sheet', T_1: 'Transverse', U_1: 'Unclassified' };
const ENV = { C: 'In a crater', N: 'Outside craters', H: 'Hellas basin', A: 'Argyre basin', VM: 'Valles Marineris' };
const CONF = {
  1: 'Confident the feature is a dune field',
  2: 'Fairly confident; better image needed to verify',
  3: 'Less confident; better image needed to verify',
};
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const num = (s) => (s === '' || Number.isNaN(Number(s)) ? null : Number(s));

const ids = new Set();
const features = [];
let before = 0;
let after = 0;
for (let i = 0; i < nRec; i++) {
  const rec = record(i);
  const rings = shapes[i];
  if (!rings) throw new Error(`record ${i} has no polygon`);
  if (ids.has(rec.Dune_ID)) throw new Error(`duplicate Dune_ID ${rec.Dune_ID}`);
  ids.add(rec.Dune_ID);
  const simplified = rings.map((r) => simplify(r, 0.003));
  before += rings.reduce((s, r) => s + r.length, 0);
  after += simplified.reduce((s, r) => s + r.length, 0);
  features.push({
    id: `MGD3-${rec.Dune_ID}`,
    duneId: rec.Dune_ID,
    // Dune_Lon is 0–360° E in the database; the map frame is −180…180°
    centre: [r4(((Number(rec.Dune_Lon) + 180) % 360) - 180), r4(Number(rec.Dune_Lat))],
    types: Object.entries(TYPES)
      .filter(([k]) => rec[k] === '1')
      .map(([, v]) => v),
    typeCode: rec.Dune_Type,
    confidence: num(rec.Confidence),
    confidenceText: CONF[rec.Confidence] ?? null,
    environment: rec.Environ.split(',').map((e) => ENV[e.trim()] ?? e.trim()),
    areaKm2: num(rec.Area_sinu_),
    craterDiameterKm: num(rec.Cr_Diam_1) || null,
    images: { themisIR: rec.IR || null, themisVIS: rec.VIS || null, moc: rec.MOC || null },
    rings: simplified.map((r) => r.map(([x, y]) => [r4(x), r4(y)])),
  });
}

const out = {
  source: 'USGS Mars Global Digital Dune Database (MGD³), Hayward et al. 2007, USGS Open-File Report 2007-1158',
  url: 'https://pubs.usgs.gov/of/2007/1158/',
  frame: 'Planetocentric latitude, east longitude −180…180°, Mars 2000 (as in the Geocentric shapefile)',
  coverage: '65° N to 65° S',
  method:
    'Dune fields outlined on 100 m/px THEMIS IR images, verified with THEMIS VIS and MOC NA where available, at about 1:75,000. Smallest fields ~1 km².',
  completeness:
    'The database excludes all small dune fields and some moderate-to-large ones (incomplete THEMIS daytime coverage and 100 m/px resolution). The absence of a mapped field does not mean that no dunes exist.',
  simplification: 'Douglas–Peucker 0.003° (≈ 180 m) for display',
  count: features.length,
  features,
};
const dir = fileURLToPath(new URL('../public/data/hazards/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(dir + 'dunes.json', JSON.stringify(out));
console.log(`${features.length} dune fields; vertices ${before} → ${after}`);
