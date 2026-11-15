#!/usr/bin/env node
/**
 * Reads each hazard observation's NASA source page and records only what the page states:
 * image ID, credit, the page's image-addition (publication) date, missions, spacecraft,
 * instruments, a stated resolution, a stated acquisition date and the image URL.
 *
 *   node scripts/fetch-hazard-sources.mjs
 *
 * Input:  src/hazards/data/catalogue.ts (the 60 records; IDs and URLs are read from it)
 * Output: src/hazards/data/sources.json
 *
 * Nothing is guessed: a field the page does not state is written as null. Text fields are
 * quoted from the page. Pages are fetched one at a time with a pause, to be polite.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const catalogue = readFileSync(new URL('src/hazards/data/catalogue.ts', root), 'utf8');
const PREFIX = { PJ: 'https://science.nasa.gov/photojournal/', RES: 'https://science.nasa.gov/resource/' };
const rows = [...catalogue.matchAll(/r\('(H\d{3})'[\s\S]*?`\$\{(PJ|RES)\}([^`]+)`\)/g)].map((m) => ({
  id: m[1],
  url: PREFIX[m[2]] + m[3],
}));
if (rows.length !== 60) throw new Error(`expected 60 records, found ${rows.length}`);

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan\.|Feb\.|Aug\.|Sept\.|Oct\.|Nov\.|Dec\.';
const MONTH_NUM = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function isoFromWords(s) {
  const m = s && s.match(/^([A-Za-z]+)\.? (\d{1,2}),? (\d{4})$/);
  const n = m && MONTH_NUM[m[1].slice(0, 3).toLowerCase()];
  return n ? `${m[3]}-${String(n).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}
const INSTRUMENTS = [
  ['High Resolution Imaging Science Experiment', 'HiRISE (High Resolution Imaging Science Experiment)', 'Mars Reconnaissance Orbiter'],
  ['Context Camera', 'CTX (Context Camera)', 'Mars Reconnaissance Orbiter'],
  ['Compact Reconnaissance Imaging Spectrometer', 'CRISM (Compact Reconnaissance Imaging Spectrometer for Mars)', 'Mars Reconnaissance Orbiter'],
  ['Thermal Emission Imaging System', 'Thermal Emission Imaging System', 'Mars Odyssey'],
];

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&#8217;|&rsquo;/g, '’')
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&deg;|&#176;/g, '°')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function lines(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, '\n'),
  )
    .split('\n')
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** The value after a "Label:" line, up to the next label. */
function field(t, label) {
  const i = t.findIndex((x) => x.toLowerCase() === label.toLowerCase());
  if (i < 0) return null;
  const out = [];
  for (let j = i + 1; j < t.length && !/:$/.test(t[j]) && !/^Downloads$/i.test(t[j]); j++) out.push(t[j]);
  return out.length ? out.join(' ') : null;
}

function isoFromSlashes(s) {
  const m = s && s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

function extractResource(html, t) {
  const title = html.match(/<meta property="og:title" content="([^"]+)"/i);
  const name = title ? decode(title[1]).replace(/ - NASA Science$/, '') : null;
  const ti = name ? t.findIndex((x) => x === name) : -1;
  const ci = t.findIndex((x) => x === 'Credit');
  const li = t.findIndex((x, i) => i > ci && /^Downloads$/.test(x));
  const body = t.slice(t.findIndex((x, i) => i > ci && x === 'english') + 1, li > 0 ? li : undefined);
  const text = body.join(' ');
  const inst = INSTRUMENTS.find(([k]) => text.includes(k));
  const acquired = text.match(new RegExp(`(?:acquired|taken|captured|obtained)[^.]{0,140}?\\b((?:${MONTHS}) \\d{1,2},? \\d{4})`, "i"));
  const obs = text.match(/\b(ESP|PSP)_\d{6}_\d{4}\b/);
  const centre = text.match(/(?:centered at|scene is at)\s*([\d.]+ degrees (?:north|south) latitude, [\d.]+ degrees (?:east|west) longitude)/i);
  const og = html.match(/<meta property="og:image" content="([^"]+)"/i);
  return {
    pageTitle: name,
    imageId: obs ? obs[0] : null,
    credit: ci >= 0 ? t[ci + 1] : null,
    publishedDate: ti >= 0 ? isoFromWords(t[ti + 1]) : null,
    target: /Mars|Martian/.test(text) ? 'Mars (stated in text)' : null,
    missions: inst ? inst[2] : null,
    spacecraft: inst ? inst[2] : null,
    instruments: inst ? inst[1] : null,
    resolutionText: null,
    acquiredDateText: acquired ? acquired[1] : null,
    statedCentreText: centre ? centre[1] : null,
    summary: body[0] ?? null,
    imageUrl: og ? decode(og[1]).split('?')[0] : null,
  };
}

function extract(html) {
  const t = lines(html);
  if (!t.some((x) => /^PIAd{5}$/.test(x)) && t.includes('Credit')) return extractResource(html, t);
  const pia = t.find((x) => /^PIA\d{5}$/.test(x)) ?? null;
  const start = t.findIndex((x) => x === 'Description');
  const end = t.findIndex((x, i) => i > start && /^(Keep Exploring|Discover More Topics)/.test(x));
  const body = start >= 0 ? t.slice(start + 1, end > start ? end : start + 40) : [];
  const text = body.join(' ');

  const res = text.match(/(\d+(?:\.\d+)?)\s*(centimeters?|cm|meters?|metres?|m|km)\s*(?:\/|per\s*)\s*pixel/i);
  const acquired =
    text.match(new RegExp(`(?:acquired|taken|captured|obtained|imaged|observed|photographed)[^.]{0,140}?\\b((?:${MONTHS}) \\d{1,2},? \\d{4})`, 'i')) ??
    text.match(new RegExp(`\\bon ((?:${MONTHS}) \\d{1,2},? \\d{4})`, 'i'));
  // Newer THEMIS pages: "Orbit Number: 80442 Latitude: -36.3327 Longitude: 198.274 Instrument: VIS Captured: 2020-02-01 21:41"
  const themis = text.match(/Orbit Number:\s*(\d+)\s*Latitude:\s*(-?[\d.]+)\s*Longitude:\s*(-?[\d.]+)\s*Instrument:\s*(\w+)\s*Captured:\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/);
  const centre = text.match(/Latitude\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?,?\s*Longitude\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?/i);
  const jpg = html.match(/https:\/\/[^"'\s]+?\/(PIA\d{5})(?:_[a-z0-9]+)?\.jpg/i);
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/i);
  const title = html.match(/<meta property="og:title" content="([^"]+)"/i);
  const summary = body.find((x) => x.length > 60 && !/^Context image/i.test(x)) ?? null;

  return {
    pageTitle: title ? decode(title[1]).replace(/ - NASA Science$/, '') : null,
    imageId: pia,
    credit: field(t, 'Credits:'),
    publishedDate: isoFromSlashes(field(t, 'Image Addition Date:')),
    target: field(t, 'Target:'),
    missions: field(t, 'Mission(s):'),
    spacecraft: field(t, 'Spacecraft(s):'),
    instruments: field(t, 'Instrument(s):'),
    resolutionText: res ? res[0] : null,
    acquiredDateText: themis ? themis[5] + (themis[6] ? ` ${themis[6]} (time as stated)` : "") : acquired ? acquired[1] : null,
    acquiredDateIso: themis ? themis[5] : null,
    orbit: themis ? themis[1] : null,
    statedCentreText: themis ? `Latitude: ${themis[2]} Longitude: ${themis[3]}` : centre ? centre[0] : null,
    summary,
    imageUrl: jpg ? jpg[0] : ogImage ? decode(ogImage[1]).split('?')[0] : null,
  };
}

const today = new Date().toISOString().slice(0, 10);
const out = {};
for (const { id, url } of rows) {
  let rec;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research catalogue)' } });
    if (!res.ok) rec = { httpStatus: res.status };
    else rec = { httpStatus: res.status, ...extract(await res.text()) };
  } catch (err) {
    rec = { httpStatus: null, error: String(err) };
  }
  if (rec.acquiredDateText) rec.acquiredDate = rec.acquiredDateIso ?? isoFromWords(rec.acquiredDateText);
  delete rec.acquiredDateIso;
  out[id] = { url, retrievedDate: today, ...rec };
  console.log(id, rec.httpStatus, rec.imageId ?? '', rec.instruments ?? '', rec.publishedDate ?? '', rec.acquiredDateText ?? '');
  await new Promise((r) => setTimeout(r, 400));
}

writeFileSync(fileURLToPath(new URL('src/hazards/data/sources.json', root)), JSON.stringify(out, null, 2) + '\n');
console.log('wrote src/hazards/data/sources.json');
