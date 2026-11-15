/** One landmark exactly as Reference A gives it (see catalogue.data.ts). */
export interface LandmarkSourceRecord {
  /** Position in the reference catalogue, 1–46. */
  n: number;
  id: string;
  name: string;
  /** Planetocentric latitude (degrees, north positive). */
  latitude: number;
  /** East longitude, 0–360. */
  longitudeEast360: number;
  /** USGS Gazetteer feature page the centre was taken from. */
  coordinateSource: string;
  /** What the reference coordinate does and does not identify, where the reference says so. */
  qualification: string | null;
  importance: string;
  investigation: string;
  terrain: string;
}

export interface LandmarkSource {
  label: string;
  url: string;
  /** Who published it (credited separately: NASA, ESA, USGS). */
  publisher: string;
}

export interface Landmark extends LandmarkSourceRecord {
  /** IAU descriptor term in the name, with its Gazetteer meaning. */
  category: string;
  /** Aliases documented in the reference (none are, so far). */
  aliases: string[];
  /** Sources the reference attaches to this landmark's claims (not the coordinate source). */
  claimSources: LandmarkSource[];
}
