// MEDA adapter: validation, unit conversion and place/time matching. Run with `npm test`.
import { finiteOrNull, matchObservations, roverCoordinate, toCelsius, toMetresPerSecond, toPascal, type MedaIndex, type MedaSol } from './meda';

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
