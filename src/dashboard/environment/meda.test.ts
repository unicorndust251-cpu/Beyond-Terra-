// MEDA adapter: validation, unit conversion and place/time matching. Run with `npm test`.
import {
  finiteOrNull,
  latestPeriod,
  matchObservations,
  observationPeriod,
  roverCoordinate,
  toCelsius,
  toMetresPerSecond,
  toPascal,
  type MedaIndex,
  type MedaSol,
  type ObservationPeriod,
} from './meda';

export const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const near = (name: string, got: number | null | undefined, want: number, tol = 1e-9) =>
  results.push({ name, ok: typeof got === 'number' && Math.abs(got - want) <= tol, detail: `got ${got}, want ${want}` });
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });
const throws = (name: string, fn: () => unknown) => {
  try {
    fn();
    check(name, false, 'did not throw');
  } catch {
    check(name, true);
  }
};

/* --- validation --- */
check('Empty string is null (not zero)', finiteOrNull('') === null);
check('Whitespace is null', finiteOrNull('  ') === null);
check('"0" is a valid zero', finiteOrNull('0') === 0);
check('0 is a valid zero', finiteOrNull(0) === 0);
check('NaN is null', finiteOrNull(NaN) === null);
check('Infinity is null', finiteOrNull(Infinity) === null);
check('undefined / null are null', finiteOrNull(undefined) === null && finiteOrNull(null) === null);
check('A declared sentinel is null', finiteOrNull('-9999', [-9999]) === null);
check('Non-numeric text is null', finiteOrNull('nominal') === null);

/* --- units: converted only when the source unit requires it --- */
near('273.15 kelvin → 0 °C', toCelsius(273.15, 'kelvin'), 0);
near('203.22 K → −69.93 °C', toCelsius(203.22, 'K'), -69.93, 1e-9);
near('Celsius is not converted again', toCelsius(-20, 'celsius'), -20);
near('Pa kept', toPascal(761.4, 'pascal'), 761.4);
near('7.614 mbar → 761.4 Pa', toPascal(7.614, 'mbar'), 761.4, 1e-9);
near('7.614 hPa → 761.4 Pa', toPascal(7.614, 'hPa'), 761.4, 1e-9);
near('0.7614 kPa → 761.4 Pa', toPascal(0.7614, 'kPa'), 761.4, 1e-9);
near('m/s kept', toMetresPerSecond(5.2, 'meter/second'), 5.2);
near('18 km/h → 5 m/s', toMetresPerSecond(18, 'km/h'), 5, 1e-12);
throws('Unknown temperature unit is rejected', () => toCelsius(1, 'rankine'));
throws('Missing pressure unit is rejected', () => toPascal(1, null));

/* --- matching, with a synthetic sol (source units as in the real products) --- */
const index: MedaIndex = {
  version: 1,
  archive: '',
  documentation: '',
  citation: '',
  landing: { latitude: 18.44462715, longitudeEast: 77.45088572, source: '' },
  marsRadiusM: 3389500,
  rules: {},
  sols: [{ sol: 1, file: 'x', startUtc: '2021-06-01T00:00:00.000Z', stopUtc: '2021-06-01T23:00:00.000Z', lsStart: 0, lsStop: 1 }],
};
const T = Date.parse('2021-06-01T12:00:00Z');
const prod = (unitFields: Record<string, string | null>) => ({ lid: 'urn:test', version: '1', title: 'Test product', csv: 'https://x/csv', label: 'https://x/xml', startUtc: '', stopUtc: '', units: unitFields, rows: 1 });
const sol: MedaSol = {
  sol: 1,
  lsStart: 0,
  lsStop: 1,
  startUtc: '',
  stopUtc: '',
  products: {
    airTemperature: prod({ ATS_LOCAL_TEMP1: 'kelvin' }),
    groundTemperature: prod({ GROUND_TEMP: 'kelvin' }),
    pressure: prod({ BAROCAP1_PRESSURE: 'pascal', BAROCAP1_PRESSURE_UNCERTAINTY: 'pascal' }),
    wind: prod({ HORIZONTAL_WIND_SPEED: 'meter/second' }),
    ancillary: prod({}),
  },
  rejected: {},
  airTemperature: [[T - 60000, 1, '0001 12:00:00', 230.5, 229.9, 231.2]],
  // A valid zero: 273.15 K is exactly 0 °C
  groundTemperature: [[T + 120000, 2, '0001 12:02:00', 273.15, 0.4, null]],
  // Missing pressure value (blank in the source) at the only record
  pressure: [[T, 3, '0001 12:00:00', null, null]],
  // A valid zero wind speed
  windSpeed: [[T - 300000, 4, '0001 11:55:00', 0, null]],
  rover: [[T, -51.2, -71.7]],
};
const landing = { latitude: 18.44462715, longitudeEast: 77.45088572 };
const m = matchObservations(index, sol, landing, T);
check('Air temperature matched', m.airTemperatureC.state === 'ok');
if (m.airTemperatureC.state === 'ok') {
  near('Air: 230.5 K → −42.65 °C', m.airTemperatureC.reading.value, -42.65, 1e-9);
  check('Air keeps its own timestamp', m.airTemperatureC.reading.utcMs === T - 60000);
}
check('Valid zero °C ground temperature is a reading', m.surfaceTemperatureC.state === 'ok' && m.surfaceTemperatureC.reading.value === 0);
check('Ground keeps its own timestamp (different from air)', m.surfaceTemperatureC.state === 'ok' && m.surfaceTemperatureC.reading.utcMs === T + 120000);
check('Missing pressure field → unavailable, others still shown', m.pressurePa.state === 'unavailable');
check('Valid zero wind speed is a reading', m.windSpeedMs.state === 'ok' && m.windSpeedMs.reading.value === 0);

// Location: rover position from north/west offsets
const rover = roverCoordinate(index, -51.2, -71.7);
check('Rover 51 m south of the landing point', rover.latitude < landing.latitude && Math.abs((landing.latitude - rover.latitude) * (Math.PI / 180) * 3389500 - 51.2) < 0.01);
check('Rover 72 m east (negative west offset)', rover.longitudeEast > landing.longitudeEast);
const olympus = matchObservations(index, sol, { latitude: 18.65, longitudeEast: -133.8 }, T);
check('Olympus Mons: Jezero readings not applied', Object.values(olympus).every((r) => r.state === 'unavailable'));
const jezeroCentre = matchObservations(index, sol, { latitude: 18.41, longitudeEast: 77.69 }, T);
check('Jezero crater centre (~13.6 km away): applied, with its distance', jezeroCentre.airTemperatureC.state === 'ok' && Math.abs(jezeroCentre.airTemperatureC.reading.distanceKm - 13.6) < 0.5, jezeroCentre.airTemperatureC.state === 'ok' ? String(jezeroCentre.airTemperatureC.reading.distanceKm) : 'none');
// Time: more than 30 minutes from any record
const late = matchObservations(index, sol, landing, T + 3 * 3600e3);
check('3 h from any record → unavailable', Object.values(late).every((r) => r.state === 'unavailable'));
// Missing product for the sol
const noWind = matchObservations(index, { ...sol, products: { ...sol.products, wind: null } }, landing, T);
check('Product absent from the archive → unavailable with reason', noWind.windSpeedMs.state === 'unavailable' && noWind.windSpeedMs.reason.includes('not in the PDS archive'));
// A source unit change is honoured (Celsius stays Celsius)
const celsius = matchObservations(index, { ...sol, products: { ...sol.products, airTemperature: prod({ ATS_LOCAL_TEMP1: 'celsius' }) }, airTemperature: [[T, 1, '', -40, -41, -39]] }, landing, T);
check('Celsius source is not converted again', celsius.airTemperatureC.state === 'ok' && celsius.airTemperatureC.reading.value === -40);

/* --- observation periods: built from the records, independent of the astronomy clock --- */
const synthetic = observationPeriod(index.sols[0], sol)!;
check('Synthetic sol: one period with counts per measurement', synthetic.counts.airTemperatureC === 1 && synthetic.counts.pressurePa === 0 && synthetic.counts.windSpeedMs === 1);
check('Synthetic sol: a missing pressure value never counts as a record', !synthetic.slots.some((s) => s.fields.includes('pressurePa')));
check('Synthetic sol: default slot covers the three measured fields', synthetic.defaultSlot.fields.length === 3, synthetic.defaultSlot.fields.join(','));
check('A sol with no valid record gives no period', observationPeriod(index.sols[0], { ...sol, airTemperature: [], groundTemperature: [], pressure: [], windSpeed: [] }) === null);

// The bundled archive itself (public/data/meda), as the dashboard loads it. The runner executes
// this file in Node; the app's tsconfig has no Node types, so fs is loaded by name.
declare const process: { cwd(): string };
const fsModule = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync(path: string, encoding: 'utf8'): string };
const dir = `${process.cwd()}/public/data/meda/`;
const realIndex = JSON.parse(readFileSync(dir + 'index.json', 'utf8')) as MedaIndex;
const realSols = new Map(realIndex.sols.map((e) => [e.file, JSON.parse(readFileSync(dir + e.file, 'utf8')) as MedaSol]));
const periods = realIndex.sols.map((e) => observationPeriod(e, realSols.get(e.file)!)).filter((p): p is ObservationPeriod => p !== null);
check('Archive: every listed sol has a period built from its records', periods.length === realIndex.sols.length, periods.map((p) => p.sol).join(','));
const latest = latestPeriod(periods)!;
check('Archive: the automatic period is the latest sol', latest.sol === Math.max(...realIndex.sols.map((s) => s.sol)), `sol ${latest.sol}`);
const at = (p: ObservationPeriod, utc: number) => matchObservations(realIndex, realSols.get(p.file)!, realIndex.landing, utc);
const latestFields = at(latest, latest.defaultSlot.utcMs);
check(
  'Archive: latest period shows air, surface and pressure readings',
  latestFields.airTemperatureC.state === 'ok' && latestFields.surfaceTemperatureC.state === 'ok' && latestFields.pressurePa.state === 'ok',
);
check(
  'Archive: latest period has no wind product, and says so',
  latest.counts.windSpeedMs === 0 && latestFields.windSpeedMs.state === 'unavailable' && latestFields.windSpeedMs.reason.includes('not in the PDS archive'),
);
const withWind = periods.find((p) => p.slots.some((s) => s.fields.length === 4));
check('Archive: some period has a time with all four measurements', !!withWind, withWind ? `sol ${withWind.sol}` : 'none');
if (withWind) {
  const slot = withWind.slots.find((s) => s.fields.length === 4)!;
  const all = at(withWind, slot.utcMs);
  check('Archive: that time gives four readings, each with its own timestamp', Object.values(all).every((r) => r.state === 'ok'));
}
check(
  'Archive: every slot field matches a reading at that slot',
  periods.every((p) => p.slots.every((s) => {
    const r = at(p, s.utcMs);
    return s.fields.every((f) => r[f].state === 'ok');
  })),
);

/* --- the archive's fill value (999999999) is never a reading --- */
const filled = matchObservations(index, { ...sol, windSpeed: [[T, 4, '0001 12:00:00', 999999999, null]] }, landing, T);
check('Fill value 999999999 → unavailable, not a speed', filled.windSpeedMs.state === 'unavailable');
const filledPeriod = observationPeriod(index.sols[0], { ...sol, windSpeed: [[T, 4, '0001 12:00:00', 999999999, null]] })!;
check('Fill value is not counted as a record', filledPeriod.counts.windSpeedMs === 0);
const plausible: Record<string, [number, number]> = { airTemperature: [100, 330], groundTemperature: [100, 350], pressure: [100, 1500], windSpeed: [0, 60] };
check(
  'Archive: every stored value is within physical limits (K, K, Pa, m/s)',
  [...realSols.values()].every((s) => Object.entries(plausible).every(([k, [lo, hi]]) => (s[k as keyof MedaSol] as unknown as Array<[number, number, string, number | null]>).every((r) => r[3] === null || (r[3] >= lo && r[3] <= hi)))),
);
