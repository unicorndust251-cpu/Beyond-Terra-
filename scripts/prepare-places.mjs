#!/usr/bin/env node
/**
 * Builds the place-name index for search (public/data/places/mars-places.json) from the
 * IAU/USGS Gazetteer of Planetary Nomenclature.
 *
 *   node scripts/prepare-places.mjs <MARS_nomenclature_center_pts.dbf>
 *
 * Source: https://planetarynames.wr.usgs.gov/shapefiles/MARS_nomenclature_center_pts.zip
 * (planetocentric latitude, east longitude 0…360°, Mars 2000 sphere). Longitudes are
 * written −180…180°, the map's convention. Only IAU-adopted names are kept.
 *
 * Each entry: [name, type, latitude, longitude, diameter km, Gazetteer feature id].
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [dbfPath] = process.argv.slice(2);
if (!dbfPath) {
  console.error('usage: prepare-places.mjs <MARS_nomenclature_center_pts.dbf>');
  process.exit(1);
}
const buf = readFileSync(dbfPath);
const n = buf.readUInt32LE(4);
const hlen = buf.readUInt16LE(8);
const rlen = buf.readUInt16LE(10);
const fields = [];
for (let o = 32; buf[o] !== 0x0d; o += 32) fields.push({ name: buf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: buf[o + 16] });
for (const need of ['name', 'type', 'center_lat', 'center_lon', 'diameter', 'approval', 'link']) {
  if (!fields.some((f) => f.name === need)) throw new Error(`missing field ${need}`);
}

const places = [];
for (let i = 0; i < n; i++) {
  let o = hlen + i * rlen + 1;
  const r = {};
  for (const f of fields) {
    r[f.name] = buf.toString('utf8', o, o + f.len).trim();
    o += f.len;
  }
  if (r.approval !== 'Adopted by IAU') continue;
  const lat = Number(r.center_lat);
  let lon = Number(r.center_lon);
  if (lon > 180) lon -= 360;
  const id = Number(r.link.split('/').pop());
  // "Crater, craters" → "Crater"
  const type = r.type.split(',')[0].trim();
  places.push([r.name, type, Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, Math.round(Number(r.diameter) * 10) / 10, id]);
}
places.sort((a, b) => a[0].localeCompare(b[0]));

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'places');
mkdirSync(root, { recursive: true });
writeFileSync(
  join(root, 'mars-places.json'),
  JSON.stringify({
    source: 'IAU/USGS Gazetteer of Planetary Nomenclature (MARS_nomenclature_center_pts)',
    url: 'https://planetarynames.wr.usgs.gov/',
    fields: ['name', 'type', 'latitude', 'longitude', 'diameterKm', 'featureId'],
    convention: 'planetocentric latitude, east longitude −180…180°',
    places,
  })
);
console.log(`places: ${places.length} IAU names`);
