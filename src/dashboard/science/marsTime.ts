/**
 * Mars solar time and Sun position: the NASA GISS Mars24 algorithm (Allison & McEwen 2000,
 * Allison 1997), step for step as published at
 * https://www.giss.nasa.gov/tools/mars24/help/algorithm.html (steps A-1 … D-6).
 *
 * Conventions:
 * - Input longitude is EAST-positive (the project's convention). Mars24 works in
 *   planetographic WEST longitude; Λ_west = (360 − λ_east) mod 360.
 * - Input latitude is planetocentric (the project's convention). The solar-elevation step
 *   uses planetographic latitude, converted on the IAU 2000 Mars ellipsoid.
 * - UTC → TT uses the leap-second table (TT − UTC = TAI − UTC + 32.184 s).
 */

const DEG = Math.PI / 180;
const sin = (d: number) => Math.sin(d * DEG);
const cos = (d: number) => Math.cos(d * DEG);
const tan = (d: number) => Math.tan(d * DEG);

export const wrap360 = (d: number) => ((d % 360) + 360) % 360;
export const wrap24 = (h: number) => ((h % 24) + 24) % 24;

/** IAU 2000 Mars radii (km), for planetocentric ↔ planetographic latitude. */
const RE = 3396.19;
const RP = 3376.2;

/** Length of a mean solar day on Mars in Earth seconds (Mars24: 1.0274912517 Earth days). */
export const SOL_SECONDS = 1.0274912517 * 86400;
/** Earth hours per Mars clock hour. */
export const EARTH_HOURS_PER_MARS_HOUR = 1.0274912517;

/** TAI − UTC (s) from each date (UTC) onwards. No leap second has been added since 2017-01-01. */
const LEAP_SECONDS: Array<[string, number]> = [
  ['1972-01-01', 10], ['1972-07-01', 11], ['1973-01-01', 12], ['1974-01-01', 13], ['1975-01-01', 14],
  ['1976-01-01', 15], ['1977-01-01', 16], ['1978-01-01', 17], ['1979-01-01', 18], ['1980-01-01', 19],
  ['1981-07-01', 20], ['1982-07-01', 21], ['1983-07-01', 22], ['1985-07-01', 23], ['1988-01-01', 24],
  ['1990-01-01', 25], ['1991-01-01', 26], ['1992-07-01', 27], ['1993-07-01', 28], ['1994-07-01', 29],
  ['1996-01-01', 30], ['1997-07-01', 31], ['1999-01-01', 32], ['2006-01-01', 33], ['2009-01-01', 34],
  ['2012-07-01', 35], ['2015-07-01', 36], ['2017-01-01', 37],
];
const LEAP_MS = LEAP_SECONDS.map(([d, s]) => [Date.parse(`${d}T00:00:00Z`), s] as const);

/** A-4: TT − UTC in seconds. */
export function ttMinusUtc(utcMs: number): number {
  if (utcMs < LEAP_MS[0][0]) {
    // Before 1972: the Mars24 polynomial in Julian centuries (A-3)
    const T = (utcMs / 8.64e7 + 2440587.5 - 2451545.0) / 36525;
    return 64.184 + 59 * T - 51.2 * T ** 2 - 67.1 * T ** 3 - 16.4 * T ** 4;
  }
  let tai = LEAP_MS[0][1];
  for (const [ms, s] of LEAP_MS) if (utcMs >= ms) tai = s;
  return tai + 32.184;
}

export function planetographicLatitude(planetocentricDeg: number): number {
  if (Math.abs(planetocentricDeg) >= 90) return planetocentricDeg;
  return Math.atan(Math.tan(planetocentricDeg * DEG) * (RE / RP) ** 2) / DEG;
}

export interface MarsTime {
  utcMs: number;
  /** A-2 */
  jdUT: number;
  /** A-4 (s) */
  ttMinusUtc: number;
  /** A-5 */
  jdTT: number;
  /** A-6 (days) */
  dtJ2000: number;
  /** B-1 mean anomaly (deg, 0–360) */
  M: number;
  /** B-2 angle of the fictitious mean Sun (deg, 0–360) */
  alphaFMS: number;
  /** B-3 perturbers (deg) */
  PBS: number;
  /** B-4 equation of centre ν − M (deg) */
  nuMinusM: number;
  /** B-5 areocentric solar longitude Ls (deg, 0–360) */
  Ls: number;
  /** C-1 equation of time (deg) */
  EOT: number;
  /** C-2 mean solar time at the prime meridian (h) */
  MST: number;
  /** C-5 subsolar longitude (deg west, 0–360) */
  subsolarLonWest: number;
  /** D-1 solar declination (deg) */
  declination: number;
  /** D-2 heliocentric distance (AU) */
  heliocentricAU: number;
  /** Mars Sol Date (Allison & McEwen 2000), for reference */
  msd: number;
}

const PERTURBERS: Array<[number, number, number]> = [
  [0.0071, 2.2353, 49.409],
  [0.0057, 2.7543, 168.173],
  [0.0039, 1.1177, 191.837],
  [0.0037, 15.7866, 21.736],
  [0.0021, 2.1354, 15.704],
  [0.002, 2.4694, 95.528],
  [0.0018, 32.8493, 49.095],
];

/** Steps A-1 … D-2 for one instant (UTC milliseconds since the Unix epoch). */
export function marsTime(utcMs: number): MarsTime {
  const jdUT = 2440587.5 + utcMs / 8.64e7; // A-2
  const dt = ttMinusUtc(utcMs); // A-4
  const jdTT = jdUT + dt / 86400; // A-5
  const d = jdTT - 2451545.0; // A-6
  const M = wrap360(19.3871 + 0.52402073 * d); // B-1
  const alphaFMS = wrap360(270.3871 + 0.524038496 * d); // B-2
  const PBS = PERTURBERS.reduce((s, [A, tau, phi]) => s + A * cos((0.985626 * d) / tau + phi), 0); // B-3
  const nuMinusM =
    (10.691 + 3.0e-7 * d) * sin(M) + 0.623 * sin(2 * M) + 0.05 * sin(3 * M) + 0.005 * sin(4 * M) + 0.0005 * sin(5 * M) + PBS; // B-4
  const Ls = wrap360(alphaFMS + nuMinusM); // B-5
  const EOT = 2.861 * sin(2 * Ls) - 0.071 * sin(4 * Ls) + 0.002 * sin(6 * Ls) - nuMinusM; // C-1
  const msd = (jdTT - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626;
  const MST = wrap24(24 * msd); // C-2
  const subsolarLonWest = wrap360(MST * 15 + EOT + 180); // C-5
  const declination = Math.asin(0.42565 * sin(Ls)) / DEG + 0.25 * sin(Ls); // D-1
  const heliocentricAU =
    1.52367934 * (1.00436 - 0.09309 * cos(M) - 0.004336 * cos(2 * M) - 0.00031 * cos(3 * M) - 0.00003 * cos(4 * M)); // D-2
  return { utcMs, jdUT, ttMinusUtc: dt, jdTT, dtJ2000: d, M, alphaFMS, PBS, nuMinusM, Ls, EOT, MST, subsolarLonWest, declination, heliocentricAU, msd };
}

export interface LocalSolar {
  /** C-3 local mean solar time (h) */
  LMST: number;
  /** C-4 local true solar time (h) */
  LTST: number;
  /** Hour angle H = Λ − Λs (deg, −180…180), as Mars24 defines it */
  hourAngle: number;
  /** D-5 solar elevation above a flat horizon (deg) */
  elevation: number;
  /** D-6 solar azimuth, clockwise from north (deg); null when the Sun is within 0.01° of the zenith */
  azimuth: number | null;
  /** Planetographic latitude used for D-5 and D-6 (deg) */
  latitudeGraphic: number;
}

/**
 * C-3 … D-6 at a place. `latitude` is planetocentric unless `planetographic` is set
 * (Mars24's worked examples give planetographic latitudes).
 */
export function localSolar(t: MarsTime, latitude: number, longitudeEast: number, opts: { planetographic?: boolean } = {}): LocalSolar {
  const lonWest = wrap360(360 - longitudeEast);
  const LMST = wrap24(t.MST - lonWest / 15); // C-3
  const LTST = wrap24(LMST + t.EOT / 15); // C-4
  const phi = opts.planetographic ? latitude : planetographicLatitude(latitude);
  let H = wrap360(lonWest - t.subsolarLonWest);
  if (H > 180) H -= 360;
  const d = t.declination;
  const cosZ = Math.max(-1, Math.min(1, sin(d) * sin(phi) + cos(d) * cos(phi) * cos(H)));
  const Z = Math.acos(cosZ) / DEG; // D-5
  const elevation = 90 - Z;
  const az =
    Z < 0.01 ? null : wrap360(Math.atan2(sin(H), cos(phi) * tan(d) - sin(phi) * cos(H)) / DEG); // D-6, quadrant-safe
  return { LMST, LTST, hourAngle: H, elevation, azimuth: az, latitudeGraphic: phi };
}

/** "13:09:55" from decimal hours. */
export function formatClock(hours: number): string {
  const total = Math.round(wrap24(hours) * 3600) % 86400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
