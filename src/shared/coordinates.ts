import type { MarsCoordinate } from './types';

/**
 * Mars coordinate conventions and conversions.
 *
 * Shared convention (used by every module and by the map):
 *   planetocentric latitude, east-positive longitude normalised to −180…180, degrees,
 *   on the IAU 2000 Mars sphere. This is the frame NASA Mars Trek's tiles use
 *   (IAU2000:49900), so a MarsCoordinate goes to and from the map unchanged.
 *
 * Other conventions you will meet in datasets, and how to convert:
 *   - East longitude 0…360 (MOLA, many PDS products):     fromEast360 / toEast360
 *   - West-positive longitude 0…360 (older USGS/IAU maps): fromWestPositive
 *   - Planetographic latitude (on the IAU 2000 ellipsoid): fromPlanetographicLatitude
 *   - The map's wrapped longitudes (beyond ±180 after panning round the planet):
 *     fromMapLatLng / toMapLatLng
 */

/** IAU 2000 Mars radii (m). The map and distances use the sphere; the ellipsoid is for latitude conversion. */
export const MARS_RADIUS_M = 3_396_190;
export const MARS_EQUATORIAL_RADIUS_M = 3_396_190;
export const MARS_POLAR_RADIUS_M = 3_376_200;

const DEG = Math.PI / 180;

/** Longitude in −180…180 (180 maps to −180). */
export function normalizeLongitudeEast(longitude: number): number {
  const l = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return Object.is(l, -0) ? 0 : l;
}

export function makeCoordinate(latitude: number, longitudeEast: number): MarsCoordinate {
  return { latitude, longitudeEast: normalizeLongitudeEast(longitudeEast) };
}

export function isValidCoordinate(c: MarsCoordinate): boolean {
  return (
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitudeEast) &&
    c.latitude >= -90 &&
    c.latitude <= 90 &&
    c.longitudeEast >= -180 &&
    c.longitudeEast < 180
  );
}

/** From east longitude 0…360. */
export function fromEast360(latitude: number, longitudeEast360: number): MarsCoordinate {
  return makeCoordinate(latitude, longitudeEast360);
}

/** To east longitude 0…360. */
export function toEast360(c: MarsCoordinate): number {
  return ((c.longitudeEast % 360) + 360) % 360;
}

/** From west-positive longitude (0…360 or −180…180): east = −west. */
export function fromWestPositive(latitude: number, longitudeWest: number): MarsCoordinate {
  return makeCoordinate(latitude, -longitudeWest);
}

/**
 * Planetographic → planetocentric latitude on the IAU 2000 ellipsoid:
 *   tan(φc) = (b / a)² · tan(φg)
 * The difference is up to about 0.34° at mid-latitudes, roughly 20 km on the ground.
 */
export function fromPlanetographicLatitude(planetographicLatitude: number): number {
  const ratio = (MARS_POLAR_RADIUS_M / MARS_EQUATORIAL_RADIUS_M) ** 2;
  if (Math.abs(planetographicLatitude) === 90) return planetographicLatitude;
  return Math.atan(ratio * Math.tan(planetographicLatitude * DEG)) / DEG;
}

/** Planetocentric → planetographic latitude (inverse of the above). */
export function toPlanetographicLatitude(planetocentricLatitude: number): number {
  const ratio = (MARS_POLAR_RADIUS_M / MARS_EQUATORIAL_RADIUS_M) ** 2;
  if (Math.abs(planetocentricLatitude) === 90) return planetocentricLatitude;
  return Math.atan(Math.tan(planetocentricLatitude * DEG) / ratio) / DEG;
}

/** From the map's lat/lng (longitude may be wrapped beyond ±180). */
export function fromMapLatLng(latLng: { lat: number; lng: number }): MarsCoordinate {
  return makeCoordinate(latLng.lat, latLng.lng);
}

/**
 * To the map's [lat, lng]. With `nearLongitude`, the longitude is the copy closest to it,
 * so markers and routes appear in the world copy being viewed and lines take the short way
 * across ±180°.
 */
export function toMapLatLng(c: MarsCoordinate, nearLongitude?: number): [number, number] {
  const lng =
    nearLongitude === undefined
      ? c.longitudeEast
      : c.longitudeEast + 360 * Math.round((nearLongitude - c.longitudeEast) / 360);
  return [c.latitude, lng];
}

/** Great-circle distance (m) on the IAU 2000 Mars sphere (haversine). */
export function greatCircleDistanceM(a: MarsCoordinate, b: MarsCoordinate): number {
  const φ1 = a.latitude * DEG;
  const φ2 = b.latitude * DEG;
  const dφ = φ2 - φ1;
  const dλ = (b.longitudeEast - a.longitudeEast) * DEG;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
