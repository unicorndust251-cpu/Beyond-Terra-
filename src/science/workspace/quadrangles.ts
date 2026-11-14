/**
 * The 30 USGS Mars chart quadrangles (MC-1 … MC-30), used to name the region in view.
 * Bounds are the standard chart divisions: polar caps beyond ±65°; bands 30–65° of
 * 60° longitude; equatorial bands 0–30° of 45°. Checked against the quadrangle that the
 * IAU/USGS Gazetteer records for every named Mars feature.
 *
 * Longitudes here are east 0…360°.
 */

interface Quadrangle {
  code: string;
  name: string;
}

// Each band lists its quadrangles from 0° E eastward
const NORTH_MID = ['MC-5 Ismenius Lacus', 'MC-6 Casius', 'MC-7 Cebrenia', 'MC-2 Diacria', 'MC-3 Arcadia', 'MC-4 Mare Acidalium'];
const NORTH_EQ = ['MC-12 Arabia', 'MC-13 Syrtis Major', 'MC-14 Amenthes', 'MC-15 Elysium', 'MC-8 Amazonis', 'MC-9 Tharsis', 'MC-10 Lunae Palus', 'MC-11 Oxia Palus'];
const SOUTH_EQ = ['MC-20 Sinus Sabaeus', 'MC-21 Iapygia', 'MC-22 Mare Tyrrhenum', 'MC-23 Aeolis', 'MC-16 Memnonia', 'MC-17 Phoenicis Lacus', 'MC-18 Coprates', 'MC-19 Margaritifer Sinus'];
const SOUTH_MID = ['MC-27 Noachis', 'MC-28 Hellas', 'MC-29 Eridania', 'MC-24 Phaethontis', 'MC-25 Thaumasia', 'MC-26 Argyre'];

function split(label: string): Quadrangle {
  const i = label.indexOf(' ');
  return { code: label.slice(0, i), name: label.slice(i + 1) };
}

/** The quadrangle containing a point (planetocentric latitude, any east longitude). */
export function quadrangleAt(latitude: number, longitudeEast: number): Quadrangle {
  const lon = ((longitudeEast % 360) + 360) % 360;
  if (latitude >= 65) return { code: 'MC-1', name: 'Mare Boreum' };
  if (latitude <= -65) return { code: 'MC-30', name: 'Mare Australe' };
  if (latitude >= 30) return split(NORTH_MID[Math.min(5, Math.floor(lon / 60))]);
  if (latitude >= 0) return split(NORTH_EQ[Math.min(7, Math.floor(lon / 45))]);
  if (latitude > -30) return split(SOUTH_EQ[Math.min(7, Math.floor(lon / 45))]);
  return split(SOUTH_MID[Math.min(5, Math.floor(lon / 60))]);
}
