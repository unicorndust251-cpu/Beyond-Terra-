/**
 * Landmarks for location search. Coordinates are feature centres from the IAU/USGS Gazetteer
 * of Planetary Nomenclature (planetocentric latitude, east longitude 0–360°), as verified in
 * the earlier Beyond Terra project (nasa-mars-walk/src/explore/landmarks.ts) against the
 * Gazetteer's MARS_nomenclature_center_pts dataset. Large features span hundreds to
 * thousands of km, so the centre is a reference point, not a precise spot. Medusae Fossae
 * Formation uses the IAU feature Medusae Fossae.
 */

export interface Landmark {
  id: string;
  name: string;
  /** Planetocentric latitude, degrees. */
  latitude: number;
  /** East longitude, 0–360°. */
  longitudeEast360: number;
  category: string;
  /** Gazetteer diameter (km). */
  diameterKm: number;
}

export const LANDMARKS: Landmark[] = [
  { id: "olympus-mons", name: "Olympus Mons", latitude: 18.65, longitudeEast360: 226.2, category: "Shield volcano", diameterKm: 610 },
  { id: "valles-marineris", name: "Valles Marineris", latitude: -14.01, longitudeEast360: 301.41, category: "Canyon system", diameterKm: 3761 },
  { id: "jezero", name: "Jezero Crater", latitude: 18.41, longitudeEast360: 77.69, category: "Impact crater · ancient lake", diameterKm: 47.5 },
  { id: "gale", name: "Gale Crater", latitude: -5.37, longitudeEast360: 137.81, category: "Impact crater", diameterKm: 154 },
  { id: "hellas", name: "Hellas Planitia", latitude: -42.43, longitudeEast360: 70.5, category: "Impact basin", diameterKm: 2299 },
  { id: "argyre", name: "Argyre Planitia", latitude: -49.84, longitudeEast360: 316.69, category: "Impact basin", diameterKm: 893 },
  { id: "utopia", name: "Utopia Planitia", latitude: 46.74, longitudeEast360: 117.52, category: "Lowland plain · impact basin", diameterKm: 3560 },
  { id: "elysium-planitia", name: "Elysium Planitia", latitude: 2.98, longitudeEast360: 154.74, category: "Volcanic plain", diameterKm: 3001 },
  { id: "arcadia", name: "Arcadia Planitia", latitude: 49.02, longitudeEast360: 188.15, category: "Lowland plain", diameterKm: 2245 },
  { id: "planum-boreum", name: "Planum Boreum", latitude: 87.32, longitudeEast360: 54.96, category: "Polar ice plateau", diameterKm: 355 },
  { id: "planum-australe", name: "Planum Australe", latitude: -83.35, longitudeEast360: 157.7, category: "Polar ice plateau", diameterKm: 1430 },
  { id: "elysium-mons", name: "Elysium Mons", latitude: 25.02, longitudeEast360: 147.21, category: "Volcano", diameterKm: 401 },
  { id: "arsia-mons", name: "Arsia Mons", latitude: -8.26, longitudeEast360: 239.91, category: "Shield volcano", diameterKm: 470 },
  { id: "pavonis-mons", name: "Pavonis Mons", latitude: 1.48, longitudeEast360: 247.04, category: "Shield volcano", diameterKm: 367 },
  { id: "ascraeus-mons", name: "Ascraeus Mons", latitude: 11.92, longitudeEast360: 255.92, category: "Shield volcano", diameterKm: 456 },
  { id: "alba-mons", name: "Alba Mons", latitude: 41.08, longitudeEast360: 249.29, category: "Shield volcano", diameterKm: 548 },
  { id: "noctis-labyrinthus", name: "Noctis Labyrinthus", latitude: -6.36, longitudeEast360: 258.81, category: "Canyon network", diameterKm: 1190 },
  { id: "mawrth-vallis", name: "Mawrth Vallis", latitude: 22.43, longitudeEast360: 343.03, category: "Ancient valley", diameterKm: 635 },
  { id: "oxia-planum", name: "Oxia Planum", latitude: 17.28, longitudeEast360: 334.29, category: "Plain · rover landing site", diameterKm: 231 },
  { id: "gusev", name: "Gusev Crater", latitude: -14.53, longitudeEast360: 175.52, category: "Impact crater", diameterKm: 158 },
  { id: "meridiani", name: "Meridiani Planum", latitude: -0.04, longitudeEast360: 356.86, category: "Plain · rover landing site", diameterKm: 1059 },
  { id: "chryse", name: "Chryse Planitia", latitude: 28.43, longitudeEast360: 319.69, category: "Lowland plain", diameterKm: 1542 },
  { id: "acidalia", name: "Acidalia Planitia", latitude: 49.76, longitudeEast360: 339.26, category: "Lowland plain", diameterKm: 3505 },
  { id: "amazonis", name: "Amazonis Planitia", latitude: 25.75, longitudeEast360: 197.09, category: "Volcanic plain", diameterKm: 2809 },
  { id: "deuteronilus-mensae", name: "Deuteronilus Mensae", latitude: 45.11, longitudeEast360: 23.92, category: "Mesas & buried glaciers", diameterKm: 919 },
  { id: "medusae-fossae", name: "Medusae Fossae Formation", latitude: -2.17, longitudeEast360: 195.8, category: "Wind-eroded deposit", diameterKm: 279 },
];
