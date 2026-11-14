import { fromEast360, type MarsCoordinate } from '../../shared';

/**
 * Curvature investigation sites: places whose landforms suit a terrain-curvature study.
 * They are reference anchors only. No curvature has been calculated for them, and a marker
 * says nothing about the shape, extent or safety of the terrain around it.
 *
 * Coordinates are as supplied (planetocentric latitude, east longitude 0…360°), kept as
 * text so their stated precision survives; numbers are parsed from that text. Checked on
 * 2026-11-14 against the IAU Gazetteer and the sources cited per site.
 */

export interface CurvatureSite {
  id: string;
  name: string;
  /** As supplied, e.g. "-14.305" */
  latText: string;
  /** As supplied, east longitude 0…360°, e.g. "303.662" */
  lonEastText: string;
  /** The supplied position is approximate (a regional or image-area reference) */
  approximate: boolean;
  /** What the point is */
  reference: string;
  landform: string;
  shapes: string;
  context: string;
  /** Published figures, quoted from the source with its own reference surfaces */
  published?: { text: string; source: string; url: string };
  /** Numerical terrain data available for this site in Beyond Terra */
  terrainData: string;
  imagery: string;
  source: { name: string; url: string };
  /** Analysis status, shown as is */
  status: string;
}

const gaz = (id: number) => `https://planetarynames.wr.usgs.gov/Feature/${id}`;
const MOLA_ONLY = 'MOLA MEGDR elevation, 3.7 km bins (global). No local elevation model is loaded here.';
const NOT_CALCULATED = 'Candidate location — curvature not yet calculated.';
const IMAGERY_GLOBAL = 'Viking colour mosaic and global CTX mosaic (5 m/px) on this map.';

export const CURVATURE_SITES: CurvatureSite[] = [
  {
    id: 'jezero',
    name: 'Jezero Crater',
    latText: '18.41',
    lonEastText: '77.69',
    approximate: false,
    reference: 'Crater centre (IAU Gazetteer: 18.4082°, 77.6873° E)',
    landform: 'Impact crater',
    shapes: 'Crater walls, rim transitions and floor depressions',
    context:
      'An impact crater that once contained a lake. Its ancient delta preserves sediments deposited by flowing water.',
    terrainData:
      'USGS Jezero CTX DTM, 20 m posts, covering the western crater (18.21–18.72° N, 77.16–77.70° E), plus the MOLA MEGDR (3.7 km).',
    imagery: 'CTX mosaic and HiRISE mosaic (25 cm/px) of Jezero on this map.',
    source: { name: 'IAU Gazetteer: Jezero', url: gaz(14300) },
    status: `${NOT_CALCULATED} A 20 m elevation model covers the western crater, so a calculation is possible here.`,
  },
  {
    id: 'gale',
    name: 'Gale Crater',
    latText: '-5.44',
    lonEastText: '137.70',
    approximate: false,
    reference: 'Point inside the crater, 7.8 km from the IAU centre (−5.3672°, 137.8110° E)',
    landform: 'Impact crater',
    shapes: 'Crater walls and transitions toward the floor',
    context:
      'An impact crater containing Mount Sharp. Its floor, rim and central mountain are different terrain features with different local shapes.',
    terrainData: MOLA_ONLY,
    imagery: IMAGERY_GLOBAL,
    source: { name: 'IAU Gazetteer: Gale', url: gaz(2071) },
    status: NOT_CALCULATED,
  },
  {
    id: 'aeolis-mons',
    name: 'Mount Sharp / Aeolis Mons',
    latText: '-5.08',
    lonEastText: '137.85',
    approximate: false,
    reference: 'Mountain centre (IAU Gazetteer: −5.083°, 137.845° E)',
    landform: 'Layered mountain inside Gale',
    shapes: 'Mountain slopes, ridges and valleys',
    context:
      'A layered mountain inside Gale Crater. Curiosity’s observations reveal sedimentary rocks that help reconstruct ancient environmental changes.',
    terrainData: MOLA_ONLY,
    imagery: IMAGERY_GLOBAL,
    source: { name: 'IAU Gazetteer: Aeolis Mons', url: gaz(15000) },
    status: NOT_CALCULATED,
  },
  {
    id: 'olympus-mons',
    name: 'Olympus Mons',
    latText: '18.65',
    lonEastText: '226.20',
    approximate: false,
    reference: 'Volcano centre (IAU Gazetteer: 18.6528°, 226.1975° E)',
    landform: 'Shield volcano',
    shapes: 'Volcanic flanks and summit depressions',
    context: 'A huge shield volcano. Elevation and slope vary across its summit, flanks and surrounding relief.',
    terrainData: MOLA_ONLY,
    imagery: IMAGERY_GLOBAL,
    source: { name: 'IAU Gazetteer: Olympus Mons', url: gaz(4453) },
    status: NOT_CALCULATED,
  },
  {
    id: 'elysium-mons',
    name: 'Elysium Mons',
    latText: '25.02',
    lonEastText: '147.21',
    approximate: false,
    reference: 'Volcano centre (IAU Gazetteer: 25.0232°, 147.2138° E)',
    landform: 'Volcano',
    shapes: 'Volcanic slopes and slope transitions',
    context: 'A major Martian volcano, whose landforms can be compared with the surrounding terrain.',
    terrainData: MOLA_ONLY,
    imagery: IMAGERY_GLOBAL,
    source: { name: 'IAU Gazetteer: Elysium Mons', url: gaz(1783) },
    status: NOT_CALCULATED,
  },
  {
    id: 'valles-marineris',
    name: 'Valles Marineris',
    latText: '-14.01',
    lonEastText: '301.41',
    approximate: false,
    reference: 'Centre of the canyon system (IAU Gazetteer: −14.0059°, 301.4123° E)',
    landform: 'Canyon system',
    shapes: 'Canyon walls, troughs and ridges',
    context: 'An extensive canyon system containing deep troughs and steep walls.',
    published: {
      text: 'More than 4,000 km long, 200 km wide and, in some areas, more than 7 km deep (regional description, not a uniform depth).',
      source: 'NASA, Mariner 9 mission page',
      url: 'https://science.nasa.gov/mission/mariner-9/',
    },
    terrainData: MOLA_ONLY,
    imagery: IMAGERY_GLOBAL,
    source: { name: 'IAU Gazetteer: Valles Marineris', url: gaz(6288) },
    status: NOT_CALCULATED,
  },
  {
    id: 'coprates-observation',
    name: 'Coprates observation area',
    latText: '-14.305',
    lonEastText: '303.662',
    approximate: false,
    reference: 'Centre of HiRISE observation ESP_089134_1655 (acquired 1 August 2025), not a feature centre or a surveyed deepest point',
    landform: 'Deep canyon, within Coprates Chasma',
    shapes: 'Deep-canyon terrain within a HiRISE observation',
    context: 'Layered and fractured exposures in the deepest part of the Valles Marineris system.',
    published: {
      text: 'More than 7 km below the nearest rim and 11 km beneath the surrounding plateau (two different reference surfaces).',
      source: 'HiRISE, University of Arizona (NASA/JPL-Caltech/UArizona)',
      url: 'https://www.uahirise.org/ESP_089134_1655',
    },
    terrainData: MOLA_ONLY,
    imagery: `${IMAGERY_GLOBAL} The HiRISE observation itself (26.5 cm/px) is on its source page.`,
    source: { name: 'HiRISE ESP_089134_1655', url: 'https://www.uahirise.org/ESP_089134_1655' },
    status: NOT_CALCULATED,
  },
  {
    id: 'hebes-chasma',
    name: 'Hebes Chasma',
    latText: '-1.0',
    lonEastText: '282.0',
    approximate: true,
    reference: 'From ESA (“approximately 1° south and 282° east”); the IAU centre is −1.075°, 283.941° E',
    landform: 'Enclosed canyon depression',
    shapes: 'Enclosed depression and interior mound',
    context: 'An enclosed trough in the northern Valles Marineris, partly filled by a central mound of layered deposits.',
    published: {
      text: 'An 8 km deep, 126 × 314 km isolated basin with a central mound of interior layered deposits (regional figures; the floor and mound differ in depth).',
      source: 'Schmidt, Fueten, Stesky et al. 2018, J. Geophys. Res. Planets; ESA Mars Express',
      url: 'https://doi.org/10.1029/2018JE005658',
    },
    terrainData: MOLA_ONLY,
    imagery: IMAGERY_GLOBAL,
    source: { name: 'ESA: Hebes Chasma annotated nadir view', url: 'https://www.esa.int/ESA_Multimedia/Images/2008/03/Hebes_Chasma_annotated_nadir_view' },
    status: NOT_CALCULATED,
  },
  {
    id: 'korolev',
    name: 'Korolev Crater',
    latText: '73.0',
    lonEastText: '165.0',
    approximate: true,
    reference: 'From ESA (“centred at 165° E, 73° N”); the IAU centre is 72.768°, 164.584° E',
    landform: 'Impact crater with an ice deposit',
    shapes: 'Crater depression and domed ice surface',
    context: 'An 82 km wide crater whose floor holds a domed deposit of water ice, kept stable by the crater acting as a cold trap.',
    published: {
      text: 'Crater floor about 2 km below the rim; the ice deposit is about 1.8 km thick. These are separate quantities, not the depth from rim to ice.',
      source: 'ESA Mars Express (ESA/DLR/FU Berlin)',
      url: 'https://www.esa.int/ESA_Multimedia/Videos/2020/07/Flight_over_Korolev_Crater_on_Mars',
    },
    terrainData: MOLA_ONLY,
    imagery: IMAGERY_GLOBAL,
    source: { name: 'ESA: Perspective view of Korolev crater', url: 'https://www.esa.int/ESA_Multimedia/Images/2018/12/Perspective_view_of_Korolev_crater' },
    status: NOT_CALCULATED,
  },
  {
    id: 'moreux',
    name: 'Moreux Crater',
    latText: '42.0',
    lonEastText: '44.0',
    approximate: true,
    reference: 'Image-area position from ESA (“centred at about 44°E/42°N”); the IAU centre is 41.792°, 44.544° E',
    landform: 'Impact crater with a central peak',
    shapes: 'Crater walls, central peak and dunes',
    context: 'A 135 km crater with ridged walls, dark dunes on its floor and a central peak raised as the floor rebounded after impact.',
    published: {
      text: 'Crater about 3 km deep; central peak about 2 km high (separate quantities).',
      source: 'ESA Mars Express (ESA/DLR/FU Berlin)',
      url: 'https://www.esa.int/Science_Exploration/Space_Science/Mars_Express/The_dark_dunes_of_Mars_Moreux_crater',
    },
    terrainData: MOLA_ONLY,
    imagery: IMAGERY_GLOBAL,
    source: { name: 'ESA: The dark dunes of Moreux crater', url: 'https://www.esa.int/ESA_Multimedia/Images/2020/03/The_dark_dunes_of_Moreux_crater' },
    status: NOT_CALCULATED,
  },
];

/** The site in the shared map convention (planetocentric, east-positive −180…180°). */
export function siteCoordinate(s: CurvatureSite): MarsCoordinate {
  return fromEast360(Number(s.latText), Number(s.lonEastText));
}

/** "5.44° S, 137.70° E" with the supplied digits. */
export function formatSite(s: CurvatureSite): string {
  const lat = s.latText.replace(/^-/, '');
  const ns = s.latText.startsWith('-') ? 'S' : 'N';
  return `${lat}° ${ns}, ${s.lonEastText}° E`;
}

export function searchSites(query: string): CurvatureSite[] {
  const q = query.trim().toLowerCase();
  if (!q) return CURVATURE_SITES;
  return CURVATURE_SITES.filter((s) => s.name.toLowerCase().includes(q) || s.landform.toLowerCase().includes(q));
}
