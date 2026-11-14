import { makeCoordinate, type MarsCoordinate } from '../shared';

/**
 * Rover exploration locations for search, from NASA's published rover localizations
 * (the waypoint feeds behind mars.nasa.gov's "Where is the rover" maps), accessed on
 * 2026-11-14. Planetocentric latitude, east longitude.
 *
 * Only rovers whose positions could be checked against such a feed are listed.
 */
export interface RoverSite {
  id: string;
  name: string;
  detail: string;
  coordinate: MarsCoordinate;
  source: string;
}

const M20 = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json';
const MSL = 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json';

export const ROVER_SITES: RoverSite[] = [
  {
    id: 'perseverance-landing',
    name: 'Perseverance landing site',
    detail: 'Octavia E. Butler Landing, Jezero · Feb 2021',
    coordinate: makeCoordinate(18.44462715, 77.45088572),
    source: M20,
  },
  {
    id: 'perseverance-latest',
    name: 'Perseverance, latest position',
    detail: 'Sol 2022 · as published on 14 Nov 2026',
    coordinate: makeCoordinate(18.43559434, 77.23322287),
    source: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json',
  },
  {
    id: 'curiosity-landing',
    name: 'Curiosity landing site',
    detail: 'Bradbury Landing, Gale crater · Aug 2012',
    coordinate: makeCoordinate(-4.589467, 137.441633),
    source: MSL,
  },
  {
    id: 'curiosity-latest',
    name: 'Curiosity, latest position',
    detail: 'Sol 5073 · as published on 14 Nov 2026',
    coordinate: makeCoordinate(-4.82602331, 137.388886),
    source: 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json',
  },
];
