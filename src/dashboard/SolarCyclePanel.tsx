import { useMemo, useRef } from 'react';
import { formatClock, localSolar, marsTime, SOL_SECONDS } from './science/marsTime';
import { formatDurationHours, formatEarthCountdown, marsHoursToEarthHours, nextSolarEvent, solarEvents, type SolarEvents } from './science/solarEvents';
import { preview, PREVIEW_RATES, selectedClock, usePreview } from './timeStore';

interface Props {
  /** The selected instant (live current time, or a fixed date). */
  selectedUtc: number;
  selectedMode: 'live' | 'fixed';
  latitude: number;
  longitudeEast: number;
}

/* ------------------------------------------------------------ drawing scales */
const W = 960;
const SKY_H = 250;
const HORIZON = 190; // y of 0° elevation in the sky view
const EL_SCALE = (HORIZON - 14) / 90; // px per degree above the horizon
const PAD = 26;
const xAz = (az: number) => PAD + (az / 360) * (W - 2 * PAD);
const yEl = (el: number) => HORIZON - el * EL_SCALE;
const TL_H = 120;
const TL_ZERO = 70;
const xH = (h: number) => PAD + (h / 24) * (W - 2 * PAD);
const yTl = (el: number) => TL_ZERO - el * 0.6;

/** Sky colours as a continuous function of solar elevation (not Earth clock times). */
const STOPS: Array<[number, [number, number, number], [number, number, number]]> = [
  [-18, [11, 10, 18], [24, 19, 23]],
  [-6, [24, 22, 36], [52, 36, 36]],
  [0, [48, 42, 58], [150, 98, 76]],
  [8, [92, 78, 76], [196, 146, 112]],
  [30, [118, 100, 92], [210, 168, 132]],
  [90, [128, 110, 100], [214, 178, 146]],
];
function skyAt(el: number): [string, string] {
  const e = Math.max(-18, Math.min(90, el));
  let i = 0;
  while (i < STOPS.length - 2 && e > STOPS[i + 1][0]) i++;
  const [e0, t0, b0] = STOPS[i];
  const [e1, t1, b1] = STOPS[i + 1];
  const f = (e - e0) / (e1 - e0);
  const mix = (a: number[], b: number[]) => `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
  return [mix(t0, t1), mix(b0, b1)];
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (az: number) => POINTS[Math.round(az / 22.5) % 16];

interface Solar {
  ok: true;
  t: ReturnType<typeof marsTime>;
  s: ReturnType<typeof localSolar>;
  events: SolarEvents;
  next: ReturnType<typeof nextSolarEvent>;
}

/** Every value in the panel, from ONE instant and ONE location. */
function useSolar(utcMs: number, lat: number, lon: number): Solar | { ok: false; error: string } {
  // Sol events are recomputed only when the instant leaves the sol or the place changes
  const cache = useRef<{ key: string; events: SolarEvents } | null>(null);
  return useMemo(() => {
    try {
      const t = marsTime(utcMs);
      const s = localSolar(t, lat, lon);
      if (!Number.isFinite(s.elevation) || !Number.isFinite(s.LTST)) throw new Error('non-finite solar position');
      const key = `${lat},${lon}`;
      let events = cache.current?.key === key ? cache.current.events : null;
      if (!events || utcMs < events.solStartMs || utcMs >= events.solEndMs) {
        events = solarEvents(utcMs, lat, lon);
        cache.current = { key, events };
      }
      let next: ReturnType<typeof nextSolarEvent> = null;
      const upcoming = [events.sunriseMs, events.sunsetMs].filter((m): m is number => m !== null && m > utcMs);
      if (upcoming.length) {
        const ms = Math.min(...upcoming);
        const kind = ms === events.sunriseMs ? 'sunrise' : 'sunset';
        next = { kind, utcMs: ms, ltst: kind === 'sunrise' ? events.sunriseLTST! : events.sunsetLTST!, solsAhead: 0 };
      } else next = nextSolarEvent(events.solEndMs + 1, lat, lon, 3);
      if (next && next.solsAhead === 0 && next.utcMs > events.solEndMs) next = { ...next, solsAhead: 1 };
      return { ok: true, t, s, events, next };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [utcMs, lat, lon]);
}

/**
 * The calculated day–night view. The Sun's position, the clocks, sunrise and sunset, the
 * day/night state and the countdown all come from one instant (the selected time, or the
 * accelerated preview when it is explicitly running) and one location.
 */
export default function SolarCyclePanel({ selectedUtc, selectedMode, latitude, longitudeEast }: Props) {
  const { p, utcMs: previewUtc } = usePreview();
  const inPreview = p.active;
  const utcMs = inPreview ? previewUtc : selectedUtc;
  const solar = useSolar(utcMs, latitude, longitudeEast);
  const lastX = useRef<number | null>(null);

  if (!solar.ok) {
    return (
      <section className="md-solar" aria-label="Day and night at the selected location">
        <h2>Martian day and night</h2>
        <p className="md-error" role="alert">
          The solar calculation failed ({solar.error}). No Sun position is shown.
        </p>
      </section>
    );
  }
  const { t, s, events, next } = solar;
  const night = s.elevation < 0;
  const [top, bottom] = skyAt(s.elevation);
  const az = s.azimuth;
  const sunX = az === null ? W / 2 : xAz(az);
  // Ease between once-a-second updates; jump (no easing) across the N edge or while previewing
  const smooth = !inPreview && lastX.current !== null && Math.abs(sunX - lastX.current) < 60;
  lastX.current = sunX;

  // Sun path through the sol, broken where it wraps past north
  const segments: string[] = [];
  let seg = '';
  let prevX: number | null = null;
  for (const [, el, a] of events.curve) {
    if (a === null) continue;
    const x = xAz(a);
    const y = yEl(Math.max(-14, el));
    if (prevX !== null && Math.abs(x - prevX) > W / 2) {
      segments.push(seg);
      seg = '';
    }
    seg += `${seg ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    prevX = x;
  }
  if (seg) segments.push(seg);
  const tlPath = events.curve.map(([h, el], i) => `${i ? 'L' : 'M'}${xH(h).toFixed(1)},${yTl(Math.max(-75, el)).toFixed(1)}`).join(' ');
  const solFrac = Math.min(1, Math.max(0, (utcMs - events.solStartMs) / (SOL_SECONDS * 1000)));
  const hOf = (ms: number | null) => (ms === null ? null : ((ms - events.solStartMs) / (SOL_SECONDS * 1000)) * 24);
  const rise = hOf(events.sunriseMs);
  const set = hOf(events.sunsetMs);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const isoInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);

  const sunriseText =
    events.status === 'polar-night' ? 'Sun does not rise during this sol' : events.status === 'polar-day' ? 'Sun remains above the horizon during this sol' : events.sunriseLTST !== null ? `${formatClock(events.sunriseLTST)} LTST` : 'No sunrise in this sol';
  const sunsetText =
    events.status === 'polar-day' ? 'Sun remains above the horizon during this sol' : events.status === 'polar-night' ? 'Sun does not rise during this sol' : events.sunsetLTST !== null ? `${formatClock(events.sunsetLTST)} LTST` : 'No sunset in this sol';

  return (
    <section className={`md-solar${inPreview ? ' is-preview' : ''}`} aria-label="Day and night at the selected location">
      <header className="md-solar__head">
        <div>
          <h2>Martian day and night</h2>
          <p className="md-solar__sub">
            Calculated with NASA Mars24 for this location. Idealised flat horizon: no terrain, no shadows, no refraction.
          </p>
        </div>
        <div className="md-solar__badges">
          <span className={`md-mode-badge${inPreview ? ' is-preview' : ''}`}>
            {inPreview ? 'Accelerated Preview' : selectedMode === 'live' ? 'Current time · live' : 'Selected date'}
          </span>
          <p className={`md-solar__state${night ? ' is-night' : ''}`} role="status">
            {night ? 'Night' : 'Day'}
          </p>
        </div>
      </header>

      {/* Sky view: direction across, elevation up */}
      <svg className="md-solar__svg" viewBox={`0 0 ${W} ${SKY_H}`} role="img" aria-label={`Sun ${night ? 'below the horizon' : 'in the sky'}: elevation ${s.elevation.toFixed(1)} degrees${az !== null ? `, azimuth ${az.toFixed(0)} degrees (${compass(az)})` : ''}`}>
        <defs>
          <linearGradient id="md-sky-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: top, transition: reduced ? undefined : 'stop-color 1s linear' }} />
            <stop offset="1" style={{ stopColor: bottom, transition: reduced ? undefined : 'stop-color 1s linear' }} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height={HORIZON} fill="url(#md-sky-grad)" />
        <rect x="0" y={HORIZON} width={W} height={SKY_H - HORIZON} fill="#2a201d" />
        {[30, 60].map((e) => (
          <g key={e}>
            <line x1={PAD} x2={W - PAD} y1={yEl(e)} y2={yEl(e)} stroke="rgba(243,229,220,0.14)" strokeDasharray="3 6" />
            <text x={W - PAD} y={yEl(e) - 4} textAnchor="end" className="md-svg-label">
              +{e}°
            </text>
          </g>
        ))}
        <line x1="0" x2={W} y1={HORIZON} y2={HORIZON} stroke="#8d756e" strokeWidth="1.5" />
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="rgba(232,194,173,0.55)" strokeWidth="1.6" strokeDasharray="4 4" />
        ))}
        {[0, 90, 180, 270, 360].map((a, i) => (
          <text key={a} x={xAz(a)} y={HORIZON + 22} textAnchor="middle" className="md-svg-label md-svg-label--dir">
            {['N', 'E', 'S', 'W', 'N'][i]}
          </text>
        ))}
        <text x={PAD} y={HORIZON - 6} className="md-svg-label">
          horizon 0°
        </text>
        {!night && az !== null && (
          <g className="md-sun" style={{ transform: `translate(${sunX}px, ${yEl(s.elevation)}px)`, transition: smooth && !reduced ? 'transform 1s linear' : 'none' }}>
            <circle r="24" fill="url(#md-sun-glow)" />
            <circle r="8.5" fill="#fff4e0" />
          </g>
        )}
        <defs>
          <radialGradient id="md-sun-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff4e0" />
            <stop offset="0.45" stopColor="#f4c58c" />
            <stop offset="1" stopColor="rgba(244,197,140,0)" />
          </radialGradient>
        </defs>
        {night && (
          <text x={W / 2} y={HORIZON + 40} textAnchor="middle" className="md-svg-label md-svg-label--event">
            Sun below the horizon ({s.elevation.toFixed(1)}°){az !== null ? `, toward ${compass(az)}` : ''}
          </text>
        )}
      </svg>
      <p className="md-note">
        Sky view: compass direction across (azimuth clockwise from north), elevation up. The dashed line is the Sun’s calculated path this
        sol.
      </p>

      {/* Sol timeline: elevation through the sol */}
      <svg className="md-solar__tl" viewBox={`0 0 ${W} ${TL_H}`} role="img" aria-label="Solar elevation through the sol">
        <line x1={PAD} x2={W - PAD} y1={TL_ZERO} y2={TL_ZERO} stroke="#8d756e" />
        <path d={tlPath} fill="none" stroke="rgba(232,194,173,0.75)" strokeWidth="1.6" />
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={xH(h)} y={TL_H - 6} textAnchor="middle" className="md-svg-label">
            {String(h).padStart(2, '0')}:00
          </text>
        ))}
        {rise !== null && <line x1={xH(rise)} x2={xH(rise)} y1={TL_ZERO - 10} y2={TL_ZERO + 10} stroke="#e8c2ad" strokeWidth="2" />}
        {set !== null && <line x1={xH(set)} x2={xH(set)} y1={TL_ZERO - 10} y2={TL_ZERO + 10} stroke="#e8c2ad" strokeWidth="2" />}
        <line x1={xH(solFrac * 24)} x2={xH(solFrac * 24)} y1="4" y2={TL_H - 20} stroke="rgba(243,229,220,0.55)" />
        <circle cx={xH(solFrac * 24)} cy={yTl(Math.max(-75, s.elevation))} r="4.5" fill={night ? '#6b5a52' : '#fff4e0'} />
      </svg>
      <p className="md-note">Sol timeline: hours since local midnight (local true solar time), with sunrise and sunset marked.</p>

      <dl className="md-events md-num">
        <div>
          <dt>Local true solar time</dt>
          <dd>{formatClock(s.LTST)} LTST</dd>
        </div>
        <div>
          <dt>Local mean solar time</dt>
          <dd>{formatClock(s.LMST)} LMST</dd>
        </div>
        <div>
          <dt>Solar elevation</dt>
          <dd>{s.elevation.toFixed(1)}°</dd>
        </div>
        <div>
          <dt>Direction (azimuth)</dt>
          <dd>{az === null ? 'Overhead' : `${az.toFixed(0)}° · ${compass(az)}`}</dd>
        </div>
        <div>
          <dt>Sunrise</dt>
          <dd>{sunriseText}</dd>
        </div>
        <div>
          <dt>Sunset</dt>
          <dd>{sunsetText}</dd>
        </div>
        <div>
          <dt>Day length</dt>
          <dd>
            {formatDurationHours(events.dayMarsHours)} Mars clock <small>= {formatDurationHours(marsHoursToEarthHours(events.dayMarsHours))} Earth</small>
          </dd>
        </div>
        <div>
          <dt>Night length</dt>
          <dd>
            {formatDurationHours(events.nightMarsHours)} Mars clock <small>= {formatDurationHours(marsHoursToEarthHours(events.nightMarsHours))} Earth</small>
          </dd>
        </div>
        <div>
          <dt>{next ? `Next ${next.kind}` : 'Next sunrise or sunset'}</dt>
          <dd>
            {next ? (
              <>
                in {formatEarthCountdown(next.utcMs - utcMs)} <small>Earth time · {formatClock(next.ltst)} LTST{next.solsAhead > 0 ? `, ${next.solsAhead === 1 ? 'next sol' : `${next.solsAhead} sols ahead`}` : ''}</small>
              </>
            ) : (
              'None in the next 3 sols'
            )}
          </dd>
        </div>
        <div>
          <dt>Solar noon</dt>
          <dd>
            {formatClock(events.noonLTST)} LTST · {events.maxElevation.toFixed(1)}°
          </dd>
        </div>
        <div>
          <dt>Solar longitude</dt>
          <dd>Ls {t.Ls.toFixed(1)}°</dd>
        </div>
        <div>
          <dt>{inPreview ? 'Preview time (UTC)' : 'Time (UTC)'}</dt>
          <dd>{new Date(utcMs).toISOString().replace('T', ' ').slice(0, 19)}</dd>
        </div>
      </dl>

      {inPreview ? (
        <div className="md-solar__controls" aria-label="Accelerated preview controls">
          {p.playing ? (
            <button type="button" className="md-btn" onClick={preview.pause}>
              Pause
            </button>
          ) : (
            <button type="button" className="md-btn md-btn--primary" onClick={preview.play}>
              Play
            </button>
          )}
          <label className="md-field">
            <span>Speed</span>
            <select value={p.rate} onChange={(e) => preview.setRate(Number(e.target.value))}>
              {PREVIEW_RATES.map((r) => (
                <option key={r.label} value={r.rate}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="md-field md-field--grow">
            <span>Time of sol (preview)</span>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(solFrac * 1000)}
              aria-valuetext={`Preview at ${formatClock(s.LTST)} LTST`}
              onChange={(e) => preview.seek(events.solStartMs + (Number(e.target.value) / 1000) * SOL_SECONDS * 1000)}
            />
          </label>
          <button type="button" className="md-btn md-btn--primary" onClick={preview.exit}>
            Return to Current Time
          </button>
        </div>
      ) : (
        <div className="md-solar__controls">
          <label className="md-field">
            <span>Date and time (UTC)</span>
            <input type="datetime-local" value={isoInput(selectedUtc)} onChange={(e) => e.target.value && selectedClock.setTime(Date.parse(`${e.target.value}:00Z`))} />
          </label>
          {selectedMode === 'fixed' && (
            <button type="button" className="md-btn" onClick={selectedClock.live}>
              Return to Current Time
            </button>
          )}
          <button type="button" className="md-btn md-btn--primary" onClick={() => preview.start(events.solStartMs, events.solEndMs)}>
            Preview One Sol
          </button>
        </div>
      )}
      <p className="md-solar__mode" role="status">
        {inPreview
          ? `Accelerated Preview: ${PREVIEW_RATES.find((r) => r.rate === p.rate)?.label ?? `${p.rate}×`}. This does not change the current time shown elsewhere.`
          : selectedMode === 'live'
            ? 'Real time: the Sun moves as slowly as it does on Mars. Recalculated every second.'
            : 'Showing the selected date and time.'}
      </p>
      <p className="md-note">
        A Mars clock hour is 1/24 sol = 1.0275 Earth hours (a sol is 24 h 39 min 35 s of Earth time). Countdowns are in Earth time.
      </p>
    </section>
  );
}
