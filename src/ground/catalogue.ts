import { greatCircleDistanceM, MARS_RADIUS_M, normalizeLongitudeEast, type MarsCoordinate } from '../shared';

/**
 * Ground Perspective catalogue: curated NASA rover photographs with verified metadata
 * (public/data/ground/catalogue.json, built by scripts/ground/build-ground.mjs from NASA's
 * raw-image records and rover localizations). Unknown values are null, never guessed.
 */

export interface CapturePosition extends MarsCoordinate {
  site: number | null;
  drive: number | null;
  localizedSol: number | null;
  /** How the position was found. */
  method: string;
  source: string;
}

export interface GroundImage {
  id: string;
  mission: string;
  rover: string;
  /** Mission region key (see regions). */
  region: string | null;
  camera: string;
  instrument: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  fullResolutionUrl: string | null;
  sol: number | null;
  earthDateUtc: string | null;
  localSolarTime: string | null;
  /** The rover's published position when the image was taken, or null when not known. */
  capture: CapturePosition | null;
  captureNote: string | null;
  coordinateConvention: string | null;
  /** Compass orientation of the view; null unless published with a stated convention. */
  orientation: number | null;
  description: string | null;
  sourceUrl: string;
  recordUrl: string | null;
  credit: string;
  metadataStatus: 'complete' | 'partial';
  missing: string[];
}

export interface MissionRegion extends MarsCoordinate {
  key: string;
  name: string;
  gazetteerId: number | null;
  diameterKm: number;
}

export interface GroundCatalogue {
  images: GroundImage[];
  regions: MissionRegion[];
  mastCameraHeightM: number;
  note: string;
  /** Records that failed validation, with the reason (not shown as photographs). */
  rejected: Array<{ id: string; reason: string }>;
}

/* ------------------------------------------------------------------ validation */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const https = (v: unknown): string | null => {
  const s = str(v);
  return s && /^https:\/\/\S+$/.test(s) ? s : null;
};
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const intOrNull = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);

/** A capture position, or null when absent or out of range. Longitude is normalised to −180…180°. */
export function parseCapture(v: unknown): CapturePosition | null {
  if (!isObj(v)) return null;
  const lat = finite(v.latitude);
  const lon = finite(v.longitudeEast);
  if (lat === null || lon === null || lat < -90 || lat > 90) return null;
  return {
    latitude: lat,
    longitudeEast: normalizeLongitudeEast(lon),
    site: intOrNull(v.site),
    drive: intOrNull(v.drive),
    localizedSol: intOrNull(v.localizedSol),
    method: str(v.method) ?? 'Not stated',
    source: https(v.source) ?? '',
  };
}

/** One record, or the reason it cannot be shown. Required: id, mission, rover, an https image, an https source and a credit. */
export function parseImage(v: unknown): { image: GroundImage } | { error: string; id: string } {
  if (!isObj(v)) return { error: 'not a record', id: '?' };
  const id = str(v.id);
  if (!id) return { error: 'no image ID', id: '?' };
  const imageUrl = https(v.imageUrl);
  if (!imageUrl) return { error: 'no https image URL', id };
  const sourceUrl = https(v.sourceUrl);
  if (!sourceUrl) return { error: 'no https NASA source link', id };
  const mission = str(v.mission);
  const rover = str(v.rover);
  if (!mission || !rover) return { error: 'mission or rover missing', id };
  const credit = str(v.credit);
  if (!credit) return { error: 'no image credit', id };
  const date = str(v.earthDateUtc);
  const capture = v.capture == null ? null : parseCapture(v.capture);
  if (v.capture != null && !capture) return { error: 'capture coordinates out of range', id };
  const missing: string[] = [];
  const sol = intOrNull(v.sol);
  const earthDateUtc = date && !Number.isNaN(Date.parse(date)) ? date : null;
  if (sol === null) missing.push('sol');
  if (!earthDateUtc) missing.push('Earth capture date');
  if (!capture) missing.push('capture coordinates');
  const thumbnailUrl = https(v.thumbnailUrl);
  if (!thumbnailUrl) missing.push('thumbnail');
  const orientation = finite(v.orientation);
  if (orientation === null) missing.push('image orientation');
  const description = str(v.description);
  if (!description) missing.push('description');
  return {
    image: {
      id,
      mission,
      rover,
      region: str(v.region),
      camera: str(v.camera) ?? 'Camera not stated',
      instrument: str(v.instrument),
      imageUrl,
      thumbnailUrl,
      fullResolutionUrl: https(v.fullResolutionUrl),
      sol,
      earthDateUtc,
      localSolarTime: str(v.localSolarTime),
      capture,
      captureNote: str(v.captureNote),
      coordinateConvention: capture ? str(v.coordinateConvention) : null,
      orientation,
      description,
      sourceUrl,
      recordUrl: https(v.recordUrl),
      credit,
      // Orientation is not published for these images; everything else present counts as complete
      metadataStatus: missing.every((m) => m === 'image orientation') ? 'complete' : 'partial',
      missing,
    },
  };
}

/** The catalogue file, keeping valid records and listing the rest. */
export function parseCatalogue(doc: unknown): GroundCatalogue {
  const d = isObj(doc) ? doc : {};
  const images: GroundImage[] = [];
  const rejected: GroundCatalogue['rejected'] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(d.images) ? d.images : []) {
    const r = parseImage(raw);
    if ('error' in r) rejected.push({ id: r.id, reason: r.error });
    else if (seen.has(r.image.id)) rejected.push({ id: r.image.id, reason: 'duplicate ID' });
    else {
      seen.add(r.image.id);
      images.push(r.image);
    }
  }
  const regions: MissionRegion[] = [];
  if (isObj(d.regions)) {
    for (const [key, r] of Object.entries(d.regions)) {
      if (!isObj(r)) continue;
      const lat = finite(r.latitude);
      const lon = finite(r.longitudeEast);
      const dia = finite(r.diameterKm);
      if (lat === null || lon === null || dia === null || dia <= 0) continue;
      regions.push({ key, name: str(r.name) ?? key, gazetteerId: finite(r.gazetteerId), latitude: lat, longitudeEast: normalizeLongitudeEast(lon), diameterKm: dia });
    }
  }
  const h = finite(d.mastCameraHeightM);
  return { images, regions, mastCameraHeightM: h !== null && h > 0 ? h : 2, note: str(d.note) ?? '', rejected };
}

/* -------------------------------------------------------------------- matching */

/**
 * Distance to the horizon from a camera h metres above a smooth sphere: √(2Rh + h²). From
 * the ~2 m mast this is about 3.7 km on Mars: farther ground is below the horizon on level
 * terrain, so only a capture point this close can have the selected point in view. (Relief
 * can extend or block the view; the label says "may be in view", never "is shown".)
 */
export function horizonDistanceKm(heightM: number, radiusM = MARS_RADIUS_M): number {
  return Math.sqrt(2 * radiusM * heightM + heightM * heightM) / 1000;
}

/**
 * A rover's mission region: everything within one crater diameter of the crater's centre,
 * i.e. the crater and its rim out to about one crater radius beyond the rim, the typical
 * extent of a crater's continuous ejecta. Diameters and centres: IAU/USGS Gazetteer.
 */
export const regionRadiusKm = (r: MissionRegion) => r.diameterKm;

export type MatchKind = 'nearby' | 'regional' | 'mission-area';

export interface ImageMatch {
  image: GroundImage;
  kind: MatchKind;
  /** Great-circle distance from the selected point to the capture point; null without capture coordinates. */
  distanceKm: number | null;
  region: MissionRegion | null;
}

export interface MatchResult {
  matches: ImageMatch[];
  horizonKm: number;
  /** Mission regions the selected point lies in. */
  regions: MissionRegion[];
  /** The closest located image overall, even when it is not a match (for the no-data message). */
  nearestKm: number | null;
  nearestImage: GroundImage | null;
}

const KIND_ORDER: Record<MatchKind, number> = { nearby: 0, regional: 1, 'mission-area': 2 };

export const distanceKm = (a: MarsCoordinate, b: MarsCoordinate) => greatCircleDistanceM(a, b) / 1000;

/**
 * Photographs relevant to a point, closest first:
 * - nearby: captured within the horizon distance (the point may be in view);
 * - regional: farther, but the point and the capture lie in the same mission region;
 * - mission-area: no capture coordinates, and the point lies in that rover's region (no distance).
 * Anything else is left out; a distant photograph is never offered as this place.
 */
export function matchImages(cat: GroundCatalogue, at: MarsCoordinate): MatchResult {
  const point = { latitude: at.latitude, longitudeEast: normalizeLongitudeEast(at.longitudeEast) };
  const horizonKm = horizonDistanceKm(cat.mastCameraHeightM);
  const regionByKey = new Map(cat.regions.map((r) => [r.key, r]));
  const inRegion = (r: MissionRegion | null | undefined, c: MarsCoordinate) => !!r && distanceKm(r, c) <= regionRadiusKm(r);
  const matches: ImageMatch[] = [];
  let nearestKm: number | null = null;
  let nearestImage: GroundImage | null = null;
  for (const image of cat.images) {
    const region = image.region ? (regionByKey.get(image.region) ?? null) : null;
    if (image.capture) {
      const d = distanceKm(point, image.capture);
      if (nearestKm === null || d < nearestKm) {
        nearestKm = d;
        nearestImage = image;
      }
      if (d <= horizonKm) matches.push({ image, kind: 'nearby', distanceKm: d, region });
      else if (inRegion(region, point) && inRegion(region, image.capture)) matches.push({ image, kind: 'regional', distanceKm: d, region });
    } else if (inRegion(region, point)) {
      matches.push({ image, kind: 'mission-area', distanceKm: null, region });
    }
  }
  matches.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
      (b.image.sol ?? -1) - (a.image.sol ?? -1) ||
      a.image.id.localeCompare(b.image.id),
  );
  return { matches, horizonKm, regions: cat.regions.filter((r) => inRegion(r, point)), nearestKm, nearestImage };
}

/** Image URLs to try, best first: the display image, then the thumbnail as a lower-resolution fallback. */
export function imageCandidates(image: GroundImage): string[] {
  return [image.imageUrl, image.thumbnailUrl].filter((u, i, a): u is string => !!u && a.indexOf(u) === i);
}

/* --------------------------------------------------------------------- loading */

let cataloguePromise: Promise<GroundCatalogue> | null = null;

/** The catalogue, fetched once per session; a failed request can be retried. */
export function loadGroundCatalogue(): Promise<GroundCatalogue> {
  if (!cataloguePromise) {
    cataloguePromise = fetch(`${import.meta.env.BASE_URL}data/ground/catalogue.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if ((r.headers.get('content-type') ?? '').includes('text/html')) throw new Error('catalogue not found');
        return r.json();
      })
      .then(parseCatalogue);
    cataloguePromise.catch(() => (cataloguePromise = null));
  }
  return cataloguePromise;
}
