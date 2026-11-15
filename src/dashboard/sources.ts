import { DATASET_LINKS } from '../scientific-data/terrain';

/**
 * Source registry: every dataset or reference the Mars Dashboard uses or was assessed
 * against. `integrated` is true only when the dashboard actually computes or reads values
 * from it in this build. A URL here is a reference, not a claim of a working API.
 */
export interface SourceEntry {
  id: string;
  name: string;
  provider: string;
  url: string;
  productType: string;
  coverage: string;
  temporal: string;
  resolution: string;
  units: string;
  access: string;
  attribution: string;
  integrated: boolean;
  limitations: string;
}

export const SOURCES: SourceEntry[] = [
  {
    id: 'mars24',
    name: 'Mars24 Sunclock algorithm (Allison & McEwen 2000)',
    provider: 'NASA Goddard Institute for Space Studies',
    url: 'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html',
    productType: 'Published algorithm (calculation)',
    coverage: 'All of Mars',
    temporal: 'Any date (leap-second table to 2017-01-01; none added since)',
    resolution: 'Point calculation',
    units: 'h, degrees, AU',
    access: 'Implemented in src/dashboard/science; validated against NASA’s two worked examples',
    attribution: 'NASA GISS Mars24',
    integrated: true,
    limitations: 'Flat-horizon geometry: no terrain obstruction, no refraction. Mars24 treats the input clock as UT.',
  },
  {
    id: 'mola-megdr',
    name: 'MOLA Mission Experiment Gridded Data Record (MEGDR), 16 px/deg',
    provider: 'NASA PDS Geosciences Node',
    url: DATASET_LINKS.megdr,
    productType: 'Numerical elevation grid',
    coverage: 'Global',
    temporal: '1997-09-15 to 2001-06-30 (MGS mapping)',
    resolution: '≈3.7 km bins at the equator',
    units: 'm above the MOLA areoid',
    access: 'Prepared tiles bundled under public/data/mola (read through the terrain module)',
    attribution: 'NASA / MGS MOLA Science Team',
    integrated: true,
    limitations: 'Median of laser shots per bin; ~5 % of bins interpolated; regional, not local, slope.',
  },
  {
    id: 'jezero-dtm',
    name: 'Jezero CTX stereo DTM (Mars 2020 TRN products), 20 m',
    provider: 'USGS Astrogeology',
    url: DATASET_LINKS.jezeroDtm,
    productType: 'Numerical elevation grid',
    coverage: 'Western Jezero crater only (~32 × 30 km)',
    temporal: 'CTX acquisitions (product release)',
    resolution: '20 m posts',
    units: 'm, tied to MOLA topography',
    access: 'Prepared tiles bundled under public/data/jezero-ctx-dtm',
    attribution: 'USGS Astrogeology / NASA MRO CTX',
    integrated: true,
    limitations: 'Features smaller than ~60 m smoothed; outside the footprint the regional MOLA value is used.',
  },
  {
    id: 'usgs-geology',
    name: 'Geologic Map of Mars (SIM 3292)',
    provider: 'USGS Astrogeology (Tanaka et al., 2014)',
    url: DATASET_LINKS.geology,
    productType: 'Mapped geologic units',
    coverage: 'Global',
    temporal: 'Published 2014',
    resolution: '1:20,000,000 (looked up on a 32 px/deg raster)',
    units: 'Unit code and description',
    access: 'Prepared raster bundled under public/data/geology',
    attribution: 'USGS',
    integrated: true,
    limitations: 'Units describe age and geologic setting, not composition; contacts uncertain by kilometres.',
  },
  {
    id: 'landmarks',
    name: 'BEYOND TERRA 46-landmark catalogue (USGS/IAU feature centres, Reference A)',
    provider: 'USGS/IAU Gazetteer of Planetary Nomenclature (coordinates)',
    url: 'https://planetarynames.wr.usgs.gov/SearchResults?Target=20_Mars',
    productType: 'Named features and science summaries',
    coverage: '46 features',
    temporal: 'Coordinates extracted 2026-11-15',
    resolution: 'Feature centres (not local targets)',
    units: 'Planetocentric latitude, east longitude 0–360°',
    access: 'src/shared/landmarks',
    attribution: 'USGS/IAU; science text from the project reference',
    integrated: true,
    limitations: 'A regional centre is not a landing or sampling site.',
  },
  {
    id: 'trek',
    name: 'NASA Mars Trek WMTS imagery',
    provider: 'NASA Solar System Treks',
    url: 'https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars',
    productType: 'Map imagery tiles',
    coverage: 'Global and regional mosaics',
    temporal: 'Per product',
    resolution: 'Per product',
    units: 'Imagery (no physical units)',
    access: 'WMTS tiles on the Mission Planner map',
    attribution: 'NASA/JPL-Caltech',
    integrated: true,
    limitations: 'Rendered tiles are pictures: no elevation or temperature is read from their colours.',
  },
  {
    id: 'meda',
    name: 'Perseverance MEDA (Mars Environmental Dynamics Analyzer) archive',
    provider: 'NASA PDS Atmospheres Node',
    url: 'https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html',
    productType: 'Calibrated/derived in-situ measurements (CSV): air and ground temperature, pressure, wind, humidity, radiation/dust',
    coverage: 'Jezero crater only (rover location)',
    temporal: '2021-02-19 (Ls 6.1, MY 36) onward',
    resolution: 'Point, per sensor',
    units: 'K, Pa, m/s, …',
    access: 'Index-based retrieval and multi-GB annual archives; no API',
    attribution: 'Rodriguez-Manfredi et al. (2021), doi:10.17189/1522849',
    integrated: false,
    limitations:
      'Not integrated: needs an offline, quality-filtered extract. Applies only to the rover’s location and time; never to other places.',
  },
  {
    id: 'mcd',
    name: 'Mars Climate Database (LMD)',
    provider: 'Laboratoire de Météorologie Dynamique / ESA / CNES',
    url: 'https://www-mars.lmd.jussieu.fr/',
    productType: 'Climate model output (modelled, not observed)',
    coverage: 'Global',
    temporal: 'Climatology scenarios',
    resolution: 'Model grid',
    units: 'K, Pa, m/s, …',
    access: 'Not assessed as a browser API here',
    attribution: 'LMD MCD team',
    integrated: false,
    limitations: 'Not integrated. If added, values must be labelled Modelled with scenario and time coverage.',
  },
  {
    id: 'hirise',
    name: 'HiRISE imagery and digital terrain models',
    provider: 'University of Arizona / NASA',
    url: 'https://www.uahirise.org/dtm/',
    productType: 'Imagery and local DTMs',
    coverage: 'Small footprints',
    temporal: 'Per observation',
    resolution: '0.25–1 m/px (DTM ~1 m)',
    units: 'm',
    access: 'Product downloads',
    attribution: 'NASA/JPL/University of Arizona',
    integrated: false,
    limitations: 'Not integrated in this build.',
  },
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
