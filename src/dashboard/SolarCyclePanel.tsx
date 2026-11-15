import { useMemo } from 'react';
import { formatClock, localSolar, marsTime, SOL_SECONDS } from './science/marsTime';
import { formatDurationHours, marsHoursToEarthHours, type SolarEvents } from './science/solarEvents';
import { clock, PLAYBACK_RATES, type SimClock } from './timeStore';

interface Props {
  utcMs: number;
  sim: SimClock;
  latitude: number;
  longitudeEast: number;
  events: SolarEvents;
}

const W = 960;
const H = 260;
const PAD_X = 28;
const HORIZON_Y = 170;
/** Vertical scale: degrees of elevation per pixel. */
const deg = (e: number) => HORIZON_Y - e * 1.55;
const xOf = (ltst: number) => PAD_X + (ltst / 24) * (W - 2 * PAD_X);

/** Sky colour from the Sun's elevation: night, twilight, butterscotch day. */
function skyColours(e: number): [string, string] {
  if (e < -18) return ['#0b0a12', '#191418'];
  if (e < -6) return ['#14121c', '#2a1f22'];
  if (e < 0) return ['#22202e', '#5b3d33'];
  if (e < 10) return ['#3b3340', '#a8705a'];
  return ['#6b5a52', '#c99a78'];
}

/**
 * The day–night centrepiece: the Sun's calculated elevation through the sol (Mars24), on a
 * flat horizon, with the current instant, sunrise, sunset and solar noon. A solar-path
 * visualisation, not a picture of the terrain or its shadows.
 */
export default function SolarCyclePanel({ utcMs, sim, latitude, longitudeEast, events }: Props) {
  const t = useMemo(() => marsTime(utcMs), [utcMs]);
  const s = useMemo(() => localSolar(t, latitude, longitudeEast), [t, latitude, longitudeEast]);
  const solFraction = Math.min(1, Math.max(0, (utcMs - events.solStartMs) / (SOL_SECONDS * 1000)));
  const curveX = solFraction * 24;
  const night = s.elevation < 0;
  const [skyTop, skyBottom] = skyColours(s.elevation);
  const path = events.curve.map(([h, e], i) => `${i ? 'L' : 'M'}${xOf(h).toFixed(1)},${Math.max(4, deg(e)).toFixed(1)}`).join(' ');
  const sunX = xOf(curveX);
  const sunY = Math.max(10, deg(s.elevation));
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ltstOfEvent = (ms: number | null) => (ms === null ? null : ((ms - events.solStartMs) / (SOL_SECONDS * 1000)) * 24);
  const rise = ltstOfEvent(events.sunriseMs);
  const set = ltstOfEvent(events.sunsetMs);
  const noon = ltstOfEvent(events.noonMs)!;
  const scrub = (v: number) => clock.setTime(events.solStartMs + (v / 1000) * SOL_SECONDS * 1000);
  const toLocalInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);

  return (
    <section className="md-solar" aria-label="Day and night at the selected location">
      <header className="md-solar__head">
        <div>
          <h2>Martian day and night</h2>
          <p className="md-solar__sub">
            Solar-path visualisation: the Sun’s calculated elevation through this sol (NASA Mars24), on a flat horizon. Terrain shadows
            and refraction are not modelled.
          </p>
        </div>
        <p className={`md-solar__state${night ? ' is-night' : ''}`} role="status">
          {night ? 'Night' : 'Day'} · Sun {s.elevation >= 0 ? '+' : ''}
          {s.elevation.toFixed(1)}° {s.azimuth !== null ? `· azimuth ${s.azimuth.toFixed(0)}°` : ''}
        </p>
      </header>

      <svg className="md-solar__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sun at ${s.elevation.toFixed(1)} degrees elevation, local true solar time ${formatClock(s.LTST)}`}>
        <defs>
          <linearGradient id="md-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={skyTop} />
            <stop offset="1" stopColor={skyBottom} />
          </linearGradient>
          <radialGradient id="md-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff4e0" />
            <stop offset="0.45" stopColor="#f4c58c" />
            <stop offset="1" stopColor="rgba(244,197,140,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={W} height={HORIZON_Y} fill="url(#md-sky)" style={reduced ? undefined : { transition: 'fill 0.6s' }} />
        <rect x="0" y={HORIZON_Y} width={W} height={H - HORIZON_Y} fill="#2a201d" />
        {/* daylight band */}
        {rise !== null && set !== null && set > rise && (
          <rect x={xOf(rise)} y={HORIZON_Y} width={xOf(set) - xOf(rise)} height="6" fill="rgba(214,163,139,0.35)" />
        )}
        {/* elevation reference lines */}
        {[30, 60].map((e) => (
          <g key={e}>
            <line x1={PAD_X} x2={W - PAD_X} y1={deg(e)} y2={deg(e)} stroke="rgba(243,229,220,0.12)" strokeDasharray="3 6" />
            <text x={W - PAD_X} y={deg(e) - 4} textAnchor="end" className="md-svg-label">
              +{e}°
            </text>
          </g>
        ))}
        <line x1="0" x2={W} y1={HORIZON_Y} y2={HORIZON_Y} stroke="#8d756e" strokeWidth="1.5" />
        <text x={PAD_X} y={HORIZON_Y - 6} className="md-svg-label">
          horizon 0°
        </text>
        <path d={path} fill="none" stroke="rgba(232,194,173,0.75)" strokeWidth="2" strokeDasharray="1 0" />
        {/* hour ticks */}
        {[0, 6, 12, 18, 24].map((h) => (
          <g key={h}>
            <line x1={xOf(h)} x2={xOf(h)} y1={HORIZON_Y} y2={HORIZON_Y + 8} stroke="#8d756e" />
            <text x={xOf(h)} y={HORIZON_Y + 24} textAnchor="middle" className="md-svg-label">
              {String(h).padStart(2, '0')}:00
            </text>
          </g>
        ))}
        {rise !== null && (
          <g>
            <line x1={xOf(rise)} x2={xOf(rise)} y1={HORIZON_Y - 14} y2={HORIZON_Y + 8} stroke="#e8c2ad" />
            <text x={xOf(rise)} y={HORIZON_Y + 44} textAnchor="middle" className="md-svg-label md-svg-label--event">
              sunrise
            </text>
          </g>
        )}
        {set !== null && (
          <g>
            <line x1={xOf(set)} x2={xOf(set)} y1={HORIZON_Y - 14} y2={HORIZON_Y + 8} stroke="#e8c2ad" />
            <text x={xOf(set)} y={HORIZON_Y + 44} textAnchor="middle" className="md-svg-label md-svg-label--event">
              sunset
            </text>
          </g>
        )}
        <line x1={xOf(noon)} x2={xOf(noon)} y1={Math.max(4, deg(events.maxElevation))} y2={HORIZON_Y} stroke="rgba(232,194,173,0.3)" strokeDasharray="2 4" />
        {/* current instant */}
        <line x1={sunX} x2={sunX} y1="0" y2={H} stroke="rgba(243,229,220,0.35)" />
        {night ? (
          <circle cx={sunX} cy={Math.min(H - 12, sunY)} r="7" fill="#6b5a52" stroke="#e8c2ad" strokeWidth="1.5" />
        ) : (
          <>
            <circle cx={sunX} cy={sunY} r="26" fill="url(#md-sun)" />
            <circle cx={sunX} cy={sunY} r="9" fill="#fff4e0" />
          </>
        )}
      </svg>

      <div className="md-solar__controls">
        {sim.playing ? (
          <button type="button" className="md-btn" onClick={clock.pause}>
            Pause
          </button>
        ) : (
          <button type="button" className="md-btn md-btn--primary" onClick={clock.play}>
            Play
          </button>
        )}
        <button type="button" className="md-btn" onClick={clock.now}>
          Now
        </button>
        <button type="button" className="md-btn" onClick={() => clock.setTime(events.solStartMs)}>
          Reset to sol start
        </button>
        <label className="md-field">
          <span>Speed</span>
          <select value={sim.rate} onChange={(e) => clock.setRate(Number(e.target.value))}>
            {PLAYBACK_RATES.map((r) => (
              <option key={r.label} value={r.rate}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="md-field">
          <span>UTC</span>
          <input type="datetime-local" value={toLocalInput(utcMs)} onChange={(e) => e.target.value && clock.setTime(Date.parse(`${e.target.value}:00Z`))} />
        </label>
        <label className="md-field md-field--grow">
          <span>Time of sol</span>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(solFraction * 1000)}
            aria-valuetext={`Local true solar time ${formatClock(s.LTST)}`}
            onChange={(e) => scrub(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="md-solar__mode" role="status">
        {sim.live ? 'Showing the current time (live).' : sim.playing && sim.rate !== 1 ? `Accelerated simulation: ${PLAYBACK_RATES.find((r) => r.rate === sim.rate)?.label ?? `${sim.rate}×`}.` : sim.playing ? 'Simulation running at real time.' : 'Simulation paused at the selected time.'}
      </p>

      <dl className="md-events mp-num">
        <div>
          <dt>Sunrise (LTST)</dt>
          <dd>{events.status === 'polar-night' ? 'Sun does not rise during this sol' : events.sunriseLTST !== null ? formatClock(events.sunriseLTST) : events.status === 'polar-day' ? 'Sun remains above the horizon during this sol' : 'No sunrise in this sol'}</dd>
        </div>
        <div>
          <dt>Sunset (LTST)</dt>
          <dd>{events.status === 'polar-day' ? 'Sun remains above the horizon during this sol' : events.sunsetLTST !== null ? formatClock(events.sunsetLTST) : events.status === 'polar-night' ? 'Sun does not rise during this sol' : 'No sunset in this sol'}</dd>
        </div>
        <div>
          <dt>Solar noon (LTST)</dt>
          <dd>
            {formatClock(events.noonLTST)} · {events.maxElevation.toFixed(1)}°
          </dd>
        </div>
        <div>
          <dt>Day length</dt>
          <dd>
            {formatDurationHours(events.dayMarsHours)} Mars <small>({formatDurationHours(marsHoursToEarthHours(events.dayMarsHours))} Earth)</small>
          </dd>
        </div>
        <div>
          <dt>Night length</dt>
          <dd>
            {formatDurationHours(events.nightMarsHours)} Mars <small>({formatDurationHours(marsHoursToEarthHours(events.nightMarsHours))} Earth)</small>
          </dd>
        </div>
        <div>
          <dt>Now</dt>
          <dd>{night ? 'Night' : 'Day'}</dd>
        </div>
      </dl>
      <p className="md-note">
        Sunrise and sunset: the Sun’s centre crossing 0° on a flat horizon, found numerically through the sol. A Mars hour is 1/24 sol =
        1.0275 Earth hours (a sol is 24 h 39 min 35 s of Earth time).
      </p>
    </section>
  );
}
