import { fromEast360, type MarsCoordinate } from '../shared';
import { MARS_LOCATIONS, locationCoordinate } from '../science/locations';

/**
 * Reference points to inspect, Jezero first. Jezero-region names and centres are from the
 * IAU/USGS Gazetteer of Planetary Nomenclature (planetocentric, +East, 0…360°), checked on
 * 2026-11-14; most were adopted in 2020–21 for the Mars 2020 mission. The landing point
 * is NASA's Mars 2020 localization. These are feature centres, not surveyed sites.
 */

export interface Anchor {
  id: string;
  name: string;
  group: 'Jezero and Perseverance' | 'Other regions';
  type: string;
  coordinate: MarsCoordinate;
  /** Feature size, km (IAU "diameter") */
  sizeKm?: number;
  /** Zoom that shows the feature */
  zoom: number;
  source: { name: string; url: string };
}

const gaz = (id: number) => `https://planetarynames.wr.usgs.gov/Feature/${id}`;

const jezero = (id: string, name: string, type: string, lat: number, lon360: number, sizeKm: number, featureId: number, zoom: number): Anchor => ({
  id,
  name,
  group: 'Jezero and Perseverance',
  type,
  coordinate: fromEast360(lat, lon360),
  sizeKm,
  zoom,
  source: { name: 'IAU Gazetteer', url: gaz(featureId) },
});

export const ANCHORS: Anchor[] = [
  {
    id: 'perseverance-landing',
    name: 'Perseverance landing point',
    group: 'Jezero and Perseverance',
    type: 'Landing site (Octavia E. Butler Landing)',
    coordinate: fromEast360(18.44462715, 77.45088572),
    zoom: 11,
    source: { name: 'NASA Mars 2020 localization', url: 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json' },
  },
  jezero('jezero', 'Jezero', 'Crater', 18.4082, 77.6873, 47.5, 14300, 9.5),
  jezero('belva', 'Belva', 'Crater (on the delta)', 18.48, 77.38, 0.9, 15872, 11),
  jezero('neretva-vallis', 'Neretva Vallis', 'Valley (Jezero inlet)', 18.55, 77.2, 17, 15879, 11),
  jezero('hartwell', 'Hartwell', 'Crater', 18.53, 77.72, 1.7, 15871, 11),
  jezero('marysville', 'Marysville', 'Crater', 18.13, 77.18, 1.9, 15874, 11),
  jezero('una-vallis', 'Una Vallis', 'Valley', 18.29, 77.07, 5, 15878, 11),
  jezero('dacono', 'Dacono', 'Crater', 18.34, 77.95, 2.2, 15877, 11),
  jezero('sedona', 'Sedona', 'Crater', 17.84, 77.54, 7.4, 15876, 11),
  jezero('jezero-mons', 'Jezero Mons', 'Mountain', 18.16, 78.23, 27, 16005, 10.5),
  jezero('sava-vallis', 'Sava Vallis', 'Valley (Jezero inlet)', 19.09, 77.13, 62, 15904, 9.5),
  jezero('pliva-vallis', 'Pliva Vallis', 'Valley', 18.67, 78.35, 30, 15903, 10),
  jezero('nili-planum', 'Nili Planum', 'Plain', 18.6, 77.1, 128.5, 15880, 8.5),
  ...MARS_LOCATIONS.filter((l) => l.id !== 'perseverance-landing').map<Anchor>((l) => ({
    id: l.id,
    name: l.name,
    group: 'Other regions',
    type: l.category,
    coordinate: locationCoordinate(l),
    sizeKm: l.sizeKm,
    zoom: l.sizeKm && l.sizeKm > 1000 ? 4.5 : l.sizeKm && l.sizeKm > 300 ? 6 : 7.5,
    source: { name: l.source.name, url: l.source.url },
  })),
];
