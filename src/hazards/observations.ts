import { fromEast360, type HazardCode, type MarsCoordinate } from '../shared';
import { CATALOGUE, type CatalogueRow } from './data/catalogue';
import SOURCES from './data/sources.json';

/**
 * The 60 observation records (H001–H060): catalogue values as supplied, plus what each
 * NASA source page states, read by scripts/fetch-hazard-sources.mjs. A field the page does
 * not state stays null and is shown as unavailable; nothing is inferred.
 */

interface SourcePage {
  url: string;
  retrievedDate: string;
  httpStatus: number | null;
  pageTitle?: string | null;
  imageId?: string | null;
  credit?: string | null;
  publishedDate?: string | null;
  target?: string | null;
  missions?: string | null;
  spacecraft?: string | null;
  instruments?: string | null;
  resolutionText?: string | null;
  acquiredDateText?: string | null;
  acquiredDate?: string | null;
  orbit?: string | null;
  statedCentreText?: string | null;
  summary?: string | null;
  imageUrl?: string | null;
}

/** A value and where it came from. */
export interface Sourced<T> {
  value: T | null;
  /** 'catalogue' = the supplied table; 'source-page' = read from the NASA page on retrievedDate. */
  from: 'catalogue' | 'source-page' | null;
}

export interface HazardObservationRecord {
  id: string;
  name: string;
  categories: HazardCode[];
  observedFeature: string;
  observationCentre: MarsCoordinate;
  /** As supplied, to keep the stated precision */
  centreText: { latitude: string; longitude: string };
  coordinateConvention: string;
  /** Always null: no hazard boundary is mapped for any catalogue record. */
  geometry: null;
  geometryRole: 'none';
  mappingStatus: 'observation-centre-only';
  currentCondition: 'unknown';
  timeValidity: string;
  sourceUrl: string;
  retrievedDate: string;
  sourceReachable: boolean;
  imageId: Sourced<string>;
  credit: Sourced<string>;
  mission: Sourced<string>;
  spacecraft: Sourced<string>;
  instrument: Sourced<string>;
  /** When the image was acquired, as stated */
  observationDate: Sourced<string>;
  /** When NASA published the page / image */
  publicationDate: Sourced<string>;
  sourceResolution: Sourced<string>;
  statedCentre: Sourced<string>;
  sourceSummary: Sourced<string>;
  imageUrl: string | null;
  target: string | null;
  interpretation: string;
  confidence: null;
  assessmentStatus: 'not-assessed';
  measurements: [];
  limitations: string[];
  /** Problems found when checking the source page against the catalogue. */
  sourceIssues: string[];
}

const pages = SOURCES as Record<string, SourcePage>;

/** "8.6° S" → −8.6; "315.7° E" → 315.7 */
function parseCatalogueAngle(text: string): number {
  const m = text.match(/^([\d.]+)°\s*([NSEW])$/);
  if (!m) throw new Error(`catalogue angle: ${text}`);
  const v = Number(m[1]);
  return m[2] === 'S' || m[2] === 'W' ? -v : v;
}

const page = <T,>(v: T | null | undefined): Sourced<T> => (v == null || v === '' ? { value: null, from: null } : { value: v, from: 'source-page' });

function build(row: CatalogueRow): HazardObservationRecord {
  const p = pages[row.id];
  if (!p) throw new Error(`no source record for ${row.id}`);
  const lat = parseCatalogueAngle(row.latText);
  const lon = parseCatalogueAngle(row.lonText);

  const issues: string[] = [];
  if (p.target && !/^Mars/.test(p.target)) {
    issues.push(
      `The linked page describes ${p.target}${p.missions ? ` (${p.missions})` : ''}, not Mars. This record's source does not support its Mars coordinate; treat the record as unverified until a matching Mars source is supplied.`,
    );
  }
  if (p.httpStatus !== 200) issues.push(`The source page could not be read (HTTP ${p.httpStatus ?? 'error'}) on ${p.retrievedDate}.`);

  // Dates stated in the supplied table are used when the page itself does not state one
  const tableDate = row.feature.match(/(\d{1,2} [A-Z][a-z]+ \d{4})$/);
  const observationDate: Sourced<string> = p.acquiredDate
    ? { value: p.acquiredDate, from: 'source-page' }
    : tableDate
      ? { value: tableDate[1], from: 'catalogue' }
      : { value: null, from: null };

  return {
    id: row.id,
    name: row.place,
    categories: row.categories,
    observedFeature: row.feature,
    observationCentre: fromEast360(lat, lon),
    centreText: { latitude: row.latText, longitude: row.lonText },
    coordinateConvention:
      'Planetocentric latitude, east longitude 0–360° as supplied (image or observation centre). Not re-measured against the image.',
    geometry: null,
    geometryRole: 'none',
    mappingStatus: 'observation-centre-only',
    currentCondition: 'unknown',
    timeValidity: observationDate.value
      ? `Observed ${observationDate.value}. Describes conditions at that time only; the current state is unknown.`
      : 'Observation date not stated on the source page. The current state is unknown.',
    sourceUrl: row.url,
    retrievedDate: p.retrievedDate,
    sourceReachable: p.httpStatus === 200,
    imageId: page(p.imageId),
    credit: page(p.credit),
    mission: page(p.missions),
    spacecraft: page(p.spacecraft),
    instrument: page(p.instruments),
    observationDate,
    publicationDate: page(p.publishedDate),
    sourceResolution: page(p.resolutionText),
    statedCentre: page(p.statedCentreText),
    sourceSummary: page(p.summary),
    imageUrl: p.imageUrl ?? null,
    target: p.target ?? null,
    interpretation: `${row.feature}, as described by the NASA source. No hazard boundary has been mapped from this image here.`,
    confidence: null,
    assessmentStatus: 'not-assessed',
    measurements: [],
    limitations: [
      'The coordinate is the centre of a NASA image or observation, not a hazard boundary, vertex or incident point.',
      'The source image is contextual imagery; it is not orthorectified or aligned to this map here.',
      'Measurement precision is not a guarantee of positional accuracy.',
    ],
    sourceIssues: issues,
  };
}

export const OBSERVATIONS: HazardObservationRecord[] = CATALOGUE.map(build);
export const OBSERVATION_BY_ID = Object.fromEntries(OBSERVATIONS.map((o) => [o.id, o])) as Record<string, HazardObservationRecord>;

export function searchObservations(query: string): HazardObservationRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return OBSERVATIONS;
  return OBSERVATIONS.filter(
    (o) => o.id.toLowerCase().includes(q) || o.name.toLowerCase().includes(q) || o.observedFeature.toLowerCase().includes(q),
  );
}
