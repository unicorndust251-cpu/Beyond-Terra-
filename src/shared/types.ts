/**
 * Types shared by mission planning and scientific data. Owned by `shared`; changes here
 * affect both feature modules, so they go through review by both developers.
 *
 * Coordinate convention (see coordinates.ts for conversions):
 * - planetocentric latitude, degrees, −90…90, north positive;
 * - east-positive longitude, degrees, normalised to −180…180;
 * - on the IAU 2000 Mars sphere (radius 3,396,190 m), the frame NASA Mars Trek uses.
 */

/** A point on Mars in the shared convention. */
export interface MarsCoordinate {
  /** Planetocentric latitude, degrees, −90…90, north positive. */
  latitude: number;
  /** East-positive longitude, degrees, −180…180. */
  longitudeEast: number;
}

/** Latitude/longitude box. `west` may be greater than `east` when the box crosses ±180°. */
export interface CoordinateBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Where a selection came from. */
export type LocationSource = 'map-click' | 'search' | 'mission-plan' | 'scientific-layer' | 'manual';

export interface SelectedLocation {
  coordinate: MarsCoordinate;
  /** e.g. an IAU feature name; omitted for an arbitrary point. */
  name?: string;
  source: LocationSource;
}

export interface MissionCheckpoint {
  id: string;
  coordinate: MarsCoordinate;
  name?: string;
}

export interface MissionRoute {
  id: string;
  start: MarsCoordinate;
  destination: MarsCoordinate;
  /** Intermediate stops, in travel order (start and destination excluded). */
  checkpoints: MissionCheckpoint[];
  /** Detailed path between the stops, in travel order, when one has been computed. */
  path?: MarsCoordinate[];
}

/** A numeric value with its unit and, when known, its ± uncertainty in the same unit. */
export interface MeasuredValue {
  value: number;
  unit: string;
  uncertainty?: number;
}

export type DatasetCoverage = { kind: 'global' } | { kind: 'regional'; bounds: CoordinateBounds };

export interface ScientificDataset {
  /** Stable identifier, e.g. the Mars Trek product name. */
  identifier: string;
  /** Archive or service, e.g. "NASA Mars Trek", "PDS Geosciences Node". */
  source: string;
  /** Mission and instrument, e.g. "MGS MOLA", "MRO CTX". */
  instrument: string;
  /** Units of the values; null for imagery with no physical units. */
  units: string | null;
  coverage: DatasetCoverage;
  /** Ground sampling distance. */
  resolution: MeasuredValue;
  /** ISO 8601 date, or range, of the observations, where applicable. */
  observationDate?: string | { start: string; end: string };
  /** Known limitations, stated plainly (gaps, artefacts, processing, uncertainty). */
  limitations: string[];
}

export interface TerrainSample {
  coordinate: MarsCoordinate;
  /** Elevation above the MOLA areoid, if the source provides it. */
  elevation?: MeasuredValue;
  /** Slope over the source's baseline, if the source provides it. */
  slope?: MeasuredValue;
  /** Identifier of the ScientificDataset the sample was read from. */
  datasetId: string;
  source: string;
  /** How reliable the sample is, beyond the ± values (baseline, interpolation, gaps). */
  uncertaintyNote?: string;
}

export type HazardGeometry =
  | { type: 'point'; coordinate: MarsCoordinate }
  | { type: 'polyline'; coordinates: MarsCoordinate[] }
  | { type: 'polygon'; rings: MarsCoordinate[][] };

export type HazardCategory = 'steep-slope' | 'boulder-field' | 'crater' | 'loose-regolith' | 'dust' | 'other';

export interface HazardObservation {
  identifier: string;
  geometry: HazardGeometry;
  category: HazardCategory;
  /** What the observation rests on: a dataset, a publication or an analysis. */
  evidenceSource: { datasetId?: string; reference: string };
  limitations: string[];
}

export interface EquipmentSelection {
  equipmentId: string;
  name: string;
  /** Omitted unless verified from a source or explicitly stated as an assumption. */
  mass?: { kilograms: number; basis: 'verified' | 'assumed'; reference?: string };
  scientificPurpose: string;
  /** A planning estimate, not an operational figure. */
  estimatedTaskDurationMinutes: number;
}
