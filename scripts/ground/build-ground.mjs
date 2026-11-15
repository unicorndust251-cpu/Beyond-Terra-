// Builds the Ground Perspective catalogue: curated NASA rover photographs with verified metadata.
//
//   node scripts/ground/build-ground.mjs
//
// For each curated image ID it reads NASA's own raw-image record (mars.nasa.gov raw-image
// feed), checks that every image URL loads, and locates the camera only when the image's
// rover motion counter (site/drive) exactly matches a rover position NASA has published in
// its MMGIS localization (waypoint) file. Otherwise the capture coordinates stay null.
// Writes public/data/ground/catalogue.json.
//
// The image IDs were curated by hand from photographs taken at localized stops spread along
// each traverse, keeping views of terrain (rocks, slopes, horizon) rather than of the rover
// deck, calibration target or sky. Nothing in the records is written by hand except the
// regions (IAU Gazetteer) and the explanation of how capture coordinates were found.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CACHE = join(ROOT, '.cache', 'ground');
const OUT = join(ROOT, 'public', 'data', 'ground');

const ROVERS = {
  perseverance: {
    mission: 'Mars 2020',
    rover: 'Perseverance',
    category: 'mars2020',
    waypoints: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json',
    rawImagesPage: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/',
    region: 'jezero',
  },
  curiosity: {
    mission: 'Mars Science Laboratory',
    rover: 'Curiosity',
    category: 'msl',
    waypoints: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json',
    rawImagesPage: 'https://mars.nasa.gov/msl/multimedia/raw-images/',
    region: 'gale',
  },
};

const CURATED = {
  perseverance: [
    'ZL0_0211_0685688247_081EBY_N0072050ZCAM08246_1100LMJ',
    'NLG_0211_0685670907_566ECM_N0072050NCAM00521_00_2I4J',
    'ZL0_0410_0703350560_146EBY_N0220000ZCAM08426_1100LMJ',
    'NLF_0477_0709297838_897ECM_N0261004NCAM02477_04_195J',
    'ZL0_0710_0729981068_159EBY_N0332864ZCAM08713_1100LMJ',
    'NLE_0709_0729895644_487ECM_N0332864SCAM02709_00_0LLJ',
    'ZL0_0796_0737619642_598EBY_N0391112ZCAM08819_1100LMJ',
    'NLF_0795_0737532882_096ECM_N0391112NCAM02795_01_195J',
    'NLF_0899_0746758795_974ECM_N0440898NCAM02899_01_195J',
    'NLF_1004_0756084590_725ECM_N0480748NCAM02004_04_195J',
    'NLR_1096_0764248647_770ECM_N0510410NCAM00502_01_1I6J',
    'NLF_1150_0769041691_880ECM_N0522638NCAM02150_01_195J',
    'ZL0_1225_0775688210_644EBY_N0561998ZCAM09273_1100LMJ',
    'NLF_1224_0775611632_918ECM_N0561998NCAM02224_01_195J',
    'ZL0_1306_0782884903_113EBY_N0611394ZCAM09367_1100LMJ',
    'NLG_1305_0782799746_972ECM_N0611394NCAM00528_00_2I4J',
    'NLG_1381_0789551608_497ECM_N0650000NCAM00500_00_2I4J',
    'ZL0_1469_0797348889_956EBY_N0710696ZCAM09527_1100LMJ',
    'NLF_1468_0797259366_770ECM_N0710696NCAM03468_01_195J',
    'NLF_1563_0805697205_645ECM_N0771350NCAM15563_05_095J',
    'NLG_1635_0812101865_260ECM_N0790732SCAM04635_00_1LLJ',
    'ZL0_1766_0823714147_909EBY_N0841192ZCAM09819_1100LMJ',
    'NLF_1765_0823630106_020ECM_N0841192NCAM13765_01_195J',
    'NLG_1835_0829851251_425ECM_N0874924NCAM00521_00_2I4J',
    'ZL0_1905_0836062930_409EBY_N0891242ZCAM09956_1100LMJ',
    'NLF_1904_0835970421_987ECM_N0891242NCAM14904_01_195J',
    'NLF_2009_0845300737_284ECM_N0920000NCAM02009_04_195J',
  ],
  curiosity: [
    'NLA_406377709EDR_F0050178NCAM00338M_',
    'NLA_406373862EDR_F0050116NCAM03214M_',
    'NLB_429901546EDR_F0120690NCAM00272M_',
    'NLB_448457316EDR_F0300740NCAM00251M_',
    'NLB_469141180EDR_F0441432NCAM00254M_',
    'NLB_496043376EDR_F0500448NCAM00350M_',
    'NLB_517605808EDR_F0542202NCAM00284M_',
    'NLB_539368694EDR_F0602928NCAM00654M_',
    'NLB_558534380EDR_F0660084NCAM00255M_',
    'NLB_577895166EDR_F0692766NCAM00312M_',
    'NLB_611270213EDR_F0751564NCAM00263M_',
    'NLB_637191038EDR_F0790588NCAM00257M_',
    'NLB_664802684EDR_F0851486NCAM00312M_',
    'NLB_682108246EDR_F0901732NCAM00354M_',
    'NLB_703690230EDR_F0941102NCAM00354M_',
    'NLB_720813053EDR_F0980270NCAM00354M_',
    'NLB_779412524EDR_F1082528NCAM00257M_',
    'NLB_793615361EDR_F1132040NCAM00281M_',
    'NLB_805686826EDR_F1172166NCAM00253M_',
    'NLB_827253869EDR_F1210762NCAM00271M_',
    'NLB_847593761EDR_F1252274NCAM00278M_',
  ],
};

/** Mission regions: the crater each rover explores, from the IAU/USGS Gazetteer (public/data/places). */
const GAZETTEER = 'https://planetarynames.wr.usgs.gov/';
const REGIONS = {
  jezero: { name: 'Jezero crater', gazetteerId: 14300, latitude: 18.4082, longitudeEast: 77.6873, diameterKm: 47.5 },
  gale: { name: 'Gale crater', gazetteerId: 2071, latitude: -5.3672, longitudeEast: 137.811, diameterKm: 154.1 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url, init) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, init);
      if (r.status < 500) return r;
      last = new Error(`HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
    await sleep(1000 * (i + 1));
  }
  throw new Error(`${url}: ${last?.message}`);
}
async function cachedJson(name, url) {
  mkdirSync(CACHE, { recursive: true });
  const p = join(CACHE, name);
  if (!existsSync(p)) {
    const r = await fetchRetry(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    writeFileSync(p, await r.text());
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** True when the URL answers 200 with an image. */
async function imageLoads(url) {
  if (!url) return false;
  const r = await fetchRetry(url, { method: 'HEAD' });
  return r.ok && (r.headers.get('content-type') ?? '').startsWith('image/');
}

const normLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Rover motion counter (site, drive) of an image, from the feed or, for Curiosity Navcam, its product ID. */
function rmcOf(key, item) {
  if (key === 'perseverance') {
    const site = Number(item.site);
    const drive = Number(item.drive);
    if (item.site === '' || item.drive === '' || !Number.isInteger(site) || !Number.isInteger(drive)) return null;
    // The product ID repeats it ("N" + 3-digit site + 4-digit drive); the two must agree
    const m = item.imageid.match(/_N(\d{3})(\d{4})/);
    if (m && (+m[1] !== site || +m[2] !== drive)) throw new Error(`${item.imageid}: site/drive ${site}/${drive} disagrees with its product ID`);
    return { site, drive, from: 'raw-image record (site, drive)' };
  }
  // Curiosity: the feed leaves site/drive blank; MIPL product IDs carry it as F/S + site(3) + drive(4)
  const m = item.imageid.match(/EDR_[A-Z](\d{3})(\d{4})NCAM/);
  return m ? { site: +m[1], drive: +m[2], from: 'product ID (F/S + site + drive)' } : null;
}

const camera = (item) => (item.title.split(': ').slice(1).join(': ') || item.camera.instrument).trim();

async function build() {
  const images = [];
  const rejected = [];
  for (const [key, cfg] of Object.entries(ROVERS)) {
    const wp = (await cachedJson(`${key}-waypoints.json`, cfg.waypoints)).features.map((f) => f.properties);
    const byRmc = new Map(wp.map((p) => [`${p.site}_${p.drive}`, p]));
    for (const id of CURATED[key]) {
      const recordUrl = `https://mars.nasa.gov/rss/api/?feed=raw_images&category=${cfg.category}&feedtype=json&id=${id}`;
      const r = await fetchRetry(recordUrl);
      // One record comes back as { image: [record] }
      const item = r.ok ? (await r.json()).image?.[0] : null;
      if (!item || item.imageid !== id) {
        rejected.push({ id, reason: 'NASA raw-image record not found' });
        continue;
      }
      // Some records still give http:// links; the same files are served over https (checked below)
      const files = Object.fromEntries(Object.entries(item.image_files ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/^http:\/\//, 'https://') : v]));
      const [large, medium, small, full] = await Promise.all([files.large, files.medium, files.small, files.full_res].map(imageLoads));
      const imageUrl = large ? files.large : medium ? files.medium : null;
      if (!imageUrl) {
        rejected.push({ id, reason: 'image did not load' });
        continue;
      }
      const sol = Number(item.sol);
      const taken = item.date_taken_utc && !Number.isNaN(Date.parse(`${item.date_taken_utc.replace(/Z$/, '')}Z`)) ? `${item.date_taken_utc.replace(/Z$/, '')}Z` : null;

      const rmc = rmcOf(key, item);
      const w = rmc ? byRmc.get(`${rmc.site}_${rmc.drive}`) : null;
      let capture = null;
      let captureNote;
      if (!rmc) captureNote = 'The record gives no rover motion counter, so the capture position is not known.';
      else if (!w) captureNote = `NASA has published no rover position for site ${rmc.site}, drive ${rmc.drive}, so the capture position is not known.`;
      else if (w.sol > sol) captureNote = `The published position for site ${rmc.site}, drive ${rmc.drive} is from sol ${w.sol}, after the image (sol ${sol}); not used.`;
      else {
        capture = {
          latitude: w.lat,
          longitudeEast: Number(normLon(w.lon).toFixed(8)),
          site: rmc.site,
          drive: rmc.drive,
          localizedSol: w.sol,
          method: `Rover position NASA published for site ${rmc.site}, drive ${rmc.drive} (rover motion counter from the ${rmc.from}). The camera is on the rover at that stop; the position is the rover's, not a surveyed camera point.`,
          source: cfg.waypoints,
        };
      }

      const missing = [];
      if (!taken) missing.push('Earth capture date');
      if (!capture) missing.push('capture coordinates');
      if (!small) missing.push('thumbnail');
      missing.push('image orientation');
      images.push({
        id,
        mission: cfg.mission,
        rover: cfg.rover,
        region: cfg.region,
        camera: camera(item),
        instrument: item.camera?.instrument ?? null,
        imageUrl,
        thumbnailUrl: small ? files.small : null,
        fullResolutionUrl: full ? files.full_res : null,
        sol: Number.isInteger(sol) ? sol : null,
        earthDateUtc: taken,
        localSolarTime: item.date_taken_mars && item.date_taken_mars !== 'UNK' ? item.date_taken_mars : null,
        capture,
        captureNote: captureNote ?? null,
        coordinateConvention: capture ? 'Planetocentric latitude, east longitude −180…180°, as published in NASA MMGIS rover localizations' : null,
        // Pointing angles in the feed are in rover or site frames whose conventions are not
        // documented with it, so no compass orientation is given
        orientation: null,
        description: (item.caption ?? '').trim() || null,
        sourceUrl: item.link?.replace(/^http:\/\//, 'https://') ?? null,
        recordUrl,
        credit: item.credit || null,
        metadataStatus: missing.length === 1 ? 'complete' : 'partial',
        missing,
      });
      console.log(`${cfg.rover} sol ${sol} ${camera(item)} ${capture ? `${capture.latitude.toFixed(5)}, ${capture.longitudeEast.toFixed(5)}` : 'no capture position'}`);
    }
  }
  mkdirSync(OUT, { recursive: true });
  const doc = {
    version: 1,
    generated: new Date().toISOString(),
    sources: {
      images: 'NASA/JPL-Caltech raw images (mars.nasa.gov raw-image feed); credits per image',
      imagePolicy: 'https://www.jpl.nasa.gov/jpl-image-use-policy',
      localizations: Object.fromEntries(Object.entries(ROVERS).map(([k, v]) => [k, v.waypoints])),
      regions: `IAU/USGS Gazetteer of Planetary Nomenclature, ${GAZETTEER}`,
    },
    note: 'Rover photographs are historical observations. They show the ground where and when they were taken, not conditions at a planned mission time, and do not establish that a route is safe.',
    regions: REGIONS,
    // Height of the mast cameras above the ground, for the horizon distance (m)
    mastCameraHeightM: 2,
    images,
    rejected,
  };
  writeFileSync(join(OUT, 'catalogue.json'), JSON.stringify(doc, null, 1));
  console.log(`\n${images.length} images (${images.filter((i) => i.capture).length} with capture coordinates), ${rejected.length} rejected`);
}

await build();
