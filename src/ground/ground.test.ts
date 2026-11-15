// Ground Perspective: record validation, location matching and sorting. Run with `npm test`.
import { greatCircleDistanceM, normalizeLongitudeEast } from '../shared';
import { distanceKm, horizonDistanceKm, imageCandidates, matchImages, parseCatalogue, parseImage, type GroundCatalogue } from './catalogue';

export const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });
const near = (name: string, got: number | null, want: number, tol: number) =>
  results.push({ name, ok: got !== null && Math.abs(got - want) <= tol, detail: `got ${got}, want ${want} ± ${tol}` });

const base = {
  mission: 'Mars 2020',
  rover: 'Perseverance',
  region: 'jezero',
  camera: 'Left Navigation Camera (Navcam)',
  imageUrl: 'https://mars.nasa.gov/a_1200.jpg',
  thumbnailUrl: 'https://mars.nasa.gov/a_320.jpg',
  sol: 100,
  earthDateUtc: '2021-06-01T16:00:54.287Z',
  description: 'NASA caption',
  sourceUrl: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/a',
  credit: 'NASA/JPL-Caltech',
};
const at = (lat: number, lon: number) => ({ latitude: lat, longitudeEast: lon });
const img = (id: string, capture: { latitude: number; longitudeEast: number } | null, extra: Record<string, unknown> = {}) => ({ ...base, id, capture, ...extra });
const JEZERO = { name: 'Jezero crater', gazetteerId: 14300, latitude: 18.4082, longitudeEast: 77.6873, diameterKm: 47.5 };
const GALE = { name: 'Gale crater', gazetteerId: 2071, latitude: -5.3672, longitudeEast: 137.811, diameterKm: 154.1 };
const doc = (images: unknown[]) => ({ regions: { jezero: JEZERO, gale: GALE }, mastCameraHeightM: 2, images });

/* --- distance and horizon --- */
near('Great circle: 1° of latitude ≈ 59.27 km (R = 3,396.19 km)', distanceKm(at(0, 0), at(1, 0)), 59.274, 0.001);
near('Uses the shared distance function', distanceKm(at(18.4, 77.4), at(-5, 137)), greatCircleDistanceM(at(18.4, 77.4), at(-5, 137)) / 1000, 1e-9);
near('Across ±180°: 179.5° E to −179.5° is 1° of longitude (~59.27 km)', distanceKm(at(0, 179.5), at(0, -179.5)), 59.274, 0.001);
near('Horizon from a 2 m mast ≈ 3.69 km', horizonDistanceKm(2), 3.686, 0.002);

/* --- longitude normalisation --- */
check('Longitude 360-convention normalised (282.6 → −77.4)', normalizeLongitudeEast(282.6) === -77.4 || Math.abs(normalizeLongitudeEast(282.6) + 77.4) < 1e-9);
const east360 = parseImage(img('e360', at(18.45, 437.45)));
check('Record longitude 437.45 is read as 77.45', 'image' in east360 && Math.abs(east360.image.capture!.longitudeEast - 77.45) < 1e-9);

/* --- validation: invalid and incomplete records --- */
const invalid = parseCatalogue(
  doc([
    img('ok', at(18.45, 77.45)),
    { ...img('nohttps', at(18, 77)), imageUrl: 'http://mars.nasa.gov/x.jpg' },
    { ...img('nosource', at(18, 77)), sourceUrl: '' },
    { ...img('nocredit', at(18, 77)), credit: null },
    img('badlat', at(95, 77)),
    img('ok', at(18, 77)),
    'not a record',
  ]),
);
check('Valid record kept', invalid.images.length === 1 && invalid.images[0].id === 'ok');
check('Invalid records rejected with reasons', invalid.rejected.length === 6, invalid.rejected.map((r) => `${r.id}: ${r.reason}`).join('; '));
check('Duplicate ID rejected', invalid.rejected.some((r) => r.reason === 'duplicate ID'));
const partial = parseImage({ ...img('partial', null), earthDateUtc: null, thumbnailUrl: undefined, description: '' });
check('Missing metadata stays null and is listed', 'image' in partial && partial.image.earthDateUtc === null && partial.image.thumbnailUrl === null && partial.image.capture === null && partial.image.metadataStatus === 'partial' && ['Earth capture date', 'capture coordinates', 'thumbnail', 'description'].every((m) => partial.image.missing.includes(m)));
check('No coordinate convention without coordinates', 'image' in partial && partial.image.coordinateConvention === null);
check('Orientation never invented', 'image' in partial && partial.image.orientation === null);

/* --- matching --- */
const cat: GroundCatalogue = parseCatalogue(
  doc([
    img('near-2km', at(18.45, 77.45)),
    img('near-1km', at(18.4500, 77.4300)),
    img('regional-15km', at(18.45, 77.30)),
    img('nolocation', null, { region: 'jezero' }),
    img('gale-1', at(-4.72, 137.38), { rover: 'Curiosity', mission: 'Mars Science Laboratory', region: 'gale' }),
    img('gale-nolocation', null, { rover: 'Curiosity', mission: 'Mars Science Laboratory', region: 'gale' }),
  ]),
);
const pick = at(18.45, 77.42); // ~1 km from near-1km, ~1.9 km from near-2km
const m = matchImages(cat, pick);
check('Nearby: captures within the horizon distance', m.matches.filter((x) => x.kind === 'nearby').map((x) => x.image.id).join() === 'near-1km,near-2km', m.matches.map((x) => `${x.image.id}:${x.kind}`).join(' '));
check('Sorted by distance (closest first)', m.matches[0].distanceKm! <= m.matches[1].distanceKm!);
check('Regional: farther capture in the same mission region', m.matches.some((x) => x.image.id === 'regional-15km' && x.kind === 'regional'));
const last = m.matches[m.matches.length - 1];
check('Mission area: no capture coordinates → listed after located images, with no distance', last.image.id === 'nolocation' && last.kind === 'mission-area' && last.distanceKm === null);
check('Other mission images left out (Gale images for a Jezero point)', !m.matches.some((x) => x.image.region === 'gale'));
check('Point inside Jezero region reported', m.regions.map((r) => r.key).join() === 'jezero');

const centre = matchImages(cat, at(-5.3672, 137.811));
check('Gale centre: Curiosity image is regional (not nearby), with its distance', centre.matches.some((x) => x.image.id === 'gale-1' && x.kind === 'regional' && x.distanceKm! > 40));
check('Gale centre: crater centre is not treated as a camera position', !centre.matches.some((x) => x.kind === 'nearby'));

const olympus = matchImages(cat, at(18.65, -133.8));
check('Olympus Mons: no images (empty result)', olympus.matches.length === 0 && olympus.regions.length === 0);
check('Olympus Mons: nearest located image reported only as a distance', olympus.nearestKm !== null && olympus.nearestKm > 5000, `${olympus.nearestKm?.toFixed(0)} km`);

check('Empty catalogue: no matches, no nearest', (() => { const e = matchImages(parseCatalogue({}), pick); return e.matches.length === 0 && e.nearestImage === null; })());

/* --- image loading fallback --- */
check('Image candidates: display image, then thumbnail', imageCandidates(cat.images[0]).join() === 'https://mars.nasa.gov/a_1200.jpg,https://mars.nasa.gov/a_320.jpg');
check('Image candidates: no thumbnail → just the image', (() => { const r = parseImage({ ...img('x', null), thumbnailUrl: null }); return 'image' in r && imageCandidates(r.image).length === 1; })());

/* --- the bundled catalogue (public/data/ground), as the app loads it --- */
declare const process: { cwd(): string };
const fsModule = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync(path: string, encoding: 'utf8'): string };
const real = parseCatalogue(JSON.parse(readFileSync(`${process.cwd()}/public/data/ground/catalogue.json`, 'utf8')));
check('Catalogue: every record valid', real.rejected.length === 0 && real.images.length > 0, `${real.images.length} images, ${real.rejected.length} rejected`);
check('Catalogue: only NASA hosts and https', real.images.every((i) => [i.imageUrl, i.sourceUrl, i.thumbnailUrl ?? 'https://mars.nasa.gov'].every((u) => /^https:\/\/mars(\.jpl)?\.nasa\.gov\//.test(u))));
check('Catalogue: every image credited to NASA/JPL-Caltech', real.images.every((i) => i.credit.startsWith('NASA/JPL-Caltech')));
check('Catalogue: capture coordinates come with their method and source', real.images.every((i) => !i.capture || (i.capture.method.length > 20 && i.capture.source.startsWith('https://'))));
const jezero = matchImages(real, at(18.4447, 77.4508));
check('Jezero (landing site): Perseverance images, nearby first', jezero.matches.length > 0 && jezero.matches.every((x) => x.image.rover === 'Perseverance') && jezero.matches[0].kind === 'nearby', `${jezero.matches.length} images, first ${jezero.matches[0]?.kind} ${jezero.matches[0]?.distanceKm?.toFixed(2)} km`);
const gale = matchImages(real, at(-5.3672, 137.811));
check('Gale crater: Curiosity images only', gale.matches.length > 0 && gale.matches.every((x) => x.image.rover === 'Curiosity'), `${gale.matches.length} images`);
check('Olympus Mons: no rover photograph offered', matchImages(real, at(18.65, -133.8)).matches.length === 0);
