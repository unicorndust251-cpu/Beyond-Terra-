#!/usr/bin/env node
/**
 * Extracts mapped tectonic troughs from the USGS Geologic Map of Mars (Tanaka et al., 2014,
 * SIM 3292) structure lines, for the Hazards map.
 *
 *   node scripts/prepare-hazard-structures.mjs <SIM3292_Global_Structure.shp>
 *
 * Source: https://pubs.usgs.gov/sim/3292/ (downloads/sim3292_database.zip →
 *         SIM3292_MarsGlobalGeologicGIS_20M/SIM3292_Shapefiles/SIM3292_Global_Structure.*)
 *
 * Kept (attribute values exactly as in the database):
 *   Origin = Tectonic, Morphology = Trough, Interpreta = Graben axis      → category F
 *   Origin = Tectonic, Morphology = Trough, Interpreta = Pit crater chain → category P
 * Everything else (wrinkle ridges, channels, crater rims, scarps, flows…) is left out: they
 * are not fractures, fault troughs or pits.
 *
 * Each line is the mapped AXIS of a trough at 1:20,000,000. It is not a fault trace, and
 * the trough's width is not mapped: no area is drawn around it. The shapefile is
 * geographic (GCS_Mars_2000_Sphere, degrees, −180…180°), the map's own frame, so
 * coordinates are copied unchanged. Display copies are simplified (Douglas–Peucker,
 * 0.005°, ≈ 300 m, far below the map's kilometre-scale contact uncertainty); the stored
 * length is the database's own SphLen_km, from the unsimplified line.
 *
 * Output: public/data/hazards/structures.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [shpPath] = process.argv.slice(2);
if (!shpPath) {
  console.error('usage: prepare-hazard-structures.mjs <SIM3292_Global_Structure.shp>');
  process.exit(1);
}

const prj = readFileSync(shpPath.replace(/\.shp$/i, '.prj'), 'latin1');
if (!/GCS_Mars_2000_Sphere/.test(prj) || !/UNIT\["Degree"/.test(prj)) throw new Error('expected geographic degrees on the Mars 2000 sphere');

/* -------------------------------------------------------------- attributes */
const dbf = readFileSync(shpPath.replace(/\.shp$/i, '.dbf'));
const nRec = dbf.readUInt32LE(4);
const hlen = dbf.readUInt16LE(8);
const rlen = dbf.readUInt16LE(10);
const fields = [];
for (let o = 32; dbf[o] !== 0x0d; o += 32) {
  fields.push({ name: dbf.toString('latin1', o, o + 11).replace(/\0.*/, ''), len: dbf[o + 16] });
}
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
if (shp.readInt32LE(32) !== 3) throw new Error('expected a polyline shapefile');
const parts = [];
for (let off = 100, i = 0; off < shp.length; i++) {
  const len = shp.readInt32BE(off + 4) * 2;
  const c = off + 8;
  const type = shp.readInt32LE(c);
  const lines = [];
  if (type === 3) {
    const nParts = shp.readInt32LE(c + 36);
    const nPts = shp.readInt32LE(c + 40);
    const starts = [];
    for (let p = 0; p < nParts; p++) starts.push(shp.readInt32LE(c + 44 + p * 4));
    const pts = c + 44 + nParts * 4;
    for (let p = 0; p < nParts; p++) {
      const a = starts[p];
      const b = p + 1 < nParts ? starts[p + 1] : nPts;
      const line = [];
      for (let k = a; k < b; k++) line.push([shp.readDoubleLE(pts + k * 16), shp.readDoubleLE(pts + k * 16 + 8)]);
      lines.push(line);
    }
  }
  parts.push(lines);
  off += 8 + len;
}
if (parts.length !== nRec) throw new Error(`shape/attribute count mismatch: ${parts.length} vs ${nRec}`);

function simplify(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = points[a];
    const [x2, y2] = points[b];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const d2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = tol * tol;
    for (let k = a + 1; k < b; k++) {
      const [x, y] = points[k];
      let t = d2 ? ((x - x1) * dx + (y - y1) * dy) / d2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = x1 + t * dx - x;
      const ey = y1 + t * dy - y;
      const e = ex * ex + ey * ey;
      if (e > bestD) {
        bestD = e;
        best = k;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return points.filter((_, k) => keep[k]);
}

const round = (v) => Math.round(v * 1e4) / 1e4;
const CATEGORY = { 'Graben axis': 'F', 'Pit crater chain': 'P' };
const features = [];
for (let i = 0; i < nRec; i++) {
  const r = record(i);
  if (r.Origin !== 'Tectonic' || r.Morphology !== 'Trough' || !CATEGORY[r.Interpreta]) continue;
  const lines = parts[i].map((l) => simplify(l, 0.005).map(([x, y]) => [round(x), round(y)])).filter((l) => l.length >= 2);
  if (!lines.length) continue;
  features.push({
    id: `SIM3292-S${r.OBJECTID}`,
    category: CATEGORY[r.Interpreta],
    interpretation: r.Interpreta,
    preservation: r.Preservati || null,
    dimension: r.Dimension || null,
    lengthKm: r.SphLen_km ? Math.round(Number(r.SphLen_km) * 10) / 10 : null,
    lines,
  });
}

const out = {
  source: 'USGS SIM 3292, Geologic Map of Mars (Tanaka and others, 2014), SIM3292_Global_Structure',
  url: 'https://pubs.usgs.gov/sim/3292/',
  scale: '1:20,000,000',
  frame: 'GCS_Mars_2000_Sphere, planetocentric latitude, east longitude −180…180°',
  coordinateOrder: '[longitude, latitude]',
  simplification: 'Douglas–Peucker, 0.005° (display only); lengthKm is the database SphLen_km',
  features,
};
const dir = fileURLToPath(new URL('../public/data/hazards/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(dir + 'structures.json', JSON.stringify(out));
const count = (c) => features.filter((f) => f.category === c).length;
console.log(`wrote ${features.length} lines (F ${count('F')}, P ${count('P')})`);
