import {
  fromEast360,
  fromPlanetographicLatitude,
  fromWestPositive,
  makeCoordinate,
  type MarsCoordinate,
} from '../shared';

/**
 * Manual coordinate entry. Visitors type coordinates as published in their source, and
 * say which convention it uses; conversion goes through src/shared/coordinates.ts.
 *
 *   Longitude:  east −180…180 (Mars Trek), east 0…360 (MOLA, IAU Gazetteer) or
 *               west-positive 0…360 (older USGS/IAU maps).
 *   Latitude:   planetocentric (the default; MOLA, Trek, Gazetteer) or planetographic.
 *
 * A trailing N/S or E/W letter is accepted and overrides the sign: "18.44 N", "77.45E",
 * "133.8 W". A west letter with an east convention is converted (east = −west).
 */

export type LongitudeConvention = 'east-180' | 'east-360' | 'west-360';
export type LatitudeSystem = 'planetocentric' | 'planetographic';

export type ParseResult = { ok: true; coordinate: MarsCoordinate } | { ok: false; error: string };

function parseNumber(text: string, letters: string): { value: number; letter?: string } | null {
  const m = text
    .trim()
    .replace(/[°º]/g, '')
    .replace(/−/g, '-') // typographic minus
    .match(new RegExp(`^([+-]?\\d+(?:[.,]\\d+)?)\\s*([${letters}])?$`, 'i'));
  if (!m) return null;
  return { value: Number(m[1].replace(',', '.')), letter: m[2]?.toUpperCase() };
}

export function parseCoordinate(
  latText: string,
  lonText: string,
  lonConvention: LongitudeConvention,
  latSystem: LatitudeSystem = 'planetocentric'
): ParseResult {
  const lat = parseNumber(latText, 'NS');
  if (!lat) return { ok: false, error: 'Latitude must be a number of degrees, e.g. 18.4446 or 18.4446 N.' };
  let latitude = lat.letter === 'S' ? -Math.abs(lat.value) : lat.letter === 'N' ? Math.abs(lat.value) : lat.value;
  if (!(latitude >= -90 && latitude <= 90)) return { ok: false, error: 'Latitude must be between −90° and 90°.' };
  if (latSystem === 'planetographic') latitude = fromPlanetographicLatitude(latitude);

  const lon = parseNumber(lonText, 'EW');
  if (!lon) return { ok: false, error: 'Longitude must be a number of degrees, e.g. 77.4509 or 77.4509 E.' };
  let coordinate: MarsCoordinate;
  if (lon.letter === 'W' && lonConvention !== 'west-360') {
    coordinate = fromWestPositive(latitude, Math.abs(lon.value));
  } else if (lon.letter === 'E' && lonConvention === 'west-360') {
    coordinate = makeCoordinate(latitude, Math.abs(lon.value));
  } else if (lonConvention === 'east-180') {
    if (!(lon.value >= -180 && lon.value <= 180)) return { ok: false, error: 'East longitude (−180…180) must be between −180° and 180°.' };
    coordinate = makeCoordinate(latitude, lon.value);
  } else if (lonConvention === 'east-360') {
    if (!(lon.value >= 0 && lon.value <= 360)) return { ok: false, error: 'East longitude (0…360) must be between 0° and 360°.' };
    coordinate = fromEast360(latitude, lon.value);
  } else {
    if (!(lon.value >= 0 && lon.value <= 360)) return { ok: false, error: 'West longitude (0…360) must be between 0° and 360°.' };
    coordinate = fromWestPositive(latitude, lon.value);
  }
  return { ok: true, coordinate };
}

/** The same point in the common conventions, for display. */
export function describeCoordinate(c: MarsCoordinate): { lat: string; east180: string; east360: string; west360: string } {
  const e360 = ((c.longitudeEast % 360) + 360) % 360;
  const w360 = (360 - e360) % 360;
  return {
    lat: `${Math.abs(c.latitude).toFixed(4)}° ${c.latitude >= 0 ? 'N' : 'S'}`,
    east180: `${c.longitudeEast.toFixed(4).replace('-', '−')}° E`,
    east360: `${e360.toFixed(4)}° E`,
    west360: `${w360.toFixed(4)}° W`,
  };
}
