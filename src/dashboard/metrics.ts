import { useEffect, useState } from 'react';
import type { MarsCoordinate } from '../shared';
import { GEOLOGIC_MAP, inspectTerrain, JEZERO_CTX_DTM, MOLA_MEGDR, type TerrainInspection } from '../scientific-data/terrain';
import type { ScientificDataset } from '../shared';
import { sourceById } from './sources';

/** One displayed value and where it comes from (the dashboard's provenance record). */
export type ValueStatus = 'observed' | 'calculated' | 'modelled' | 'assumed' | 'unavailable';

export const STATUS_TEXT: Record<ValueStatus, string> = {
  observed: 'Observed / mapped',
  calculated: 'Calculated',
  modelled: 'Modelled',
  assumed: 'Assumed reference',
  unavailable: 'Unavailable',
};

export interface SciValue {
  value: string | null;
  /** Secondary line under the value. */
  detail?: string;
  status: ValueStatus;
  sourceName?: string;
  sourceUrl?: string;
  observationTime?: string;
  appliesTo?: string;
  method?: string;
  resolution?: string;
  uncertainty?: string;
  limitations?: string;
}

export const NO_OBSERVATION = 'No suitable observation available';

/** Shared reason for every environmental quantity in this build. */
export function environmentalUnavailable(what: string): SciValue {
  const meda = sourceById('meda')!;
  return {
    value: null,
    status: 'unavailable',
    detail: NO_OBSERVATION,
    method: `No ${what} dataset or model is connected to this build.`,
    limitations:
      `Perseverance MEDA measures ${what} only at the rover's location in Jezero and is not yet extracted for this site; ` +
      'the Mars Climate Database (a model) is not connected. Nothing is estimated in their place.',
    sourceName: `${meda.name} (assessed, not integrated)`,
    sourceUrl: meda.url,
  };
}

const datasetDate = (d: ScientificDataset) =>
  !d.observationDate ? undefined : typeof d.observationDate === 'string' ? d.observationDate : `${d.observationDate.start} to ${d.observationDate.end}`;

/** "18.6500° N, 226.2000° E" (east longitude 0–360°). */
export const fmtCoord = (c: MarsCoordinate) =>
  `${Math.abs(c.latitude).toFixed(4)}° ${c.latitude >= 0 ? 'N' : 'S'}, ${(((c.longitudeEast % 360) + 360) % 360).toFixed(4)}° E`;

/** Elevation, slope and surface unit at a point, as provenance records. */
export function terrainValues(t: TerrainInspection | null, loading: boolean) {
  if (!t) {
    const pending: SciValue = { value: null, status: 'unavailable', detail: loading ? 'Loading…' : 'Select a location' };
    return { elevation: pending, slope: pending, material: pending, relief: pending };
  }
  const useLocal = t.local.elevation.status === 'available';
  const ds = useLocal ? JEZERO_CTX_DTM : MOLA_MEGDR;
  const e = useLocal ? t.local.elevation : t.regional.elevation;
  const s = useLocal ? t.local.slope : t.regional.slope;
  const r = useLocal ? t.local.relief : t.regional.relief;
  const where = fmtCoord(t.coordinate);
  const common = {
    sourceName: `${ds.source} · ${ds.identifier}`,
    sourceUrl: useLocal ? sourceById('jezero-dtm')!.url : sourceById('mola-megdr')!.url,
    observationTime: datasetDate(ds),
    resolution: `${ds.resolution.value.toLocaleString()} ${ds.resolution.unit} (${ds.instrument})`,
    limitations: ds.limitations.join(' '),
  };
  const elevation: SciValue =
    e.status === 'available' && e.value
      ? {
          ...common,
          value: `${Math.round(e.value.metres).toLocaleString()} m`,
          detail: `${(e.value.metres / 1000).toFixed(2)} km above the areoid`,
          status: 'observed',
          appliesTo: `${useLocal ? '20 m post' : '1/16° bin'} containing ${where}`,
          method: `${e.value.method}. Height relative to the Mars areoid (MOLA reference), not a sea level.`,
        }
      : { value: null, status: 'unavailable', detail: 'Data unavailable', method: e.note ?? 'No elevation sample at this point.' };
  const slope: SciValue =
    s.status === 'available' && s.value
      ? {
          ...common,
          value: `${s.value.degrees.toFixed(1)}°`,
          detail: useLocal ? 'Local slope (20 m DTM)' : 'Regional slope (3.7 km bins)',
          status: 'calculated',
          appliesTo: where,
          method: `slope = atan(√((dz/dx)² + (dz/dy)²)) from the elevation grid, horizontal distances in metres; gradient over ${Math.round(s.value.baselineM).toLocaleString()} m.`,
          limitations: `${common.limitations} A slope over ${Math.round(s.value.baselineM).toLocaleString()} m does not show steeper ground at walking scale.`,
        }
      : { value: null, status: 'unavailable', detail: 'Data unavailable', method: s.note ?? 'No slope at this point.' };
  const relief: SciValue =
    r.status === 'available' && r.value
      ? {
          ...common,
          value: `${Math.round(r.value.rangeM).toLocaleString()} m`,
          detail: `range in a ${(r.value.windowM / 1000).toFixed(1)} km window`,
          status: 'calculated',
          appliesTo: where,
          method: 'Highest minus lowest elevation in the window around the point.',
        }
      : { value: null, status: 'unavailable', detail: 'Data unavailable' };
  const g = t.geology;
  const material: SciValue =
    g.status === 'available' && g.value
      ? {
          value: g.value.code,
          detail: g.value.description,
          status: 'observed',
          sourceName: `${GEOLOGIC_MAP.source} · ${GEOLOGIC_MAP.identifier}`,
          sourceUrl: sourceById('usgs-geology')!.url,
          appliesTo: `Mapped unit at ${where}`,
          resolution: `1:20,000,000 map (${GEOLOGIC_MAP.resolution.value.toLocaleString()} m raster)`,
          method: 'Mapped geologic unit looked up at the point.',
          limitations: `${GEOLOGIC_MAP.limitations.join(' ')} This is a mapped unit, not a measured rock or soil composition.`,
        }
      : { value: null, status: 'unavailable', detail: g.status === 'not-mapped' ? 'Not mapped' : 'Data unavailable', method: g.note };
  return { elevation, slope, material, relief };
}

const cache = new Map<string, Promise<TerrainInspection>>();

/** Terrain readings for a coordinate; stale responses are dropped when the location changes. */
export function useTerrain(c: MarsCoordinate | null): { terrain: TerrainInspection | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ key: string; terrain: TerrainInspection | null; error: string | null }>({ key: '', terrain: null, error: null });
  const key = c ? `${c.latitude},${c.longitudeEast}` : '';
  useEffect(() => {
    if (!c) return undefined;
    let cancelled = false;
    let p = cache.get(key);
    if (!p) {
      p = inspectTerrain(c);
      cache.set(key, p);
      p.catch(() => cache.delete(key));
    }
    p.then(
      (terrain) => !cancelled && setState({ key, terrain, error: null }),
      (e) => !cancelled && setState({ key, terrain: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
    };
    // key captures the coordinate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = state.key === key;
  return { terrain: current ? state.terrain : null, loading: !!c && !current, error: current ? state.error : null };
}
