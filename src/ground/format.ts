import { toEast360, type MarsCoordinate } from '../shared';

/** "18.4447° N, 77.4508° E": planetocentric latitude, east longitude 0–360° (as across the site). */
export const fmtCoord = (c: MarsCoordinate, digits = 4) =>
  `${Math.abs(c.latitude).toFixed(digits)}° ${c.latitude >= 0 ? 'N' : 'S'}, ${toEast360(c).toFixed(digits)}° E`;

/** Distances: metres below 1 km, two decimals below 100 km. */
export const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 100 ? `${km.toFixed(2)} km` : `${Math.round(km).toLocaleString('en-GB')} km`);
