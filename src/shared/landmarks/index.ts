import { createStore, useStore } from '../store';
import type { MarsCoordinate } from '../types';
import { LANDMARK_RECORDS } from './catalogue.data';
import type { Landmark, LandmarkSource, LandmarkSourceRecord } from './types';

export type { Landmark, LandmarkSource, LandmarkSourceRecord } from './types';

/**
 * The 46 scientific landmarks (Reference A, "BEYOND TERRA 6"), shared by every module.
 *
 * Coordinates: USGS/IAU Gazetteer feature centres, planetocentric latitude, east longitude
 * 0–360, from the linked feature pages. Where the Gazetteer lists several control networks,
 * the reference uses the centre of the detailed feature outline (checked for Holden,
 * Medusae Fossae and Planum Boreum). Centres are for finding features, not navigation
 * targets, landing sites or sampling sites.
 */
export const COORDINATE_CONVENTION =
  'USGS/IAU Gazetteer feature centre · planetocentric latitude · east longitude 0–360°';

/** IAU descriptor terms, with the Gazetteer's meaning, matched in the feature name. */
const DESCRIPTORS: Array<[RegExp, string]> = [
  [/\bMons\b/, 'Mons · mountain'],
  [/\bCrater\b/, 'Crater · impact crater'],
  [/\bPlanitia\b/, 'Planitia · low plain'],
  [/\bPlanum\b/, 'Planum · plateau or high plain'],
  [/\bValles\b|\bVallis\b/, 'Vallis · valley'],
  [/\bFossae\b/, 'Fossae · long, narrow depressions'],
  [/\bLabyrinthus\b/, 'Labyrinthus · complex of intersecting valleys'],
  [/\bMensae?\b/, 'Mensa · flat-topped prominence with cliff-like edges'],
  [/\bColles\b/, 'Colles · small hills or knobs'],
  [/\bUndae\b/, 'Undae · dunes'],
];

function category(r: LandmarkSourceRecord): string {
  // The Medusae entry discusses the broader formation, anchored on the named fossae
  if (r.id === 'medusae-fossae-formation') return 'Formation · anchored on Medusae Fossae (fossae)';
  if (r.id === 'eridania-planitia') return 'Planitia · low plain (regional reference)';
  return DESCRIPTORS.find(([re]) => re.test(r.name))?.[1] ?? 'Named feature';
}

const S = {
  trek: { label: 'NASA Mars Trek', url: 'https://trek.nasa.gov/mars/', publisher: 'NASA' },
  geology: { label: 'USGS geologic map of Mars (SIM 3292)', url: 'https://pubs.usgs.gov/sim/3292/', publisher: 'USGS' },
  jezeroMap: { label: 'USGS geologic map of Jezero crater and Nili Planum (SIM 3464)', url: 'https://pubs.usgs.gov/publication/sim3464', publisher: 'USGS' },
  jezeroTerrain: {
    label: 'How we land on Mars: Jezero local terrain',
    url: 'https://science.nasa.gov/planetary-science/programs/mars-exploration/mission-timeline/how-we-land-on-mars/',
    publisher: 'NASA',
  },
  tharsis: { label: 'Tharsis volcanoes', url: 'https://science.nasa.gov/resource/tharsis-volcano/', publisher: 'NASA' },
  opportunity: { label: 'Opportunity rover mission', url: 'https://science.nasa.gov/mission/mer-opportunity/', publisher: 'NASA' },
  nili: { label: 'Mineral spectra from Nili Fossae', url: 'https://science.nasa.gov/photojournal/mineral-spectra-from-nili-fossae-mars/', publisher: 'NASA' },
  gusev: { label: 'Silica-rich soil in Gusev Crater', url: 'https://science.nasa.gov/photojournal/silica-rich-soil-in-gusev-crater/', publisher: 'NASA' },
  deuteronilus: { label: 'Textures of Deuteronilus Mensae', url: 'https://www.nasa.gov/image-article/textures-deuteronilus-mensae/', publisher: 'NASA' },
  medusae: {
    label: 'Buried water ice at Mars’s equator (Mars Express)',
    url: 'https://www.esa.int/Science_Exploration/Space_Science/Mars_Express/Buried_water_ice_at_Mars_s_equator',
    publisher: 'ESA',
  },
  eberswalde: { label: 'Eberswalde delta in high resolution', url: 'https://science.nasa.gov/resource/eberswalde-delta-in-high-resolution/', publisher: 'NASA' },
  huygens: { label: 'Nature’s drilling exposes deeply buried minerals', url: 'https://science.nasa.gov/resource/natures-drilling-exposes-deeply-buried-minerals/', publisher: 'NASA' },
  victoria: { label: 'Details of layers in Victoria Crater’s Cape St. Vincent', url: 'https://science.nasa.gov/photojournal/details-of-layers-in-victoria-craters-cape-st-vincent/', publisher: 'NASA' },
  insight: { label: 'InSight science highlights', url: 'https://science.nasa.gov/mission/insight/science-highlights/', publisher: 'NASA' },
  korolev: { label: 'Flight over Korolev Crater (Mars Express)', url: 'https://www.esa.int/ESA_Multimedia/Videos/2020/07/Flight_over_Korolev_Crater_on_Mars', publisher: 'ESA' },
  louth: { label: 'HiRISE digital terrain model search (for Louth)', url: 'https://www.uahirise.org/hiwish/maps/dtms.jsp', publisher: 'University of Arizona / NASA' },
  mangala: { label: 'Episodes of floods in Mangala Valles (HRSC, MOC and THEMIS)', url: 'https://www.usgs.gov/publications/episodes-floods-mangala-valles-mars-analysis-hrsc-moc-and-themis-images', publisher: 'USGS' },
} satisfies Record<string, LandmarkSource>;

/** The reference's source register, by landmark. Landmarks it does not list get none. */
const CLAIM_SOURCES: Record<string, LandmarkSource[]> = {
  'jezero-crater': [S.jezeroMap, S.jezeroTerrain],
  'nili-planum': [S.jezeroMap],
  'olympus-mons': [S.tharsis],
  'arsia-mons': [S.tharsis],
  'pavonis-mons': [S.tharsis],
  'ascraeus-mons': [S.tharsis],
  'meridiani-planum': [S.opportunity],
  'victoria-crater': [S.victoria, S.opportunity],
  'endeavour-crater': [S.opportunity],
  'nili-fossae': [S.nili],
  'gusev-crater': [S.gusev],
  'deuteronilus-mensae': [S.deuteronilus],
  'medusae-fossae-formation': [S.medusae],
  'eberswalde-crater': [S.eberswalde],
  'huygens-crater': [S.huygens],
  'elysium-planitia': [S.insight],
  'korolev-crater': [S.korolev],
  'louth-crater': [S.louth],
  'mangala-valles': [S.mangala],
};

/** Sources that apply to every card: the map and the global geology. */
export const GENERAL_SOURCES: LandmarkSource[] = [S.trek, S.geology];

export const LANDMARKS: Landmark[] = LANDMARK_RECORDS.map((r) => ({
  ...r,
  category: category(r),
  aliases: [],
  claimSources: CLAIM_SOURCES[r.id] ?? [],
}));

export function landmarkById(id: string | null | undefined): Landmark | undefined {
  return id ? LANDMARKS.find((l) => l.id === id) : undefined;
}

/** The map's convention: east longitude −180…180. */
export function landmarkCoordinate(l: Landmark): MarsCoordinate {
  // Rounded back to the stored precision, so 226.20° E becomes exactly −133.8 (not −133.79999…)
  const lon = l.longitudeEast360 > 180 ? Number((l.longitudeEast360 - 360).toFixed(10)) : l.longitudeEast360;
  return { latitude: l.latitude, longitudeEast: lon };
}

/** "18.65° N, 226.20° E", keeping the reference's two decimals. */
export function formatLandmarkCoordinates(l: Landmark): string {
  const lat = `${Math.abs(l.latitude).toFixed(2)}° ${l.latitude >= 0 ? 'N' : 'S'}`;
  return `${lat}, ${l.longitudeEast360.toFixed(2)}° E`;
}

/** Name search, ignoring case and accents, also matching aliases. */
export function searchLandmarks(query: string): Landmark[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return LANDMARKS;
  return LANDMARKS.filter((l) => norm(l.name).includes(q) || l.aliases.some((a) => norm(a).includes(q)) || norm(l.category).includes(q));
}

/** The landmark the visitor selected, shared by the globe and the map. */
export const selectedLandmarkStore = createStore<string | null>(null);

export function useSelectedLandmark(): Landmark | undefined {
  return landmarkById(useStore(selectedLandmarkStore));
}

export { HAZARD_FRAMING, NO_CALCULATED_ALTERNATIVE, HAZARD_GROUP_SOURCES, type LandmarkHazardRecord } from './hazards.data';
import { HAZARD_GROUP_SOURCES as GROUPS, LANDMARK_HAZARDS } from './hazards.data';

/** The landmark's hazard concerns and proposed response, with the source cited for its group. */
export function landmarkHazards(l: Landmark) {
  const h = LANDMARK_HAZARDS.find((x) => x.n === l.n);
  return h ? { ...h, source: GROUPS[h.group] } : null;
}
