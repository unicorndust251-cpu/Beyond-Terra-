import { fromEast360, type CoordinateBounds, type MarsCoordinate } from '../shared';

/**
 * Martian reference locations for search and navigation.
 *
 * Supplied coordinates: planetocentric latitude and east longitude 0…360°, as researched
 * for Beyond Terra. Each one was checked on 2026-11-14 against:
 *   - the IAU/USGS Gazetteer of Planetary Nomenclature (MARS_nomenclature_center_pts,
 *     planetocentric, +East, 0…360°, Mars 2000 sphere): feature centre, extent and type;
 *   - for the landing point, NASA's Mars 2020 localization (M20_waypoints.json,
 *     site 3 drive 0: 18.44462715° N, 77.45088572° E). It is not an IAU name.
 * Every supplied value equals the authoritative one rounded to the digits given.
 *
 * Most entries are large named regions, not landing sites: their coordinates are the
 * IAU centre of the feature's extent, and selecting one frames the whole extent.
 */

export type LocationCategory =
  | 'Landing site'
  | 'Crater'
  | 'Volcano'
  | 'Canyon system'
  | 'Canyon network'
  | 'Basin floor'
  | 'Plain'
  | 'Valley';

export interface MarsLocation {
  id: string;
  name: string;
  category: LocationCategory;
  /** What the point is: a precise spot, or the centre of a named region */
  kind: 'point' | 'feature-centre';
  /** As supplied: planetocentric latitude, degrees north */
  latitude: number;
  /** As supplied: east longitude, 0…360° */
  longitudeEast360: number;
  /** Area to frame when selected (west may exceed east across ±180°), −180…180° */
  extent: CoordinateBounds;
  /** Size of the feature, km (IAU "diameter": the longest dimension) */
  sizeKm?: number;
  source: { name: string; url: string; value: string };
}

const gaz = (id: number) => `https://planetarynames.wr.usgs.gov/Feature/${id}`;
/** Gazetteer extents are given 0…360 or −180…180; the map uses −180…180. */
const box = (minLat: number, maxLat: number, minLon: number, maxLon: number): CoordinateBounds => ({
  south: minLat,
  north: maxLat,
  west: fromEast360(0, minLon).longitudeEast,
  east: fromEast360(0, maxLon).longitudeEast,
});

export const MARS_LOCATIONS: MarsLocation[] = [
  {
    id: 'perseverance-landing',
    name: 'Perseverance landing point',
    category: 'Landing site',
    kind: 'point',
    latitude: 18.4446,
    longitudeEast360: 77.4509,
    // Jezero, its delta and the surrounding plains (the map's opening view, HOME_FRAME)
    extent: box(17.4446, 19.4446, 76.2509, 78.6509),
    source: {
      name: 'NASA Mars 2020 localization (Octavia E. Butler Landing)',
      url: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json',
      value: '18.44462715° N, 77.45088572° E',
    },
  },
  {
    id: 'gale',
    name: 'Gale',
    category: 'Crater',
    kind: 'feature-centre',
    latitude: -5.37,
    longitudeEast360: 137.81,
    extent: box(-6.6671, -4.0675, 136.5078, 139.1188),
    sizeKm: 154.1,
    source: { name: 'IAU Gazetteer: Gale (crater)', url: gaz(2071), value: '−5.3672°, 137.8110° E' },
  },
  {
    id: 'olympus-mons',
    name: 'Olympus Mons',
    category: 'Volcano',
    kind: 'feature-centre',
    latitude: 18.65,
    longitudeEast360: 226.2,
    extent: box(13.4818, 23.676, 220.7567, 232.1984),
    sizeKm: 610.1,
    source: { name: 'IAU Gazetteer: Olympus Mons (mons)', url: gaz(4453), value: '18.6528°, 226.1975° E' },
  },
  {
    id: 'valles-marineris',
    name: 'Valles Marineris',
    category: 'Canyon system',
    kind: 'feature-centre',
    latitude: -14.01,
    longitudeEast360: 301.41,
    extent: box(-18.3293, -2.7768, 267.5958, 331.1543),
    sizeKm: 3761.3,
    source: { name: 'IAU Gazetteer: Valles Marineris (valles)', url: gaz(6288), value: '−14.0059°, 301.4123° E' },
  },
  {
    id: 'hellas-planitia',
    name: 'Hellas Planitia',
    category: 'Basin floor',
    kind: 'feature-centre',
    latitude: -42.43,
    longitudeEast360: 70.5,
    extent: box(-55.4167, -27.863, 45.5822, 96.1171),
    sizeKm: 2299.2,
    source: { name: 'IAU Gazetteer: Hellas Planitia (planitia)', url: gaz(2432), value: '−42.4301°, 70.5025° E' },
  },
  {
    id: 'argyre-planitia',
    name: 'Argyre Planitia',
    category: 'Basin floor',
    kind: 'feature-centre',
    latitude: -49.84,
    longitudeEast360: 316.69,
    extent: box(-57.2918, -42.4359, 306.1232, 326.6159),
    sizeKm: 892.9,
    source: { name: 'IAU Gazetteer: Argyre Planitia (planitia)', url: gaz(371), value: '−49.8406°, 316.6902° E' },
  },
  {
    id: 'utopia-planitia',
    name: 'Utopia Planitia',
    category: 'Plain',
    kind: 'feature-centre',
    latitude: 46.74,
    longitudeEast360: 117.52,
    extent: box(12.9159, 73.1699, 71.8562, 164.8869),
    sizeKm: 3560.4,
    source: { name: 'IAU Gazetteer: Utopia Planitia (planitia)', url: gaz(6260), value: '46.7363°, 117.5168° E' },
  },
  {
    id: 'arcadia-planitia',
    name: 'Arcadia Planitia',
    category: 'Plain',
    kind: 'feature-centre',
    latitude: 49.02,
    longitudeEast360: 188.15,
    extent: box(33.879, 64.1961, 165.782, 210.392),
    sizeKm: 2245,
    source: { name: 'IAU Gazetteer: Arcadia Planitia (planitia)', url: gaz(348), value: '49.02°, 188.15° E' },
  },
  {
    id: 'amazonis-planitia',
    name: 'Amazonis Planitia',
    category: 'Plain',
    kind: 'feature-centre',
    latitude: 25.75,
    longitudeEast360: 197.09,
    extent: box(2.1393, 49.7464, 180.3433, 219.4244),
    sizeKm: 2809,
    source: { name: 'IAU Gazetteer: Amazonis Planitia (planitia)', url: gaz(220), value: '25.7461°, 197.0872° E' },
  },
  {
    id: 'acidalia-planitia',
    name: 'Acidalia Planitia',
    category: 'Plain',
    kind: 'feature-centre',
    latitude: 49.76,
    longitudeEast360: 339.26,
    extent: box(14.7609, 68.6724, -55.5532, 16.145),
    sizeKm: 3505,
    source: { name: 'IAU Gazetteer: Acidalia Planitia (planitia)', url: gaz(38), value: '49.76°, 339.26° E' },
  },
  {
    id: 'elysium-mons',
    name: 'Elysium Mons',
    category: 'Volcano',
    kind: 'feature-centre',
    latitude: 25.02,
    longitudeEast360: 147.21,
    extent: box(21.777, 28.2642, 143.5877, 150.8212),
    sizeKm: 401,
    source: { name: 'IAU Gazetteer: Elysium Mons (mons)', url: gaz(1783), value: '25.0232°, 147.2138° E' },
  },
  {
    id: 'arsia-mons',
    name: 'Arsia Mons',
    category: 'Volcano',
    kind: 'feature-centre',
    latitude: -8.26,
    longitudeEast360: 239.91,
    extent: box(-11.5708, -4.7209, 236.2746, 243.8151),
    sizeKm: 470,
    source: { name: 'IAU Gazetteer: Arsia Mons (mons)', url: gaz(394), value: '−8.2571°, 239.9075° E' },
  },
  {
    id: 'pavonis-mons',
    name: 'Pavonis Mons',
    category: 'Volcano',
    kind: 'feature-centre',
    latitude: 1.48,
    longitudeEast360: 247.04,
    extent: box(-1.9274, 4.2127, 243.9456, 250.1298),
    sizeKm: 366.5,
    source: { name: 'IAU Gazetteer: Pavonis Mons (mons)', url: gaz(4620), value: '1.4801°, 247.0376° E' },
  },
  {
    id: 'mawrth-vallis',
    name: 'Mawrth Vallis',
    category: 'Valley',
    kind: 'feature-centre',
    latitude: 22.43,
    longitudeEast360: 343.03,
    extent: box(18.7784, 26.1243, 340.2084, 346.6304),
    sizeKm: 634.6,
    source: { name: 'IAU Gazetteer: Mawrth Vallis (vallis)', url: gaz(3763), value: '22.4304°, 343.0274° E' },
  },
  {
    id: 'noctis-labyrinthus',
    name: 'Noctis Labyrinthus',
    category: 'Canyon network',
    kind: 'feature-centre',
    latitude: -6.36,
    longitudeEast360: 258.81,
    extent: box(-13.624, -2.7933, 248.4164, 268.694),
    sizeKm: 1190.3,
    source: { name: 'IAU Gazetteer: Noctis Labyrinthus (labyrinthus)', url: gaz(4324), value: '−6.3625°, 258.8111° E' },
  },
];

export const DEFAULT_LOCATION_ID = 'perseverance-landing';

/** The location in the shared map convention (planetocentric, east-positive −180…180°). */
export function locationCoordinate(loc: MarsLocation): MarsCoordinate {
  return fromEast360(loc.latitude, loc.longitudeEast360);
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Matches for a search: names starting with the query first, then names containing a
 * word that starts with it, then category matches. An empty query lists everything.
 */
export function searchLocations(query: string, list: MarsLocation[] = MARS_LOCATIONS): MarsLocation[] {
  const q = fold(query);
  if (!q) return list;
  const score = (loc: MarsLocation): number => {
    const name = fold(loc.name);
    if (name.startsWith(q)) return 0;
    if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) return 1;
    if (name.includes(q)) return 2;
    if (fold(loc.category).includes(q)) return 3;
    return -1;
  };
  return list
    .map((loc) => [loc, score(loc)] as const)
    .filter(([, s]) => s >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([loc]) => loc);
}

/** "18.4446° N, 77.4509° E" with the supplied precision; west longitude added past 180° E. */
export function formatLocation(loc: MarsLocation): { latitude: string; longitude: string; west?: string } {
  const digits = (v: number) => (String(v).split('.')[1] ?? '').length;
  const ld = Math.max(2, digits(loc.latitude));
  const od = Math.max(2, digits(loc.longitudeEast360));
  const lat = `${Math.abs(loc.latitude).toFixed(ld)}° ${loc.latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${loc.longitudeEast360.toFixed(od)}° E`;
  const west = loc.longitudeEast360 > 180 ? `${(360 - loc.longitudeEast360).toFixed(od)}° W` : undefined;
  return { latitude: lat, longitude: lon, west };
}
