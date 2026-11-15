/** Martian seasons from Ls, and the unit conversions the dashboard uses. */

export type Hemisphere = 'Northern' | 'Southern';
export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

const NORTH: Season[] = ['Spring', 'Summer', 'Autumn', 'Winter'];
const SOUTH: Season[] = ['Autumn', 'Winter', 'Spring', 'Summer'];

export interface MartianSeason {
  hemisphere: Hemisphere;
  season: Season;
  Ls: number;
  /** Set at the equator, where the northern-hemisphere naming is used by convention. */
  equatorConvention: boolean;
}

/**
 * Astronomical season from solar longitude: northern spring Ls 0–90°, summer 90–180°,
 * autumn 180–270°, winter 270–360°; the southern hemisphere has the opposite season.
 * Seasons differ in length because Mars's orbit is eccentric; they are defined by Ls, not
 * by equal fractions of the year.
 */
export function martianSeason(Ls: number, latitude: number): MartianSeason {
  const q = Math.min(3, Math.floor((((Ls % 360) + 360) % 360) / 90));
  const hemisphere: Hemisphere = latitude < 0 ? 'Southern' : 'Northern';
  return { hemisphere, season: (hemisphere === 'Northern' ? NORTH : SOUTH)[q], Ls, equatorConvention: latitude === 0 };
}

/** Mars reference surface gravity (m/s²), NASA Mars Fact Sheet. */
export const MARS_GRAVITY = 3.71;
export const EARTH_GRAVITY = 9.80665;

export const kelvinToCelsius = (k: number) => k - 273.15;
export const celsiusToFahrenheit = (c: number) => (c * 9) / 5 + 32;
export const paToKPa = (pa: number) => pa / 1000;
export const paToMbar = (pa: number) => pa / 100;
/** Height relative to the areoid in words: −2,629 m → "2.63 km below the areoid". */
export function areoidHeight(metres: number): string {
  const km = (Math.abs(metres) / 1000).toFixed(2);
  if (km === '0.00') return 'At the areoid';
  return `${km} km ${metres < 0 ? 'below' : 'above'} the areoid`;
}
/** Weight in newtons at the reference gravity; the mass itself is unchanged. */
export const weightNewtons = (massKg: number, g = MARS_GRAVITY) => massKg * g;
/** Wind speed from eastward and northward components (same units in, same units out). */
export const windSpeed = (uEast: number, vNorth: number) => Math.hypot(uEast, vNorth);
/** Meteorological direction the wind blows FROM, clockwise from north (deg). */
export const windFromDirection = (uEast: number, vNorth: number) => (((Math.atan2(-uEast, -vNorth) * 180) / Math.PI) % 360 + 360) % 360;
