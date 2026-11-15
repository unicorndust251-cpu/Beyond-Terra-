import type { MarsCoordinate } from '../../shared';

/**
 * Perseverance MEDA observations for the Mars Dashboard.
 *
 * The data comes from public/data/meda/, prepared from the NASA PDS archive by
 * scripts/meda/build-meda.mjs (the archive sends no CORS headers, so browsers cannot read it
 * directly). Values there are in the SOURCE units recorded from each product's PDS4 label;
 * this adapter converts them according to that unit, into four internal fields:
 * airTemperatureC, surfaceTemperatureC, windSpeedMs and pressurePa.
 *
 * Matching rules: a reading is used only if the selected location is within APPLY_KM of the
 * rover's actual position on that sol, and the sensor's nearest valid record is within
 * MAX_GAP_MIN of the selected observation time. Each field is matched separately and keeps
 * its own time. The observation time is a chosen historical period (see observationPeriod),
 * separate from the dashboard's astronomy clock.
 */

export type EnvField = 'airTemperatureC' | 'surfaceTemperatureC' | 'windSpeedMs' | 'pressurePa';

/** Distance from the rover within which a Jezero reading is shown (crater scale). */
export const APPLY_KM = 30;
/** Largest gap between the selected time and the record used. */
export const MAX_GAP_MIN = 30;

export interface MedaIndex {
  version: number;
  archive: string;
  documentation: string;
  citation: string;
  landing: { latitude: number; longitudeEast: number; source: string };
  marsRadiusM: number;
  rules: Record<string, string>;
  sols: Array<{ sol: number; file: string; startUtc: string; stopUtc: string; lsStart: number; lsStop: number }>;
}

interface ProductMeta {
  lid: string;
  version: string;
  title: string;
  csv: string;
  label: string;
  startUtc: string;
  stopUtc: string;
  units: Record<string, string | null>;
  rows: number;
}

/** One sol file: series of [utcMs, sclk, ltst, value, …] in source units. */
export interface MedaSol {
  sol: number;
  lsStart: number;
  lsStop: number;
  startUtc: string;
  stopUtc: string;
  /** null when the product is not in the archive for this sol (e.g. no wind after the sensor was damaged). */
  products: Record<'airTemperature' | 'groundTemperature' | 'pressure' | 'wind' | 'ancillary', ProductMeta | null>;
  rejected: Record<string, Record<string, number>>;
  airTemperature: Array<[number, number, string, number | null, number | null, number | null]>;
  groundTemperature: Array<[number, number, string, number | null, number | null, string | null]>;
  pressure: Array<[number, number, string, number | null, number | null]>;
  windSpeed: Array<[number, number, string, number | null, number | null]>;
  rover: Array<[number, number | null, number | null]>;
}

/* ------------------------------------------------------------- validation & units */

/**
 * The archive's fill value where no retrieval exists (used by the derived wind product). The
 * build script already rejects it; it is checked again here so it can never reach a card.
 */
export const FILL_VALUES = [999999999];

/** A finite number, or null. Empty strings, null, undefined, NaN, ±Infinity and sentinels are null. */
export function finiteOrNull(v: unknown, sentinels: number[] = []): number | null {
  if (typeof v === 'string') {
    if (v.trim() === '') return null;
    v = Number(v);
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return sentinels.includes(v) ? null : v;
}

const norm = (u: string | null | undefined) => (u ?? '').trim().toLowerCase();

/** Temperature to °C from its documented unit; kelvin is converted, Celsius is kept. */
export function toCelsius(value: number, unit: string | null | undefined): number {
  const u = norm(unit);
  if (u === 'kelvin' || u === 'k') return value - 273.15;
  if (u === 'celsius' || u === 'degc' || u === '°c' || u === 'c') return value;
  throw new Error(`Unsupported temperature unit: ${unit ?? 'none'}`);
}

/** Pressure to Pa from its documented unit: Pa kept; mbar/hPa × 100; kPa × 1000. */
export function toPascal(value: number, unit: string | null | undefined): number {
  const u = norm(unit);
  if (u === 'pascal' || u === 'pa') return value;
  if (u === 'mbar' || u === 'millibar' || u === 'hpa' || u === 'hectopascal') return value * 100;
  if (u === 'kpa' || u === 'kilopascal') return value * 1000;
  throw new Error(`Unsupported pressure unit: ${unit ?? 'none'}`);
}

/** Wind speed to m/s from its documented unit. */
export function toMetresPerSecond(value: number, unit: string | null | undefined): number {
  const u = norm(unit);
  if (u === 'meter/second' || u === 'metre/second' || u === 'm/s' || u === 'm s-1') return value;
  if (u === 'km/h' || u === 'kilometer/hour') return value / 3.6;
  throw new Error(`Unsupported wind-speed unit: ${unit ?? 'none'}`);
}

/** Horizontal speed from documented eastward/northward components in m/s (not needed for MEDA, which supplies the speed). */
export const speedFromComponents = (east: number, north: number) => Math.hypot(east, north);

/* ------------------------------------------------------------------- matching */

export interface EnvReading {
  field: EnvField;
  /** Value in the internal unit (°C, m/s, Pa). */
  value: number;
  sourceValue: number;
  sourceUnit: string;
  sourceField: string;
  uncertainty: number | null;
  /** Air temperature: lowest and highest of the mast sensors used (°C). */
  sensorRangeC?: [number, number];
  utcMs: number;
  sclk: number;
  ltst: string;
  sol: number;
  productTitle: string;
  productLid: string;
  csvUrl: string;
  labelUrl: string;
  rover: MarsCoordinate;
  distanceKm: number;
}

export type FieldResult = { state: 'ok'; reading: EnvReading } | { state: 'unavailable'; reason: string };

const DEG = Math.PI / 180;

export function roverCoordinate(index: MedaIndex, northM: number, westM: number): MarsCoordinate {
  const R = index.marsRadiusM;
  const lat = index.landing.latitude + northM / R / DEG;
  const lon = index.landing.longitudeEast - westM / (R * Math.cos(index.landing.latitude * DEG)) / DEG;
  return { latitude: lat, longitudeEast: lon };
}

export function distanceKm(a: MarsCoordinate, b: MarsCoordinate, radiusM: number): number {
  const dLat = (b.latitude - a.latitude) * DEG;
  const dLon = (b.longitudeEast - a.longitudeEast) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * DEG) * Math.cos(b.latitude * DEG) * Math.sin(dLon / 2) ** 2;
  return (2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)))) / 1000;
}

/** The sol whose data span contains the time (with the slot margin), if any. */
export function solFor(index: MedaIndex, utcMs: number): MedaIndex['sols'][number] | null {
  return index.sols.find((s) => utcMs >= Date.parse(s.startUtc) - MAX_GAP_MIN * 60000 && utcMs <= Date.parse(s.stopUtc) + MAX_GAP_MIN * 60000) ?? null;
}

function nearest<T extends [number, ...unknown[]]>(rows: T[], utcMs: number): T | null {
  let best: T | null = null;
  for (const r of rows) if (!best || Math.abs(r[0] - utcMs) < Math.abs(best[0] - utcMs)) best = r;
  return best && Math.abs(best[0] - utcMs) <= MAX_GAP_MIN * 60000 ? best : null;
}

const NO_RECORD = `No valid record within ${MAX_GAP_MIN} minutes of the selected time on this sol.`;
const NO_PRODUCT = 'This MEDA product is not in the PDS archive for this sol.';

/** Matches all four fields for a place and time. Only finite values become readings. */
export function matchObservations(index: MedaIndex, sol: MedaSol, place: MarsCoordinate, utcMs: number): Record<EnvField, FieldResult> {
  const pos = nearest(sol.rover, utcMs) ?? sol.rover.reduce<MedaSol['rover'][number] | null>((b, r) => (!b || Math.abs(r[0] - utcMs) < Math.abs(b[0] - utcMs) ? r : b), null);
  const north = finiteOrNull(pos?.[1]);
  const west = finiteOrNull(pos?.[2]);
  const unavailable = (reason: string) => ({ state: 'unavailable', reason }) as FieldResult;
  if (north === null || west === null) {
    const r = unavailable('The rover position for this sol is not available, so the reading cannot be located.');
    return { airTemperatureC: r, surfaceTemperatureC: r, windSpeedMs: r, pressurePa: r };
  }
  const rover = roverCoordinate(index, north, west);
  const dist = distanceKm(place, rover, index.marsRadiusM);
  if (dist > APPLY_KM) {
    const r = unavailable(`MEDA measured at Perseverance in Jezero crater, ${Math.round(dist).toLocaleString()} km from this location: not applied here.`);
    return { airTemperatureC: r, surfaceTemperatureC: r, windSpeedMs: r, pressurePa: r };
  }
  const common = (p: ProductMeta, row: [number, number, string, ...unknown[]]) => ({
    utcMs: row[0],
    sclk: row[1],
    ltst: row[2],
    sol: sol.sol,
    productTitle: p.title,
    productLid: p.lid,
    csvUrl: p.csv,
    labelUrl: p.label,
    rover,
    distanceKm: dist,
  });

  const out = {} as Record<EnvField, FieldResult>;
  // Air temperature
  {
    const p = sol.products.airTemperature;
    if (!p) out.airTemperatureC = unavailable(NO_PRODUCT);
    else {
    const unit = p.units.ATS_LOCAL_TEMP1;
    const row = nearest(sol.airTemperature.filter((r) => finiteOrNull(r[3], FILL_VALUES) !== null), utcMs);
    if (!row) out.airTemperatureC = unavailable(NO_RECORD);
    else {
      const lo = finiteOrNull(row[4]);
      const hi = finiteOrNull(row[5]);
      out.airTemperatureC = {
        state: 'ok',
        reading: {
          field: 'airTemperatureC',
          value: toCelsius(row[3]!, unit),
          sourceValue: row[3]!,
          sourceUnit: unit ?? '',
          sourceField: 'median of ATS_LOCAL_TEMP1–3',
          uncertainty: null,
          sensorRangeC: lo !== null && hi !== null ? [toCelsius(lo, unit), toCelsius(hi, unit)] : undefined,
          ...common(p, row),
        },
      };
    }
    }
  }
  // Surface (ground) temperature
  {
    const p = sol.products.groundTemperature;
    if (!p) out.surfaceTemperatureC = unavailable(NO_PRODUCT);
    else {
    const unit = p.units.GROUND_TEMP;
    const row = nearest(sol.groundTemperature.filter((r) => finiteOrNull(r[3], FILL_VALUES) !== null), utcMs);
    if (!row) out.surfaceTemperatureC = unavailable(NO_RECORD);
    else {
      const unc = finiteOrNull(row[4]);
      out.surfaceTemperatureC = {
        state: 'ok',
        reading: {
          field: 'surfaceTemperatureC',
          value: toCelsius(row[3]!, unit),
          sourceValue: row[3]!,
          sourceUnit: unit ?? '',
          sourceField: 'GROUND_TEMP',
          // A temperature difference is the same in K and °C
          uncertainty: unc,
          ...common(p, row),
        },
      };
    }
    }
  }
  // Pressure
  {
    const p = sol.products.pressure;
    if (!p) out.pressurePa = unavailable(NO_PRODUCT);
    else {
    const unit = p.units.BAROCAP1_PRESSURE;
    const row = nearest(sol.pressure.filter((r) => finiteOrNull(r[3], FILL_VALUES) !== null), utcMs);
    if (!row) out.pressurePa = unavailable(NO_RECORD);
    else {
      const unc = finiteOrNull(row[4]);
      out.pressurePa = {
        state: 'ok',
        reading: {
          field: 'pressurePa',
          value: toPascal(row[3]!, unit),
          sourceValue: row[3]!,
          sourceUnit: unit ?? '',
          sourceField: 'BAROCAP1_PRESSURE',
          uncertainty: unc === null ? null : toPascal(unc, p.units.BAROCAP1_PRESSURE_UNCERTAINTY ?? unit),
          ...common(p, row),
        },
      };
    }
    }
  }
  // Wind speed
  {
    const p = sol.products.wind;
    if (!p) out.windSpeedMs = unavailable(NO_PRODUCT);
    else {
    const unit = p.units.HORIZONTAL_WIND_SPEED;
    const row = nearest(sol.windSpeed.filter((r) => finiteOrNull(r[3], FILL_VALUES) !== null), utcMs);
    if (!row) out.windSpeedMs = unavailable(NO_RECORD);
    else {
      out.windSpeedMs = {
        state: 'ok',
        reading: {
          field: 'windSpeedMs',
          value: toMetresPerSecond(row[3]!, unit),
          sourceValue: row[3]!,
          sourceUnit: unit ?? '',
          sourceField: 'HORIZONTAL_WIND_SPEED',
          uncertainty: finiteOrNull(row[4]),
          ...common(p, row),
        },
      };
    }
    }
  }
  return out;
}

/* ------------------------------------------------------- observation periods */

/**
 * The weather cards show a chosen historical observation period (a sol in the archive), not
 * the dashboard's astronomy clock: the bundled records cover only a few sols. Periods and
 * their times are built from the valid records themselves, never from a list of dates.
 */

/** A time within a sol at which readings can be shown, and which measurements have a record near it. */
export interface ObservationSlot {
  /** UTC of an actual record. */
  utcMs: number;
  ltst: string;
  /** Measurements with a valid record within MAX_GAP_MIN of utcMs. */
  fields: EnvField[];
}

export interface ObservationPeriod {
  sol: number;
  file: string;
  startUtc: string;
  stopUtc: string;
  /** Valid records per measurement on this sol. */
  counts: Record<EnvField, number>;
  /** One slot per LTST hour that has records, in time order. */
  slots: ObservationSlot[];
  /** Suggested slot: the most measurements, then the nearest to 13:00 LTST. */
  defaultSlot: ObservationSlot;
}

const SERIES: Array<[EnvField, 'airTemperature' | 'groundTemperature' | 'windSpeed' | 'pressure']> = [
  ['airTemperatureC', 'airTemperature'],
  ['surfaceTemperatureC', 'groundTemperature'],
  ['windSpeedMs', 'windSpeed'],
  ['pressurePa', 'pressure'],
];

/** Hours into the sol from an LTST string such as "0315 13:02:11". */
export function ltstHours(ltst: string): number {
  const m = ltst.match(/(\d{2}):(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600 : NaN;
}

/** The sol's observation period, or null when it holds no valid record at all. */
export function observationPeriod(entry: MedaIndex['sols'][number], sol: MedaSol): ObservationPeriod | null {
  type Row = [number, number, string, ...unknown[]];
  const valid = {} as Record<EnvField, Row[]>;
  const counts = {} as Record<EnvField, number>;
  for (const [f, key] of SERIES) {
    valid[f] = (sol[key] as Row[]).filter((r) => finiteOrNull(r[3], FILL_VALUES) !== null);
    counts[f] = valid[f].length;
  }
  const candidates = new Map<number, string>();
  for (const [f] of SERIES) for (const r of valid[f]) candidates.set(r[0], r[2]);
  const byHour = new Map<string, ObservationSlot>();
  const score = (s: ObservationSlot) => s.fields.length * 100 - Math.abs((ltstHours(s.ltst) % 1) - 0.5);
  for (const [utcMs, ltst] of [...candidates].sort((a, b) => a[0] - b[0])) {
    if (!Number.isFinite(ltstHours(ltst))) continue;
    // Key on the sol and hour ("0315 13"): a file can run a few minutes into the next sol
    const hour = ltst.replace(/:\d{2}:\d{2}$/, '');
    const slot: ObservationSlot = { utcMs, ltst, fields: SERIES.map(([f]) => f).filter((f) => nearest(valid[f], utcMs) !== null) };
    const current = byHour.get(hour);
    if (!current || score(slot) > score(current)) byHour.set(hour, slot);
  }
  const slots = [...byHour.values()].sort((a, b) => a.utcMs - b.utcMs);
  if (!slots.length) return null;
  const fromNoon = (s: ObservationSlot) => Math.abs(ltstHours(s.ltst) - 13);
  const defaultSlot = slots.reduce((b, s) => (s.fields.length > b.fields.length || (s.fields.length === b.fields.length && fromNoon(s) < fromNoon(b)) ? s : b));
  return { sol: entry.sol, file: entry.file, startUtc: entry.startUtc, stopUtc: entry.stopUtc, counts, slots, defaultSlot };
}

/** The most recent period: what the cards show until the visitor chooses another. */
export function latestPeriod(periods: ObservationPeriod[]): ObservationPeriod | null {
  return periods.reduce<ObservationPeriod | null>((b, p) => (!b || p.sol > b.sol ? p : b), null);
}

/* --------------------------------------------------------------------- loading */

const BASE = '/data/meda/';
let indexPromise: Promise<MedaIndex> | null = null;
const solPromises = new Map<string, Promise<MedaSol>>();

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const type = r.headers.get('content-type') ?? '';
  // A missing file on the dev server comes back as the HTML app shell
  if (type.includes('text/html')) throw new Error(`${url} is not available`);
  return (await r.json()) as T;
}

export function loadIndex(): Promise<MedaIndex> {
  if (!indexPromise) {
    indexPromise = getJson<MedaIndex>(`${BASE}index.json`);
    indexPromise.catch(() => (indexPromise = null));
  }
  return indexPromise;
}

export function loadSol(file: string): Promise<MedaSol> {
  let p = solPromises.get(file);
  if (!p) {
    p = getJson<MedaSol>(BASE + file);
    solPromises.set(file, p);
    p.catch(() => solPromises.delete(file));
  }
  return p;
}

/** Forget failed or cached requests, for Retry. */
export function resetCache() {
  indexPromise = null;
  solPromises.clear();
}
