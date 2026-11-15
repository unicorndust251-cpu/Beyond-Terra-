// Scientific engine tests. Run with `npm test` (scripts/run-tests.mjs).
import { formatClock, localSolar, marsTime, planetographicLatitude, ttMinusUtc } from './marsTime';
import { celsiusToFahrenheit, kelvinToCelsius, martianSeason, paToKPa, paToMbar, weightNewtons, windFromDirection, windSpeed } from './seasonsAndUnits';
import { formatDurationHours, formatEarthCountdown, marsHoursToEarthHours, nextSolarEvent, solarEvents } from './solarEvents';

export const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const near = (name: string, got: number, want: number, tol: number) =>
  results.push({ name, ok: Math.abs(got - want) <= tol, detail: `got ${got}, NASA ${want}, tol ${tol}` });
const truthy = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });

/* --- NASA Mars24 worked example 1: 2000-01-06 00:00 UTC, 0° W, 0° N (planetographic) --- */
{
  const t = marsTime(947116800000);
  near('Ex1 A-2 JD(UT)', t.jdUT, 2451549.5, 1e-6);
  near('Ex1 A-4 TT−UTC (s)', t.ttMinusUtc, 64.184, 1e-9);
  near('Ex1 A-5 JD(TT)', t.jdTT, 2451549.50074, 1e-5);
  near('Ex1 A-6 ΔtJ2000', t.dtJ2000, 4.50074, 1e-5);
  near('Ex1 B-1 M', t.M, 21.74558, 1e-4);
  near('Ex1 B-2 αFMS', t.alphaFMS, 272.74566, 1e-4);
  near('Ex1 B-3 PBS', t.PBS, 0.00142, 1e-5);
  near('Ex1 B-4 ν−M', t.nuMinusM, 4.44193, 1e-4);
  near('Ex1 B-5 Ls', t.Ls, 277.18758, 1e-4);
  near('Ex1 C-1 EOT (deg)', t.EOT, -5.18774, 1e-4);
  near('Ex1 C-2 MST (h)', t.MST, 23.99425, 1e-5);
  near('Ex1 C-5 subsolar lon', t.subsolarLonWest, 174.726, 1e-3);
  near('Ex1 D-1 declination', t.declination, -25.22825, 1e-4);
  near('Ex1 D-2 distance (AU)', t.heliocentricAU, 1.39358, 1e-5);
  const s = localSolar(t, 0, 0, { planetographic: true });
  near('Ex1 C-3 LMST (h)', s.LMST, 23.99425, 1e-5);
  near('Ex1 C-4 LTST (h)', s.LTST, 23.6484, 1e-4);
  truthy('Ex1 MST clock 23:59:39', formatClock(t.MST) === '23:59:39', formatClock(t.MST));
  truthy('Ex1 LTST clock 23:38:54', formatClock(s.LTST) === '23:38:54', formatClock(s.LTST));
  near('Ex1 D-5 zenith angle', 90 - s.elevation, 154.26182, 1e-3);
  near('Ex1 D-6 azimuth', s.azimuth ?? NaN, 191.03905, 1e-3);
}

/* --- NASA worked example 2: Spirit landing site, 184.702° W (= 175.298° E), −14.640° (planetographic) --- */
{
  const t = marsTime(1073137591000);
  near('Ex2 A-2 JD(UT)', t.jdUT, 2453008.07397, 1e-5);
  near('Ex2 A-6 ΔtJ2000', t.dtJ2000, 1463.07471, 1e-5);
  near('Ex2 B-1 M (wrapped)', t.M, 66.06858, 1e-4);
  near('Ex2 B-2 αFMS (wrapped)', t.alphaFMS, 317.09457, 1e-4);
  near('Ex2 B-3 PBS', t.PBS, 0.01614, 1e-5);
  near('Ex2 B-4 ν−M', t.nuMinusM, 10.22959, 1e-4);
  near('Ex2 B-5 Ls', t.Ls, 327.32416, 1e-4);
  near('Ex2 C-1 EOT', t.EOT, -12.77553, 1e-4);
  near('Ex2 C-2 MST', t.MST, 13.16537, 1e-5);
  // NASA prints −13.42065°, but its own D-1 formula applied to its own printed Ls (327.32416°)
  // gives −13.42040°: the published example is inconsistent by 0.00025°. Example 1 agrees with
  // the formula to 1e-5°, so the formula value is used here, and NASA's within 3e-4°.
  near('Ex2 D-1 declination (= D-1 formula on NASA Ls)', t.declination, -13.4204, 1e-4);
  near('Ex2 D-1 declination vs NASA printed value', t.declination, -13.42065, 3e-4);
  near('Ex2 D-2 distance', t.heliocentricAU, 1.47767, 1e-5);
  const s = localSolar(t, -14.64, 360 - 184.702, { planetographic: true });
  near('Ex2 C-3 LMST', s.LMST, 0.8519, 1e-4);
  near('Ex2 C-4 LTST', s.LTST, 0.00025, 1e-4);
  near('Ex2 D-5 zenith angle', 90 - s.elevation, 151.93895, 1e-3);
  near('Ex2 D-6 azimuth', s.azimuth ?? NaN, 179.99383, 1e-3);
}

/* --- conventions and edge cases --- */
{
  truthy('TT−UTC after 2017 = 69.184 s', ttMinusUtc(Date.parse('2026-11-15T00:00:00Z')) === 69.184);
  const t = marsTime(Date.parse('2026-11-15T12:00:00Z'));
  const a = localSolar(t, 10, 0);
  const b = localSolar(t, 10, 360);
  const c = localSolar(t, 10, 90);
  near('Longitude 0° and 360° give the same LMST', a.LMST, b.LMST, 1e-9);
  near('90° east is 6 h later (LMST)', ((c.LMST - a.LMST + 24) % 24), 6, 1e-9);
  near('LTST − LMST = EOT/15', ((a.LTST - a.LMST + 36) % 24) - 12, t.EOT / 15, 1e-9);
  near('Planetographic latitude (45° → ~45.34°)', planetographicLatitude(45), 45.3377, 1e-3);
  truthy('Planetographic latitude keeps the equator', planetographicLatitude(0) === 0);
  const neg = localSolar(t, -30, 120);
  truthy('Negative latitude gives a finite elevation', Number.isFinite(neg.elevation));
}

/* --- solar events --- */
{
  // Jezero at an arbitrary date: a normal sol, noon near 12:00 LTST, day + night = 24 Mars hours
  const ev = solarEvents(Date.parse('2026-11-15T12:00:00Z'), 18.41, 77.69);
  truthy('Jezero: sunrise and sunset found', ev.status === 'normal' && ev.sunriseLTST !== null && ev.sunsetLTST !== null, JSON.stringify([ev.sunriseLTST, ev.sunsetLTST]));
  near('Jezero: solar noon at ~12:00 LTST', ev.noonLTST, 12, 0.02);
  near('Jezero: sunrise/sunset symmetric about noon', (ev.sunriseLTST! + ev.sunsetLTST!) / 2, 12, 0.05);
  near('Jezero: day + night = 24 Mars hours', ev.dayMarsHours + ev.nightMarsHours, 24, 1e-9);
  near('Jezero: day length matches the sunset − sunrise interval', ev.dayMarsHours, ev.sunsetLTST! - ev.sunriseLTST!, 0.05);
  const at = (ms: number) => localSolar(marsTime(ms), 18.41, 77.69).elevation;
  near('Elevation ≈ 0° at sunrise', at(ev.sunriseMs!), 0, 0.01);
  near('Elevation ≈ 0° at sunset', at(ev.sunsetMs!), 0, 0.01);
  truthy('Noon is the highest point', ev.maxElevation >= Math.max(...ev.curve.map(([, e]) => e)) - 1e-6);

  // Equator at equinox (Ls ≈ 0): day length ≈ 12 Mars hours
  // Find an instant near Ls = 0 by scanning one Mars year
  let ms = Date.parse('2026-01-01T00:00:00Z');
  let best = { ms, d: 999 };
  for (let i = 0; i < 700; i++, ms += 86400000) {
    const L = marsTime(ms).Ls;
    const d = Math.min(L, 360 - L);
    if (d < best.d) best = { ms, d };
  }
  const eq = solarEvents(best.ms, 0, 0);
  near('Equator at equinox: ~12 h of daylight', eq.dayMarsHours, 12, 0.15);

  // Polar day / night: north polar cap at northern summer and winter solstice
  const solstice = (target: number) => {
    let m = Date.parse('2026-01-01T00:00:00Z');
    let b = { m, d: 999 };
    for (let i = 0; i < 700; i++, m += 86400000) {
      const L = marsTime(m).Ls;
      const d = Math.abs(((L - target + 540) % 360) - 180);
      if (d < b.d) b = { m, d };
    }
    return b.m;
  };
  const summer = solarEvents(solstice(90), 85, 0);
  const winter = solarEvents(solstice(270), 85, 0);
  truthy('85° N at northern summer solstice: polar day', summer.status === 'polar-day' && summer.dayMarsHours === 24, summer.status);
  truthy('85° N at northern winter solstice: polar night', winter.status === 'polar-night' && winter.dayMarsHours === 0, winter.status);
  truthy('Polar day has no sunrise or sunset', summer.sunriseMs === null && summer.sunsetMs === null);
}

/* --- seasons and units --- */
{
  truthy('Ls 42.3, 18° N → Northern Spring', martianSeason(42.3, 18).season === 'Spring' && martianSeason(42.3, 18).hemisphere === 'Northern');
  truthy('Ls 42.3, 14° S → Southern Autumn', martianSeason(42.3, -14).season === 'Autumn');
  truthy('Ls 100 north summer / south winter', martianSeason(100, 1).season === 'Summer' && martianSeason(100, -1).season === 'Winter');
  truthy('Ls 359.9 → Northern Winter', martianSeason(359.9, 5).season === 'Winter');
  truthy('Equator flagged as a convention', martianSeason(10, 0).equatorConvention);
  near('273.15 K = 0 °C', kelvinToCelsius(273.15), 0, 1e-12);
  near('−60 °C = −76 °F', celsiusToFahrenheit(-60), -76, 1e-12);
  near('610 Pa = 0.61 kPa', paToKPa(610), 0.61, 1e-12);
  near('610 Pa = 6.1 mbar', paToMbar(610), 6.1, 1e-12);
  near('10 kg → 37.1 N', weightNewtons(10), 37.1, 1e-9);
  near('Wind speed 3-4-5', windSpeed(3, 4), 5, 1e-12);
  near('Wind from the west (blowing east) → 270°', windFromDirection(5, 0), 270, 1e-9);
  near('Wind from the north (blowing south) → 0°', windFromDirection(0, -5) % 360, 0, 1e-9);
  near('24 Mars hours = 24.6598 Earth hours', marsHoursToEarthHours(24), 24.659790041, 1e-6);
  truthy('Duration format', formatDurationHours(12.5) === '12 h 30 min', formatDurationHours(12.5));
}

/* --- cross-check against NASA's own processing: the MEDA labels state Ls at each product's start --- */
{
  const labelled: Array<[string, number]> = [
    ['2021-05-31T22:23:00.282Z', 52.734], // sol 100, CAL_ATS label
    ['2022-07-16T22:17:59.706Z', 267.272], // sol 500
    ['2023-12-12T16:11:40.611Z', 163.071], // sol 1000
    ['2026-05-13T06:57:14.732Z', 281.325], // sol 1859
  ];
  for (const [iso, ls] of labelled) near(`Ls at ${iso.slice(0, 10)} matches the MEDA label`, marsTime(Date.parse(iso)).Ls, ls, 0.01);
}

/* --- next sunrise / sunset (countdowns) --- */
{
  const lat = 18.41;
  const lon = 77.69;
  const ev = solarEvents(Date.parse('2026-11-15T12:00:00Z'), lat, lon);
  const noon = ev.noonMs;
  const nAtNoon = nextSolarEvent(noon, lat, lon);
  truthy('At solar noon the next event is sunset, this sol', nAtNoon?.kind === 'sunset' && Math.abs(nAtNoon.utcMs - ev.sunsetMs!) < 1000 && nAtNoon.solsAhead === 0, JSON.stringify(nAtNoon));
  const afterSunset = ev.sunsetMs! + 60000;
  const nNight = nextSolarEvent(afterSunset, lat, lon);
  truthy('After sunset the next event is sunrise on the NEXT sol', nNight?.kind === 'sunrise' && nNight.utcMs > ev.solEndMs && nNight.solsAhead >= 1, JSON.stringify(nNight));
  near('Next sunrise is about one sol after this one', (nNight!.utcMs - ev.sunriseMs!) / 1000, 88775.244, 120);
  const beforeRise = ev.sunriseMs! - 3600e3;
  const nMorning = nextSolarEvent(beforeRise, lat, lon);
  truthy('Before dawn the next event is this sunrise', nMorning?.kind === 'sunrise' && Math.abs(nMorning.utcMs - ev.sunriseMs!) < 1000);
  truthy('Countdown format (Earth time)', formatEarthCountdown(3 * 3600e3 + 5 * 60e3) === '3 h 05 min' && formatEarthCountdown(65e3) === '1 min 05 s');
  // Polar night: nothing for several sols
  let m = Date.parse('2026-01-01T00:00:00Z');
  let winter = { m, d: 999 };
  for (let i = 0; i < 700; i++, m += 86400000) {
    const L = marsTime(m).Ls;
    const d = Math.abs(((L - 270 + 540) % 360) - 180);
    if (d < winter.d) winter = { m, d };
  }
  truthy('85° N in polar night: no sunrise in the next 3 sols', nextSolarEvent(winter.m, 85, 0, 3) === null);
  // Sun direction: Jezero mid-morning has the Sun in the eastern sky (azimuth 0–180°)
  const morning = localSolar(marsTime(ev.sunriseMs! + 2 * 3600e3), lat, lon);
  truthy('Morning Sun is in the east (azimuth 0–180°)', morning.azimuth! > 0 && morning.azimuth! < 180, String(morning.azimuth));
  const afternoon = localSolar(marsTime(ev.sunsetMs! - 2 * 3600e3), lat, lon);
  truthy('Afternoon Sun is in the west (azimuth 180–360°)', afternoon.azimuth! > 180 && afternoon.azimuth! < 360, String(afternoon.azimuth));
  // Southern location: noon Sun is in the north when the Sun is north of the observer
  const south = solarEvents(Date.parse('2026-11-15T12:00:00Z'), -45, 0);
  const sNoon = localSolar(marsTime(south.noonMs), -45, 0);
  truthy('At 45° S the noon Sun is due north', Math.abs(((sNoon.azimuth! + 180) % 360) - 180) < 2, String(sNoon.azimuth));
}
