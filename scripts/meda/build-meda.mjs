// Builds the Mars Dashboard's Perseverance MEDA observations from the NASA PDS archive.
//
//   node scripts/meda/build-meda.mjs [sol …]        (default: the sols in DEFAULT_SOLS)
//
// Why a build step: the PDS Atmospheres Node (atmos.nmsu.edu) sends no CORS headers, so a
// browser cannot read it, and one sol of these products is ~40 MB. This server-side adapter
// downloads the calibrated/derived products, checks each CSV against its PDS4 label (field
// names and units), applies the products' own quality indicators, converts the spacecraft
// clock to UTC from the label's anchors, and keeps ACTUAL records (one per 10-minute slot, no
// averaging) in a small JSON file per sol under public/data/meda/. Values stay in the source
// units; the app converts them according to the recorded unit.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CACHE = join(ROOT, '.cache', 'meda');
const OUT = join(ROOT, 'public', 'data', 'meda');
const ARCHIVE = 'https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/';
// 313 is the last sol whose derived wind product (DER_WS) holds valid speeds: sols 314–315
// contain only the fill value, and later sols have no wind product
const DEFAULT_SOLS = [100, 313, 500, 1000, 'latest'];
const SLOT_S = 600; // one record per 10 minutes of UTC
const MATCH_S = 90; // nearest record within ±90 s of each slot

// Landing point: NASA Mars 2020 localization, site 3 drive 0 (also used in src/map/marsTrek.ts)
const LANDING = { latitude: 18.44462715, longitudeEast: 77.45088572, source: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json' };
const MARS_R_M = 3389500;

/** Products used, and the fields and units their labels must declare. */
const PRODUCTS = {
  ats: { collection: 'data_calibrated_env', code: 'CAL_ATS', fields: { ATS_LOCAL_TEMP1: 'kelvin', ATS_LOCAL_TEMP2: 'kelvin', ATS_LOCAL_TEMP3: 'kelvin' } },
  tirs: {
    collection: 'data_calibrated_env',
    code: 'CAL_TIRS',
    fields: { GROUND_TEMP: 'kelvin', GROUND_TEMP_UNCERTAINTY: 'kelvin', WHEEL_OUTSIDE_TIRS_DOWNWARD_LOOKING_FOV: null, ROVER_LOW_TILT: null, TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW: null, ROVER_STILL: null },
  },
  ps: { collection: 'data_calibrated_env', code: 'CAL_PS', fields: { BAROCAP1_PRESSURE: 'pascal', BAROCAP1_PRESSURE_UNCERTAINTY: 'pascal', TRANSDUCER: null } },
  ws: { collection: 'data_derived_env', code: 'DER_WS', fields: { HORIZONTAL_WIND_SPEED: 'meter/second', HORIZONTAL_WIND_SPEED_UNCERTAINTY: null, ROVER_STILL: null } },
  anc: { collection: 'data_derived_env', code: 'DER_ANCILLARY', fields: { ROVER_POSITION_X: 'meter', ROVER_POSITION_Y: 'meter' } },
};

async function get(url, attempt = 1) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(300000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise((res) => setTimeout(res, 2000 * attempt));
    return get(url, attempt + 1);
  }
}

const listing = async (url) => (await get(url)).toString('latin1');
const hrefs = (html, re) => [...html.matchAll(/href="([^"?]+)"/g)].map((m) => m[1]).filter((h) => re.test(h));

/** Finds a sol's directory in a collection (sols are grouped in ranges such as sol_0090_0179/). */
async function solDir(collection, sol) {
  const top = await listing(ARCHIVE + collection + '/');
  const ranges = hrefs(top, /^sol_\d{4}_\d{4}\/$/);
  if (sol === 'latest') {
    const last = ranges.sort().at(-1);
    const sols = hrefs(await listing(ARCHIVE + collection + '/' + last), /^sol_\d{4}\/$/).sort();
    return { dir: ARCHIVE + collection + '/' + last + sols.at(-1), sol: Number(sols.at(-1).slice(4, 8)) };
  }
  const range = ranges.find((r) => {
    const [, a, b] = r.match(/sol_(\d{4})_(\d{4})/);
    return sol >= Number(a) && sol <= Number(b);
  });
  if (!range) throw new Error(`sol ${sol} is not in ${collection}`);
  return { dir: `${ARCHIVE}${collection}/${range}sol_${String(sol).padStart(4, '0')}/`, sol };
}

/** Reads the PDS4 label: field order, names, units, time anchors and identification. */
function parseLabel(xml) {
  const tag = (t) => xml.match(new RegExp(`<(?:\\w+:)?${t}[^>]*>([^<]*)</`))?.[1]?.trim() ?? null;
  const fields = [...xml.matchAll(/<Field_Delimited>([\s\S]*?)<\/Field_Delimited>/g)].map((m) => ({
    name: m[1].match(/<name>([^<]*)<\/name>/)[1].trim(),
    number: Number(m[1].match(/<field_number>([^<]*)<\/field_number>/)[1]),
    unit: m[1].match(/<unit>([^<]*)<\/unit>/)?.[1]?.trim() ?? null,
  }));
  const constants = [...xml.matchAll(/<(missing_constant|invalid_constant|unknown_constant|not_applicable_constant)>([^<]*)</g)].map((m) => ({ kind: m[1], value: m[2] }));
  return {
    lid: tag('logical_identifier'),
    version: tag('version_id'),
    title: tag('title'),
    startUtc: Date.parse(tag('start_date_time')),
    stopUtc: Date.parse(tag('stop_date_time')),
    sclkStart: Number(tag('spacecraft_clock_start')),
    sclkStop: Number(tag('spacecraft_clock_stop')),
    lsStart: Number(tag('start_solar_longitude')),
    lsStop: Number(tag('stop_solar_longitude')),
    fields,
    constants,
  };
}

/** Downloads (or reuses) one product's CSV and label, and checks them against each other. */
async function loadProduct(key, sol) {
  const spec = PRODUCTS[key];
  const { dir, sol: solNumber } = await solDir(spec.collection, sol);
  const files = hrefs(await listing(dir), new RegExp(`_${spec.code}_+P\\d+\\.(CSV|xml)$`));
  const csvName = files.find((f) => f.endsWith('.CSV'));
  const xmlName = files.find((f) => f.endsWith('.xml'));
  // A product can be absent for a sol (e.g. no wind after the sensor was damaged): recorded as missing
  if (!csvName || !xmlName) return null;
  mkdirSync(CACHE, { recursive: true });
  const read = async (name) => {
    const p = join(CACHE, name);
    if (!existsSync(p)) writeFileSync(p, await get(dir + name));
    return readFileSync(p, 'latin1');
  };
  const label = parseLabel(await read(xmlName));
  const text = await read(csvName);
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const header = lines[0].split(',');
  // The CSV header must be the label's fields, in order
  const expected = label.fields.sort((a, b) => a.number - b.number).map((f) => f.name);
  if (header.join() !== expected.join()) throw new Error(`${csvName}: header does not match its label`);
  for (const [name, unit] of Object.entries(spec.fields)) {
    const f = label.fields.find((x) => x.name === name);
    if (!f) throw new Error(`${csvName}: no field ${name}`);
    if (unit !== null && f.unit !== unit) throw new Error(`${csvName}: ${name} is in ${f.unit}, expected ${unit}`);
  }
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = lines.slice(1).map((l) => l.split(','));
  return { key, sol: solNumber, label, rows, col, csvUrl: dir + csvName, xmlUrl: dir + xmlName, csvName };
}

/**
 * Fill value written where no retrieval exists. The labels do not declare it, but the derived
 * wind product uses it in place of a speed (with WIND_DIRECTION also 999999999 and a blank
 * uncertainty): 2,327 rows on sol 100, and every row on sols 314–315, after the wind sensor
 * was damaged. No MEDA quantity is near this value, so it is never read as a measurement.
 */
const FILL = '999999999';

/** A number, or null for blank, fill or non-finite fields (blank means missing in these products). */
function num(s, constants) {
  if (s === undefined) return null;
  const t = s.trim();
  if (t === '' || t === FILL || constants.some((c) => c.value === t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** UTC of a record from its SCLK, interpolated between the label's start/stop anchors. */
const utcOf = (label, sclk) => label.startUtc + ((sclk - label.sclkStart) * (label.stopUtc - label.startUtc)) / (label.sclkStop - label.sclkStart);

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Valid records of one product as { utc, sclk, ltst, … }, plus rejection counts by reason. */
function records(p, pick) {
  const out = [];
  const rejected = {};
  for (const r of p.rows) {
    const sclk = num(r[p.col.SCLK], []);
    if (sclk === null) continue;
    const res = pick(r, (name) => num(r[p.col[name]], p.label.constants), (name) => r[p.col[name]]?.trim() ?? '');
    if (typeof res === 'string') {
      rejected[res] = (rejected[res] ?? 0) + 1;
      continue;
    }
    out.push({ utc: utcOf(p.label, sclk), sclk, ltst: r[p.col.LTST], ...res });
  }
  return { out, rejected };
}

/** One actual record per slot: the valid record nearest each slot time, within ±MATCH_S. */
function slots(recs, start, stop) {
  const picked = [];
  let j = 0;
  for (let t = Math.ceil(start / (SLOT_S * 1000)) * SLOT_S * 1000; t <= stop; t += SLOT_S * 1000) {
    while (j + 1 < recs.length && Math.abs(recs[j + 1].utc - t) <= Math.abs(recs[j].utc - t)) j++;
    if (recs[j] && Math.abs(recs[j].utc - t) <= MATCH_S * 1000) picked.push(recs[j]);
  }
  return picked;
}

async function buildSol(sol) {
  const [ats, tirs, ps, ws, anc] = await Promise.all(['ats', 'tirs', 'ps', 'ws', 'anc'].map((k) => loadProduct(k, sol)));
  const present = [ats, tirs, ps, ws, anc].filter(Boolean);
  if (!present.length) throw new Error(`no products for sol ${sol}`);
  const solNumber = present[0].sol;
  const none = { out: [], rejected: { 'product not in the archive for this sol': 1 } };

  // Air: median of the three mast-mounted (RSM) sensors; their range is reported with it
  const air = !ats ? none : records(ats, (_, n) => {
    const v = ['ATS_LOCAL_TEMP1', 'ATS_LOCAL_TEMP2', 'ATS_LOCAL_TEMP3'].map(n).filter((x) => x !== null);
    if (v.length < 2) return 'fewer than two mast sensors';
    return { value: median(v), min: Math.min(...v), max: Math.max(...v), n: v.length };
  });
  // Ground: TIRS ground brightness temperature, rejected when the product's flags mark a problem
  const ground = !tirs ? none : records(tirs, (_, n, s) => {
    if (s('TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW') === '0') return 'footprint shadowed by the rover';
    if (s('ROVER_LOW_TILT') === '0') return 'rover tilt ≥ 20°';
    if (s('ROVER_STILL') === '0') return 'rover moving';
    if (s('WHEEL_OUTSIDE_TIRS_DOWNWARD_LOOKING_FOV') === '0') return 'wheel in the field of view';
    const v = n('GROUND_TEMP');
    if (v === null) return 'no value';
    return { value: v, unc: n('GROUND_TEMP_UNCERTAINTY'), wheelFlag: s('WHEEL_OUTSIDE_TIRS_DOWNWARD_LOOKING_FOV') || null };
  });
  // Pressure: the transducer in use (TRANSDUCER) reports through BAROCAP1_PRESSURE
  const pressure = !ps ? none : records(ps, (_, n, s) => {
    const v = n('BAROCAP1_PRESSURE');
    if (v === null) return 'no value';
    return { value: v, unc: n('BAROCAP1_PRESSURE_UNCERTAINTY'), transducer: s('TRANSDUCER') || null };
  });
  // Wind: the derived horizontal wind speed, only while the rover is still
  const wind = !ws ? none : records(ws, (_, n, s) => {
    if (s('ROVER_STILL') === '0') return 'rover moving';
    if (s('HORIZONTAL_WIND_SPEED') === FILL) return `fill value ${FILL} (no wind retrieval)`;
    const v = n('HORIZONTAL_WIND_SPEED');
    if (v === null) return 'no value';
    if (v < 0) return 'negative speed';
    return { value: v, unc: n('HORIZONTAL_WIND_SPEED_UNCERTAINTY') };
  });
  const rover = !anc ? none : records(anc, (_, n) => {
    const x = n('ROVER_POSITION_X');
    const y = n('ROVER_POSITION_Y');
    return x === null || y === null ? 'no position' : { north: x, west: y };
  });

  const start = Math.min(...present.map((p) => p.label.startUtc));
  const stop = Math.max(...present.map((p) => p.label.stopUtc));
  const round = (v, d) => (v === null || v === undefined ? null : Number(v.toFixed(d)));
  const prod = (p) => (!p ? null : {
    lid: p.label.lid,
    version: p.label.version,
    title: p.label.title,
    csv: p.csvUrl,
    label: p.xmlUrl,
    startUtc: new Date(p.label.startUtc).toISOString(),
    stopUtc: new Date(p.label.stopUtc).toISOString(),
    units: Object.fromEntries(Object.keys(PRODUCTS[p.key].fields).map((f) => [f, p.label.fields.find((x) => x.name === f).unit])),
    rows: p.rows.length,
  });
  const doc = {
    sol: solNumber,
    lsStart: present[0].label.lsStart,
    lsStop: present[0].label.lsStop,
    startUtc: new Date(start).toISOString(),
    stopUtc: new Date(stop).toISOString(),
    products: { airTemperature: prod(ats), groundTemperature: prod(tirs), pressure: prod(ps), wind: prod(ws), ancillary: prod(anc) },
    rejected: { groundTemperature: ground.rejected, wind: wind.rejected, airTemperature: air.rejected, pressure: pressure.rejected },
    // [utcMs, sclk, ltst, value, …] — source units (see products.*.units)
    airTemperature: slots(air.out, start, stop).map((r) => [Math.round(r.utc), r.sclk, r.ltst, round(r.value, 3), round(r.min, 2), round(r.max, 2)]),
    groundTemperature: slots(ground.out, start, stop).map((r) => [Math.round(r.utc), r.sclk, r.ltst, round(r.value, 2), round(r.unc, 2), r.wheelFlag]),
    pressure: slots(pressure.out, start, stop).map((r) => [Math.round(r.utc), r.sclk, r.ltst, round(r.value, 2), round(r.unc, 2)]),
    windSpeed: slots(wind.out, start, stop).map((r) => [Math.round(r.utc), r.sclk, r.ltst, round(r.value, 3), round(r.unc, 3)]),
    // Rover position: metres north (+X) and west (+Y) of the landing site, M2020_TOPO
    rover: slots(rover.out, start, stop).map((r) => [Math.round(r.utc), round(r.north, 1), round(r.west, 1)]),
  };
  mkdirSync(OUT, { recursive: true });
  const file = `sol_${String(solNumber).padStart(4, '0')}.json`;
  writeFileSync(join(OUT, file), JSON.stringify(doc));
  console.log(`sol ${solNumber}: air ${doc.airTemperature.length}, ground ${doc.groundTemperature.length}, pressure ${doc.pressure.length}, wind ${doc.windSpeed.length}, rover ${doc.rover.length}`);
  console.log('  rejected', JSON.stringify(doc.rejected));
  return { sol: solNumber, file, startUtc: doc.startUtc, stopUtc: doc.stopUtc, lsStart: doc.lsStart, lsStop: doc.lsStop };
}

const args = process.argv.slice(2);
const sols = args.length ? args.map((a) => (a === 'latest' ? a : Number(a))) : DEFAULT_SOLS;
const built = [];
for (const s of sols) {
  try {
    built.push(await buildSol(s));
  } catch (e) {
    console.error(`sol ${s}: ${e.message}`);
  }
}
const index = {
  version: 1,
  generated: new Date().toISOString(),
  archive: ARCHIVE,
  documentation: 'https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html',
  citation: 'Rodriguez-Manfredi et al. (2021), MEDA bundle, NASA PDS Atmospheres Node, doi:10.17189/1522849',
  landing: LANDING,
  marsRadiusM: MARS_R_M,
  slotSeconds: SLOT_S,
  rules: {
    airTemperature: 'Calibrated ATS: median of the three mast (RSM) sensors ATS_LOCAL_TEMP1–3 (kelvin); records with fewer than two values are skipped. Body-mounted sensors 4–5 are not used.',
    groundTemperature: 'Calibrated TIRS GROUND_TEMP (ground brightness temperature, kelvin). Rejected when TIRS_GROUND_FOOTPRINT_NOT_IN_SHADOW, ROVER_LOW_TILT, ROVER_STILL or WHEEL_OUTSIDE_TIRS_DOWNWARD_LOOKING_FOV is 0. A blank flag is recorded as not determined.',
    pressure: 'Calibrated PS BAROCAP1_PRESSURE (pascal): the transducer in use (TRANSDUCER). Blank uncertainty = not provided.',
    windSpeed: 'Derived WS HORIZONTAL_WIND_SPEED (meter/second), only while ROVER_STILL = 1; the fill value 999999999 is rejected. The product supplies a speed (not east/north components).',
    missing: 'Blank CSV fields are missing values (the labels declare no special constants); they are never read as zero. The fill value 999999999, used by the wind product where no retrieval exists, is also missing.',
    timestamps: 'UTC interpolated from each record’s SCLK between the label’s start/stop date-time and spacecraft-clock anchors.',
    sampling: 'One actual record per 10-minute slot (the nearest valid record within ±90 s); no averaging.',
  },
  sols: built.sort((a, b) => a.sol - b.sol),
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log('wrote', join(OUT, 'index.json'));
